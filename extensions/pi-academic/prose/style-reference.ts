/**
 * Reference distributions for the style metrics: the same measurements taken on
 * documents the researcher chooses (their own articles, or published work in
 * the field), kept as numbers only.
 */
import { readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

import { errorMessage, resolveInside } from "../../lib/fs-safe.js";
import { extractDocument } from "../parsers/documents.js";
import {
  measureText,
  positionAgainst,
  STYLE_METRIC_KEYS,
  type ReferencePosition,
  type StyleLanguage,
  type StyleMetricKey,
  type StyleMetrics,
} from "./style-metrics.js";

const SUPPORTED = new Set([".md", ".txt", ".docx", ".pdf"]);

/**
 * Most files read from one directory argument.
 */
const MAX_DIRECTORY_FILES = 200;

/**
 * PDF text has footnote and header debris and unreliable paragraph breaks, so
 * paragraphs must be longer to count and their length is not measured.
 */
const PDF_MIN_PARAGRAPH_WORDS = 40;

/**
 * One reference document and its measurements.
 */
export interface ReferenceDocument {
  path: string;
  metrics: StyleMetrics;
}

/**
 * Reference documents that were measured, and those that were not.
 */
export interface ReferenceSet {
  documents: ReferenceDocument[];
  skipped: Array<{ path: string; reason: string }>;
}

/**
 * Measures prose of one extracted document.
 */
export function measureDocumentText(
  text: string,
  path: string,
  language: StyleLanguage,
): StyleMetrics {
  const isPdf = extname(path).toLowerCase() === ".pdf";

  return measureText(text, language, {
    minParagraphWords: isPdf ? PDF_MIN_PARAGRAPH_WORDS : undefined,
    skipParagraphLength: isPdf,
  });
}

interface ExpandedFiles {
  files: string[];
  skipped: ReferenceSet["skipped"];
}

function expand(root: string, inputs: string[]): ExpandedFiles {
  const files: string[] = [];
  const skipped: ReferenceSet["skipped"] = [];

  for (const input of inputs) {
    try {
      const absolute = resolveInside(root, input);

      if (statSync(absolute).isDirectory()) {
        const names = readdirSync(absolute)
          .filter(
            (name) =>
              !name.startsWith(".") &&
              SUPPORTED.has(extname(name).toLowerCase()),
          )
          .sort()
          .slice(0, MAX_DIRECTORY_FILES);

        files.push(...names.map((name) => join(input, name)));
      } else {
        files.push(input);
      }
    } catch (error) {
      skipped.push({ path: input, reason: errorMessage(error) });
    }
  }

  return { files, skipped };
}

/**
 * Reads and measures reference files or the supported files of reference
 * directories (not recursive). Unreadable files and files with no prose are
 * reported, not fatal.
 *
 * @param root - Project root; every path must stay inside it.
 * @param inputs - Project-relative files or directories.
 * @param language - Language of the documents.
 * @param signal - Abort signal forwarded to extraction.
 */
export async function measureReference(
  root: string,
  inputs: string[],
  language: StyleLanguage,
  signal?: AbortSignal,
): Promise<ReferenceSet> {
  const { files, skipped } = expand(root, inputs);
  const documents: ReferenceDocument[] = [];

  for (const file of files) {
    const extracted = await extractDocument(root, file, signal);

    if (!extracted.ok) {
      skipped.push({ path: file, reason: extracted.error ?? "unreadable" });
      continue;
    }

    const metrics = measureDocumentText(extracted.text, file, language);

    if (metrics.sentences < 10) {
      skipped.push({ path: file, reason: "too little prose to measure" });
      continue;
    }

    documents.push({ path: extracted.path, metrics });
  }

  return { documents, skipped };
}

/**
 * Per-metric position of `metrics` against the reference documents; a metric is
 * `null` when it was not measured here or the references cannot place it.
 */
export type ReferenceComparison = Record<
  StyleMetricKey,
  ReferencePosition | null
>;

/**
 * Places every measured value against the same metric on the references.
 */
export function compareToReference(
  metrics: StyleMetrics,
  documents: ReferenceDocument[],
): ReferenceComparison {
  // SAFETY: the loop below assigns every key of STYLE_METRIC_KEYS.
  const comparison = {} as ReferenceComparison;

  for (const key of STYLE_METRIC_KEYS) {
    const value = metrics.values[key];

    comparison[key] =
      value === null
        ? null
        : positionAgainst(
            value,
            documents.map((document) => document.metrics.values[key]),
          );
  }

  return comparison;
}

/**
 * Closeness of one text to the references.
 */
export interface DistanceSummary {
  distance: number | null;
  outside: StyleMetricKey[];
}

/**
 * Mean absolute robust z over the metrics that have one. A heuristic rank for
 * "closer to the reference"; lower is closer.
 */
export function referenceDistance(
  comparison: ReferenceComparison,
): DistanceSummary {
  const zs: number[] = [];
  const outside: StyleMetricKey[] = [];

  for (const key of STYLE_METRIC_KEYS) {
    const position = comparison[key];

    if (position === null) continue;

    if (position.z !== null) zs.push(Math.abs(position.z));

    if (position.position !== "within") outside.push(key);
  }

  return {
    distance:
      zs.length === 0 ? null : zs.reduce((sum, z) => sum + z, 0) / zs.length,
    outside,
  };
}
