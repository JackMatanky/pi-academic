import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { resolveInside, writeFileAtomic } from "../lib/fs-safe.js";
import { extractDocument, type ExtractedDocument } from "./documents.js";
import {
  citationAssetPaths,
  writeProjectTextFile,
  type CitationAssetPaths,
} from "./project-files.js";
import { markResearchNotesStale } from "./research-notes.js";

/** File extensions accepted by local source ingestion. */
const SUPPORTED_SOURCE_EXTENSIONS = new Set([".pdf", ".docx", ".md", ".txt"]);

/** Source registry record generated from one project-local source file. */
export interface LocalSourceRecord {
  sourceId: string;
  sourceFingerprint: string;
  citeKey: string;
  sourceType: "local-file";
  path: string;
  fileType: string;
  author: null;
  workTitle: string;
  year: string | null;
  extractionConfidence: {
    author: "low";
    workTitle: "medium";
    year: "medium" | "low";
  };
  extractionNotes: string;
  pages?: Array<{ pdfPageIndex: number; text: string }>;
}

/** Result payload written by local folder source ingestion. */
export interface SourceIngestionResult {
  ok: boolean;
  sourceDirectory: string;
  sourcesPath: string;
  bibliographyPath: string;
  count: number;
  sources: LocalSourceRecord[];
  errors: Array<{ path: string; error: string }>;
}

/** Result payload for copying current citation caches beside an article. */
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
 * @param projectRoot - Absolute project root used to resolve project-relative files.
 * @param document - Extracted local source document used to build a source record.
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
  // A source keeps its citekey across re-ingests, so `[@key]` markers in articles stay valid.
  const base = citeKeyBase(title);

  const preferred =
    previousKeys.get(sourceId) ??
    previousKeys.get(document.path) ??
    (year && !base.includes(year) ? `${base}_${year}` : base);

  const citeKey = uniqueCiteKey(preferred, usedKeys);

  return {
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
    ...(document.pages ? { pages: document.pages } : {}),
  };
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
 * @param projectRoot - Absolute project root used to resolve project-relative files.
 * @param paths - Optional explicit local source paths to ingest.
 */
function sourceInputs(projectRoot: string, paths?: string[]): string[] {
  if (paths && paths.length > 0) return paths;
  const sourceDir = join(projectRoot, ".academic-writer", "sources");

  if (!existsSync(sourceDir)) return [];

  return readdirSync(sourceDir)
    .filter((entry) =>
      SUPPORTED_SOURCE_EXTENSIONS.has(extname(entry).toLowerCase()),
    )
    .sort()
    .map((entry) => join(".academic-writer", "sources", entry));
}

/**
 * Ingests local source files into `.academic-writer` source and bibliography caches.
 *
 * @param projectRoot - Absolute project root used to resolve project-relative files.
 * @param paths - Optional explicit local source paths to ingest.
 * @param signal - Optional abort signal forwarded to subprocesses.
 */
export async function ingestSources(
  projectRoot: string,
  paths?: string[],
  signal?: AbortSignal,
): Promise<SourceIngestionResult> {
  const sourceDirectory = ".academic-writer/sources";
  const sourcesPath = ".academic-writer/sources.json";
  const bibliographyPath = ".academic-writer/bibliography.bib";
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
  const existing = readSourceRegistry(sourcesFile);

  const isLocal = (record: Record<string, unknown>) =>
    record.sourceType === "local-file";

  const ingestedPaths = new Set(documents.map((document) => document.path));

  // Only records this run re-reads (or whose file is gone) are replaced; Zotero
  // records and local files outside this run stay untouched.
  const retained = existing.filter(
    (record) =>
      !isLocal(record) ||
      (typeof record.path === "string" &&
        !ingestedPaths.has(record.path) &&
        existsSync(resolve(projectRoot, record.path))),
  );

  const usedKeys = new Set(
    retained.flatMap((record) =>
      typeof record.citeKey === "string" ? [record.citeKey] : [],
    ),
  );

  const previousKeys = new Map<string, string>();

  for (const record of existing) {
    if (!isLocal(record) || typeof record.citeKey !== "string") continue;

    for (const id of [record.sourceId, record.path])
      if (typeof id === "string") previousKeys.set(id, record.citeKey);
  }

  const sources = documents.map((document) =>
    sourceRecordFromDocument(projectRoot, document, usedKeys, previousKeys),
  );

  const merged: Array<Record<string, unknown>> = [
    ...retained,
    ...sources.map((source) => ({ ...source })),
  ];

  const localKeys = new Set([
    ...existing
      .filter(isLocal)
      .flatMap((record) =>
        typeof record.citeKey === "string" ? [record.citeKey] : [],
      ),
    ...sources.map((record) => record.citeKey),
  ]);

  const foreignEntries = existsSync(bibliographyFile)
    ? bibEntries(readFileSync(bibliographyFile, "utf-8")).filter(
        (entry) => !localKeys.has(entry.key),
      )
    : [];

  const localEntries = merged.flatMap((record) =>
    isLocal(record)
      ? [
          sourceBibtex({
            citeKey: String(record.citeKey),
            workTitle: String(record.workTitle ?? ""),
            path: String(record.path ?? ""),
            year: typeof record.year === "string" ? record.year : null,
          }),
        ]
      : [],
  );

  writeFileAtomic(sourcesFile, `${JSON.stringify(merged, null, 2)}\n`);
  writeFileAtomic(
    bibliographyFile,
    [...foreignEntries.map((entry) => `${entry.text}\n`), ...localEntries].join(
      "\n",
    ),
  );
  markResearchNotesStale(
    projectRoot,
    merged.flatMap((record) =>
      typeof record.sourceId === "string"
        ? [
            {
              sourceId: record.sourceId,
              ...(typeof record.sourceFingerprint === "string"
                ? { sourceFingerprint: record.sourceFingerprint }
                : {}),
            },
          ]
        : [],
    ),
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

/** Reads the source registry; a malformed file is an error rather than something to overwrite. */
function readSourceRegistry(path: string): Array<Record<string, unknown>> {
  if (!existsSync(path)) return [];
  const value: unknown = JSON.parse(readFileSync(path, "utf-8"));

  if (!Array.isArray(value))
    throw new Error(`${path} must contain a JSON array`);

  return value.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
}

/** Splits a BibTeX file into entries keyed by citekey; non-entry blocks keep an empty key. */
function bibEntries(text: string): Array<{ key: string; text: string }> {
  return text
    .split(/^(?=@)/m)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => ({
      key: /^@\w+\s*\{\s*([^,\s]+)\s*,/.exec(block)?.[1] ?? "",
      text: block,
    }));
}

/**
 * Copies current citation caches into article-local frozen citation assets.
 *
 * @param projectRoot - Absolute project root used to resolve project-relative files.
 * @param article - Article markdown path, relative to the project root unless absolute.
 */
export function snapshotCitationAssets(
  projectRoot: string,
  article: string,
): CitationSnapshotResult {
  const local = citationAssetPaths(article);

  const pairs = [
    [".academic-writer/sources.json", local.sources],
    [".academic-writer/bibliography.bib", local.bibliography],
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
 * Writes the current-run sources cache and bibliography from extracted source records.
 *
 * @param projectRoot - Absolute project root used to resolve project-relative files.
 * @param sources - Source registry records to serialize.
 * @param bibliography - Concatenated BibTeX entries.
 */
export function writeSourcesCache(
  projectRoot: string,
  sources: unknown[],
  bibliography: string,
): { ok: true; sourcesPath: string; bibliographyPath: string; count: number } {
  const normalizedSources = sources.map((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw Error("Each source cache record must be an object");
    const source = value as Record<string, unknown>;

    if (source.sourceType === "zotero") {
      const libraryId =
          typeof source.libraryId === "string" && source.libraryId.trim()
            ? source.libraryId
            : undefined,
        itemKey =
          typeof source.itemKey === "string" && source.itemKey.trim()
            ? source.itemKey
            : undefined;

      if (libraryId && itemKey) {
        const sourceId = `zotero:${libraryId}:${itemKey}`;

        if (source.sourceId != null && source.sourceId !== sourceId)
          throw Error("Zotero sourceId must match libraryId and itemKey");

        return { ...source, sourceId };
      }

      if (source.sourceId != null)
        throw Error("Zotero sourceId requires confirmed libraryId and itemKey");

      return { ...source, sourceId: null };
    }

    if (source.sourceType === "local-file") {
      if (
        typeof source.sourceFingerprint !== "string" ||
        source.sourceId !== `local:${source.sourceFingerprint}`
      )
        throw Error("Local sourceId must match its sourceFingerprint");

      return source;
    }

    throw Error("Source record needs sourceType zotero or local-file");
  });

  const sourcesPath = ".academic-writer/sources.json";
  const bibliographyPath = ".academic-writer/bibliography.bib";
  writeProjectTextFile(
    projectRoot,
    sourcesPath,
    `${JSON.stringify(normalizedSources, null, 2)}\n`,
  );
  writeProjectTextFile(projectRoot, bibliographyPath, bibliography);

  return { ok: true, sourcesPath, bibliographyPath, count: sources.length };
}
