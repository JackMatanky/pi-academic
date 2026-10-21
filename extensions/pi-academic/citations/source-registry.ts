import type { JsonObject, JsonValue } from "../../lib/schema.js";

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

import { Type } from "typebox";

import {
  resolveInside,
  writeFileAtomic,
  withFileLock,
} from "../../lib/fs-safe.js";
import {
  isValid,
  JsonObjectSchema,
  parseJsonText,
  parseWith,
} from "../../lib/schema.js";
import {
  citationAssetPaths,
  writeProjectTextFile,
  type CitationAssetPaths,
} from "../core/project-files.js";
import { parseBibEntries } from "../parsers/bibtex.js";
import {
  extractDocument,
  type ExtractedDocument,
} from "../parsers/documents.js";
import { markResearchNotesStale } from "../research/notes.js";
import {
  normalizeSourceCacheRecord,
  StoredLocalSourceSchema,
  stringField,
  type LocalSourceRecord,
} from "./source-records.js";

/**
 * File extensions accepted by local source ingestion.
 */
const SUPPORTED_SOURCE_EXTENSIONS = new Set([".pdf", ".docx", ".md", ".txt"]);

/**
 * Result payload written by local folder source ingestion.
 */
export interface SourceIngestionResult {
  ok: boolean;
  sourceDirectory: string;
  sourcesPath: string;
  bibliographyPath: string;
  count: number;
  sources: LocalSourceRecord[];
  errors: Array<{ path: string; error: string }>;
}

/**
 * Result payload for copying current citation caches beside an article.
 */
export interface CitationSnapshotResult extends CitationAssetPaths {
  ok: boolean;
  copied: string[];
  missing: string[];
}

/**
 * Builds a BibTeX-safe citekey prefix from source metadata.
 *
 * @param value - Raw value to parse or normalize.
 */
function citeKeyBase(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "source"
  ).slice(0, 48);
}

/**
 * Finds the first non-heading content line for generated local source titles.
 *
 * @param text - Input text to process.
 */
function firstContentLine(text: string): string | null {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^#+\s*/, "").trim();

    if (line) return line.slice(0, 140);
  }

  return null;
}

/**
 * Extracts a plausible publication year from source text or paths.
 *
 * @param value - Raw value to parse or normalize.
 */
function extractYear(value: string): string | null {
  const match = /\b(1[5-9]\d{2}|20\d{2})\b/.exec(value);

  return match?.[1] ?? null;
}

/**
 * Escapes local-source metadata for a minimal BibTeX field value.
 *
 * @param value - Raw value to parse or normalize.
 */
function bibtexValue(value: string): string {
  return value.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Returns a unique citekey by appending numeric suffixes on collisions.
 *
 * @param base - Preferred citekey prefix before collision suffixes.
 * @param used - Set of citekeys already assigned during the current ingestion.
 */
function uniqueCiteKey(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;

  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }

  used.add(candidate);

  return candidate;
}

/**
 * Builds a local source registry record from extracted document text.
 *
 * @param projectRoot - Absolute project root used to resolve project-relative
 *   files.
 * @param document - Extracted local source document used to build a source
 *   record.
 * @param usedKeys - Mutable citekey set used to avoid duplicates.
 */
function sourceRecordFromDocument(
  projectRoot: string,
  document: ExtractedDocument,
  usedKeys: Set<string>,
  previousKeys: Map<string, string>,
): LocalSourceRecord {
  const sourceFingerprint =
    "sha256:" +
    createHash("sha256")
      .update(readFileSync(resolve(projectRoot, document.path)))
      .digest("hex");

  const sourceId = `local:${sourceFingerprint}`;

  const title =
    firstContentLine(document.text) ??
    basename(document.path, extname(document.path));

  const year = extractYear(`${document.path}\n${document.text.slice(0, 4000)}`);
  // A source keeps its citekey across re-ingests, so `[@key]` markers in
  // articles stay valid.
  const base = citeKeyBase(title);

  const preferred =
    previousKeys.get(sourceId) ??
    previousKeys.get(document.path) ??
    (year && !base.includes(year) ? `${base}_${year}` : base);

  const citeKey = uniqueCiteKey(preferred, usedKeys);

  const record: LocalSourceRecord = {
    sourceId,
    sourceFingerprint,
    citeKey,
    sourceType: "local-file",
    path: document.path,
    fileType: extname(document.path).toLowerCase().replace(/^\./, "") || "text",
    author: null,
    workTitle: title,
    year,
    extractionConfidence: {
      author: "low",
      workTitle: "medium",
      year: year ? "medium" : "low",
    },
    extractionNotes: `Generated from local project source ${document.path}; verify missing metadata before publication.`,
  };

  if (document.pages) record.pages = document.pages;

  return record;
}

/**
 * Serializes one local source registry record as a minimal BibTeX entry.
 *
 * @param record - Local source registry record to serialize.
 */
function sourceBibtex(
  record: Pick<LocalSourceRecord, "citeKey" | "workTitle" | "path" | "year">,
): string {
  const fields = [
    `  title = {${bibtexValue(record.workTitle)}}`,
    `  howpublished = {Local file: ${bibtexValue(record.path)}}`,
  ];

  if (record.year) fields.push(`  year = {${record.year}}`);

  return `@misc{${record.citeKey},\n${fields.join(",\n")}\n}\n`;
}

/**
 * Resolves explicit source paths or scans the default local sources folder.
 *
 * @param projectRoot - Absolute project root used to resolve project-relative
 *   files.
 * @param paths - Optional explicit local source paths to ingest.
 */
function sourceInputs(projectRoot: string, paths?: string[]): string[] {
  if (paths && paths.length > 0) return paths;
  const sourceDir = join(projectRoot, ".pi-academic", "sources");

  if (!existsSync(sourceDir)) return [];

  return readdirSync(sourceDir)
    .filter((entry) =>
      SUPPORTED_SOURCE_EXTENSIONS.has(extname(entry).toLowerCase()),
    )
    .sort()
    .map((entry) => join(".pi-academic", "sources", entry));
}

/**
 * Ingests local source files into `.pi-academic` source and bibliography
 * caches.
 *
 * @param projectRoot - Absolute project root used to resolve project-relative
 *   files.
 * @param paths - Optional explicit local source paths to ingest.
 * @param signal - Optional abort signal forwarded to subprocesses.
 */
export async function ingestSources(
  projectRoot: string,
  paths?: string[],
  signal?: AbortSignal,
): Promise<SourceIngestionResult> {
  const sourceDirectory = ".pi-academic/sources";
  const sourcesPath = ".pi-academic/sources.json";
  const bibliographyPath = ".pi-academic/bibliography.bib";
  mkdirSync(join(projectRoot, sourceDirectory), { recursive: true });
  const errors: Array<{ path: string; error: string }> = [];

  const documents: ExtractedDocument[] = [];

  for (const input of sourceInputs(projectRoot, paths)) {
    const ext = extname(input).toLowerCase();

    if (!SUPPORTED_SOURCE_EXTENSIONS.has(ext)) {
      errors.push({
        path: input,
        error: `Unsupported file type: ${ext || "(none)"}`,
      });
      continue;
    }

    const extracted = await extractDocument(projectRoot, input, signal);

    if (!extracted.ok) {
      errors.push({
        path: extracted.path,
        error: extracted.error ?? "Extraction failed",
      });
      continue;
    }

    documents.push(extracted);
  }

  const sourcesFile = join(projectRoot, sourcesPath);
  const bibliographyFile = join(projectRoot, bibliographyPath);

  const { sources, merged } = await withFileLock(sourcesFile, () => {
    const existing = readSourceRegistry(sourcesFile);
    const ingestedPaths = new Set(documents.map((document) => document.path));

    // Only records this run re-reads (or whose file is gone) are replaced; Zotero
    // records and local files outside this run stay untouched.
    const retained = existing.filter(
      (entry) =>
        !isValid(StoredLocalSourceSchema, entry) ||
        (!ingestedPaths.has(entry.path) &&
          existsSync(resolve(projectRoot, entry.path))),
    );

    const usedKeys = new Set(
      retained.flatMap((entry) => stringField(entry, "citeKey") ?? []),
    );

    const previousKeys = new Map<string, string>();

    for (const entry of existing) {
      if (!isValid(StoredLocalSourceSchema, entry)) continue;
      previousKeys.set(entry.sourceId, entry.citeKey);
      previousKeys.set(entry.path, entry.citeKey);
    }

    const createdSources = documents.map((document) =>
      sourceRecordFromDocument(projectRoot, document, usedKeys, previousKeys),
    );

    const mergedRecords: JsonObject[] = [...retained, ...createdSources];

    const localKeys = new Set([
      ...existing.flatMap((entry) =>
        isValid(StoredLocalSourceSchema, entry) ? [entry.citeKey] : [],
      ),
      ...createdSources.map((record) => record.citeKey),
    ]);

    const foreignEntries = existsSync(bibliographyFile)
      ? [
          ...parseBibEntries(readFileSync(bibliographyFile, "utf-8")).values(),
        ].flatMap((entry) =>
          localKeys.has(entry.key)
            ? []
            : [{ key: entry.key, text: entry.text }],
        )
      : [];

    const localEntries = mergedRecords.flatMap((entry) =>
      isValid(StoredLocalSourceSchema, entry)
        ? [
            sourceBibtex({
              citeKey: entry.citeKey,
              workTitle: entry.workTitle ?? "",
              path: entry.path,
              year: entry.year ?? null,
            }),
          ]
        : [],
    );

    writeFileAtomic(sourcesFile, `${JSON.stringify(mergedRecords, null, 2)}\n`);
    writeFileAtomic(
      bibliographyFile,
      [
        ...foreignEntries.map((entry) => `${entry.text}\n`),
        ...localEntries,
      ].join("\n"),
    );

    return { sources: createdSources, merged: mergedRecords };
  });

  await markResearchNotesStale(
    projectRoot,
    merged.flatMap((entry) => {
      const sourceId = stringField(entry, "sourceId");

      if (sourceId === undefined) return [];

      const sourceFingerprint = stringField(entry, "sourceFingerprint");

      return [
        sourceFingerprint === undefined
          ? { sourceId }
          : { sourceId, sourceFingerprint },
      ];
    }),
  );

  return {
    ok: errors.length === 0,
    sourceDirectory,
    sourcesPath,
    bibliographyPath,
    count: sources.length,
    sources,
    errors,
  };
}

/**
 * Reads the source registry; a malformed file is an error rather than something
 * to overwrite. Accepts both a bare JSON array of records and the `{ "sources":
 * [...] }` object shape.
 */
export function readSourceRegistry(path: string): JsonObject[] {
  if (!existsSync(path)) return [];

  const value = parseJsonText(readFileSync(path, "utf-8"));

  if (Array.isArray(value))
    return parseWith(Type.Array(JsonObjectSchema), value, "sources");

  if (isValid(Type.Object({ sources: Type.Array(JsonObjectSchema) }), value))
    return value.sources;

  throw new Error(
    `${path} must contain a JSON array of objects or an object with a sources array`,
  );
}

/**
 * Copies current citation caches into article-local frozen citation assets.
 *
 * @param projectRoot - Absolute project root used to resolve project-relative
 *   files.
 * @param article - Article markdown path, relative to the project root unless
 *   absolute.
 */
export function snapshotCitationAssets(
  projectRoot: string,
  article: string,
): CitationSnapshotResult {
  const local = citationAssetPaths(article);

  const pairs = [
    [".pi-academic/sources.json", local.sources],
    [".pi-academic/bibliography.bib", local.bibliography],
  ] as const;

  const copied: string[] = [];
  const missing: string[] = [];

  for (const [from, to] of pairs) {
    const source = join(projectRoot, from);

    if (!existsSync(source)) {
      missing.push(from);
      continue;
    }

    writeFileAtomic(resolveInside(projectRoot, to), readFileSync(source));
    copied.push(to);
  }

  return { ok: missing.length === 0, ...local, copied, missing };
}

/**
 * Result of writing the sources cache.
 */
export interface SourcesCacheWrite {
  ok: true;
  sourcesPath: string;
  bibliographyPath: string;
  count: number;
}

/**
 * Writes the current-run sources cache and bibliography from extracted source
 * records.
 *
 * @param projectRoot - Absolute project root used to resolve project-relative
 *   files.
 * @param sources - Source registry records to serialize.
 * @param bibliography - Concatenated BibTeX entries.
 */
export async function persistSourceRegistry(
  projectRoot: string,
  sources: JsonValue[],
  bibliography: string,
): Promise<SourcesCacheWrite> {
  const sourcesPath = join(projectRoot, ".pi-academic", "sources.json");

  return withFileLock(sourcesPath, () => {
    const normalizedSources = sources.map(normalizeSourceCacheRecord);
    const relSourcesPath = ".pi-academic/sources.json";
    const relBibPath = ".pi-academic/bibliography.bib";

    writeProjectTextFile(
      projectRoot,
      relSourcesPath,
      `${JSON.stringify(normalizedSources, null, 2)}\n`,
    );
    writeProjectTextFile(projectRoot, relBibPath, bibliography);

    return {
      ok: true,
      sourcesPath: relSourcesPath,
      bibliographyPath: relBibPath,
      count: sources.length,
    };
  });
}

/**
 * Backwards-compatible alias for `persistSourceRegistry`.
 */
export const writeSourcesCache = persistSourceRegistry;
