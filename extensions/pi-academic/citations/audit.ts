import { readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

import { Type } from "typebox";

import { errorMessage, resolveInside } from "../../lib/fs-safe.js";
import { stripCodeSpans } from "../../lib/markdown.js";
import {
  isValid,
  JsonObjectSchema,
  parseJsonText,
  type JsonValue,
} from "../../lib/schema.js";
import { parseBibEntries } from "../parsers/bibtex.js";
import { analyzeNoteRefs } from "./note-refs.js";

/**
 * An audit completed with or without user-correctable citation defects.
 */
export interface CitationAuditDetails {
  status: "passed" | "failed";
  article: string;
  citationStyle: string;
  mode: "inline-parenthetical" | "citeproc";
  assetScope: "article" | "global" | null;
  sourcesPath: string | null;
  bibliographyPath: string | null;
  markers: string[];
  citationKeys: string[];
  missingFromSources: string[];
  missingFromBibliography: string[];
  malformedMarkers: string[];
  warnings: string[];
  reason?: string;
}

/**
 * Operational failures cannot be mistaken for citation defects.
 */
export type CitationAuditResult =
  | CitationAuditDetails
  | { status: "error"; error: string };

/**
 * Text-level citation analysis: marker and cite-key extraction with no
 * filesystem access.
 */
export interface CitationTextAnalysis {
  status: "passed" | "failed";
  reason?: string;
  markers: string[];
  citationKeys: string[];
  malformedMarkers: string[];
  warnings: string[];
}

const StringSchema = Type.String();

const bracketPattern = /\[((?:[^[\]]|\\.)*)\]/gu;

const citationStart = /(?<![\p{L}\p{N}_\\])@/u;

const citeKeyPattern =
  /(?<![\p{L}\p{N}_\\])@([\p{L}\p{N}_](?:[\p{L}\p{N}_]|[:.#$%&+?<>~/-](?=[\p{L}\p{N}_]))*)/gu;

/**
 * Returns whether `path` exists as a regular file.
 */
function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Collects every non-blank `citeKey` anywhere in a source registry.
 */
function collectCiteKeys(value: JsonValue, keys: Set<string>): void {
  if (value === null || value === undefined) return;

  if (Array.isArray(value)) {
    for (const item of value) collectCiteKeys(item, keys);

    return;
  }

  if (value.constructor !== Object || !isValid(JsonObjectSchema, value)) return;
  const citeKey = value.citeKey;

  if (
    citeKey !== undefined &&
    citeKey !== null &&
    citeKey.constructor === String &&
    isValid(StringSchema, citeKey)
  ) {
    const trimmed = citeKey.trim();

    if (trimmed.length > 0) keys.add(trimmed);
  }

  for (const item of Object.values(value)) collectCiteKeys(item, keys);
}

/**
 * Extracts citation markers, cite keys and text defects from Markdown. Pure:
 * front matter, fenced code and inline code are excluded exactly as Pandoc
 * does, and narrative `@key` resolution applies only in citeproc mode.
 *
 * @param markdown - Input article markdown content.
 * @param citationStyle - Citation style ("inline-parenthetical", "apa", etc.).
 *
 * @returns Analysis containing extracted markers, keys, defects, and status.
 */
export function analyzeCitationText(
  markdown: string,
  citationStyle: string,
): CitationTextAnalysis {
  const text = stripCodeSpans(markdown);

  const markers = Array.from(text.matchAll(bracketPattern))
    .filter((match) => citationStart.test(match[1] ?? ""))
    .map((match) => match[0]);

  const keys = new Set<string>();
  const malformed: string[] = [];

  for (const marker of markers) {
    const found = Array.from(
      marker.matchAll(citeKeyPattern),
      (match) => match[1] ?? "",
    );

    if (!found.length) malformed.push(marker);

    for (const key of found) keys.add(key);
  }

  if (citationStyle === "inline-parenthetical") {
    const inline: CitationTextAnalysis = {
      status: markers.length ? "failed" : "passed",
      markers,
      citationKeys: [...keys],
      malformedMarkers: malformed,
      warnings: [],
    };

    if (markers.length)
      inline.reason =
        "inline-parenthetical articles must not contain Pandoc citeproc markers";

    return inline;
  }

  // Pandoc also resolves narrative `@key` outside brackets.
  const prose = text
    .replace(bracketPattern, " ")
    .replace(/\]\([^)]*\)|<[^>\s]+>|\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, " ")
    .replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, " ");

  for (const match of prose.matchAll(citeKeyPattern)) {
    keys.add(match[1] ?? "");
  }

  return {
    status: malformed.length ? "failed" : "passed",
    markers,
    citationKeys: [...keys],
    malformedMarkers: malformed,
    warnings:
      !markers.length && !keys.size ? ["No Pandoc citeproc markers found"] : [],
  };
}

/**
 * Missing-key comparison of citation keys against the audited assets.
 */
export interface CitationKeyResolution {
  missingFromSources: string[];
  missingFromBibliography: string[];
}

/**
 * Resolves citation keys against decoded source records and raw bibliography
 * text. Pure: callers own the filesystem reads and asset selection.
 *
 * @param citationKeys - Unique list of citation keys cited in the article.
 * @param sourceRecords - Sources JSON array or object.
 * @param bibliographyText - Raw BibTeX bibliography text.
 *
 * @returns Resolution showing missing keys from sources or bibliography.
 */
export function resolveCitationKeys(
  citationKeys: readonly string[],
  sourceRecords: JsonValue,
  bibliographyText: string,
): CitationKeyResolution {
  const sourceKeys = new Set<string>();

  collectCiteKeys(sourceRecords, sourceKeys);

  const bibliographyKeys = new Set(parseBibEntries(bibliographyText).keys());

  return {
    missingFromSources: citationKeys.filter((key) => !sourceKeys.has(key)),
    missingFromBibliography: citationKeys.filter(
      (key) => !bibliographyKeys.has(key),
    ),
  };
}

/**
 * Audits Markdown citation markers against article-local or project-wide
 * assets.
 *
 * @param article - Article file name or path relative to project.
 * @param citationStyle - Citation style ("inline-parenthetical", "apa", etc.).
 * @param projectRoot - Root directory of the project.
 *
 * @returns Audit result with status, markers, and missing key lists.
 */
export function auditCitations(
  article: string,
  citationStyle: string,
  projectRoot: string,
): CitationAuditResult {
  try {
    const root = resolve(projectRoot);
    const articlePath = resolveInside(root, article);
    const articleRelative = relative(root, articlePath);

    if (!isFile(articlePath))
      return { status: "error", error: `Article not found: ${articlePath}` };

    const markdown = readFileSync(articlePath, "utf8");
    const analysis = analyzeCitationText(markdown, citationStyle);
    const noteRefs = analyzeNoteRefs(markdown);

    const result: CitationAuditDetails = {
      status: analysis.status,
      article: articleRelative,
      citationStyle,
      mode:
        citationStyle === "inline-parenthetical"
          ? "inline-parenthetical"
          : "citeproc",
      assetScope: null,
      sourcesPath: null,
      bibliographyPath: null,
      markers: analysis.markers,
      citationKeys: analysis.citationKeys,
      missingFromSources: [],
      missingFromBibliography: [],
      malformedMarkers: analysis.malformedMarkers,
      warnings: [
        ...analysis.warnings,
        ...noteRefs.hardCoded.map(
          (phrase) =>
            `"${phrase}" is a literal note number and goes stale when notes move; link it to a note anchor (pandoc_citation_syntax resource, "Note cross-references")`,
        ),
      ],
    };

    const noteDefects = [
      ...noteRefs.duplicateAnchors.map(
        (id) => `note anchor #${id} is defined more than once`,
      ),
      ...noteRefs.danglingLinks.map(
        (id) => `link to #${id} has no matching note anchor`,
      ),
      ...noteRefs.labelledLinks.map(
        (id) => `link to #${id} has text; write it as [](#${id})`,
      ),
    ];

    if (noteDefects.length) {
      result.status = "failed";
      result.reason = [analysis.reason, ...noteDefects]
        .filter((part) => part !== undefined)
        .join("; ");
    } else if (analysis.reason !== undefined) {
      result.reason = analysis.reason;
    }

    if (citationStyle === "inline-parenthetical") return result;

    const suffix = extname(articlePath);

    const articleBase = suffix
      ? articlePath.slice(0, -suffix.length)
      : articlePath;

    const localSources = `${articleBase}.sources.json`;
    const localBibliography = `${articleBase}.bibliography.bib`;

    const scope =
      isFile(localSources) || isFile(localBibliography) ? "article" : "global";

    const sources =
      scope === "article"
        ? localSources
        : join(root, ".pi-academic", "sources.json");

    const bibliography =
      scope === "article"
        ? localBibliography
        : join(root, ".pi-academic", "bibliography.bib");

    result.assetScope = scope;
    result.sourcesPath = relative(root, sources);
    result.bibliographyPath = relative(root, bibliography);

    if (!isFile(sources)) {
      result.status = "failed";
      result.reason = `${result.sourcesPath} not found`;

      return result;
    }

    let sourceRecords: JsonValue;

    try {
      sourceRecords = parseJsonText(readFileSync(sources, "utf8"));
    } catch (error) {
      return {
        status: "error",
        error: `Could not read ${result.sourcesPath}: ${errorMessage(error)}`,
      };
    }

    if (!isFile(bibliography)) {
      result.status = "failed";
      result.reason = `${result.bibliographyPath} not found`;

      return result;
    }

    const missing = resolveCitationKeys(
      result.citationKeys,
      sourceRecords,
      readFileSync(bibliography, "utf8"),
    );

    result.missingFromSources = missing.missingFromSources;
    result.missingFromBibliography = missing.missingFromBibliography;

    if (
      result.missingFromSources.length ||
      result.missingFromBibliography.length
    )
      result.status = "failed";

    return result;
  } catch (error) {
    return { status: "error", error: errorMessage(error) };
  }
}
