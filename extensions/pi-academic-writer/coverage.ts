import { Type } from "typebox";

import { errorMessage } from "../lib/fs-safe.js";
import {
  isValid,
  JsonObjectSchema,
  JsonValueSchema,
  parseJsonText,
  type JsonObject,
  type JsonValue,
} from "../lib/schema.js";

/**
 * One advisory finding about chapter coverage.
 */
export interface CoverageFinding {
  code: string;
  path: string;
  explanation: string;
}

const PositiveInteger = Type.Integer({ minimum: 1 });

const NonBlankString = Type.String({ pattern: "\\S" });

const StringSchema = Type.String();

const JsonArraySchema = Type.Array(JsonValueSchema);

/**
 * Collects every string `id` found anywhere in the evidence map.
 */
function collectIds(value: JsonValue, ids: Set<string>): void {
  if (isValid(JsonArraySchema, value)) {
    for (const item of value) collectIds(item, ids);

    return;
  }

  if (!isValid(JsonObjectSchema, value)) return;

  const { id } = value;

  if (id !== undefined && isValid(StringSchema, id)) ids.add(id);

  for (const child of Object.values(value)) collectIds(child, ids);
}

/**
 * Checks a book/chapter evidence map: every chapter up to the declared final
 * one is covered or skipped with a reason, and covered chapters cite evidence
 * IDs that exist in the map.
 *
 * Malformed input is reported as findings, never thrown.
 */
export function diagnoseChapterCoverage(json: string): CoverageFinding[] {
  const findings: CoverageFinding[] = [];

  const add = (code: string, path: string, explanation: string) =>
    findings.push({ code, path, explanation });

  try {
    const root = parseJsonText(json);

    if (!isValid(JsonObjectSchema, root))
      throw new Error("evidence map must be a JSON object");

    const coverage = root.chapter_coverage;

    if (coverage === undefined) return findings;

    const counts = root.chapter_counts;

    if (!coverage || !isValid(JsonObjectSchema, coverage))
      throw new Error("chapter_coverage must map book names to chapter arrays");

    if (!counts || !isValid(JsonObjectSchema, counts))
      throw new Error(
        "chapter_counts must map book names to positive chapter counts",
      );

    const ids = new Set<string>();

    collectIds(root, ids);

    for (const [book, entries] of Object.entries(coverage)) {
      const base = "$.chapter_coverage." + book;

      if (!isValid(JsonArraySchema, entries)) {
        add(
          "unsupported-chapter-coverage",
          base,
          "Book coverage must be an array of chapter records.",
        );
        continue;
      }

      const chapters = diagnoseBookEntries(base, entries, ids, add);
      const last = counts[book];

      if (last === undefined || !isValid(PositiveInteger, last)) {
        add(
          "unsupported-chapter-count",
          "$.chapter_counts." + book,
          "Supply the verified final chapter number as a positive integer.",
        );
        continue;
      }

      for (let chapter = 1; chapter <= last; chapter++)
        if (!chapters.has(chapter))
          add(
            "missing-chapter",
            base,
            `Chapter ${chapter} is missing from coverage through declared book end ${last}.`,
          );

      for (const chapter of chapters)
        if (chapter > last)
          add(
            "chapter-exceeds-book-count",
            base,
            `Chapter ${chapter} exceeds declared final chapter ${last}.`,
          );
    }
  } catch (cause) {
    add(
      "unsupported-chapter-coverage",
      "$.chapter_coverage",
      errorMessage(cause),
    );
  }

  return findings;
}

type AddFinding = (code: string, path: string, explanation: string) => number;

/**
 * Checks one book's chapter records and returns the chapter numbers seen.
 */
function diagnoseBookEntries(
  base: string,
  entries: JsonValue[],
  ids: Set<string>,
  add: AddFinding,
): Set<number> {
  const chapters = new Set<number>();

  entries.forEach((item, index) => {
    const at = `${base}[${index}]`;

    if (!isValid(JsonObjectSchema, item)) {
      add(
        "unsupported-chapter-coverage",
        at,
        "Chapter entry must be an object.",
      );

      return;
    }

    const chapter = item.chapter;

    if (chapter === undefined || !isValid(PositiveInteger, chapter)) {
      add(
        "unsupported-chapter-coverage",
        at + ".chapter",
        "Chapter must be a positive integer.",
      );

      return;
    }

    if (chapters.has(chapter))
      add(
        "duplicate-chapter",
        at + ".chapter",
        `Chapter ${chapter} is duplicated.`,
      );
    chapters.add(chapter);

    diagnoseChapterStatus(at, item, ids, add);
  });

  return chapters;
}

/**
 * Checks the status-specific fields of one chapter record.
 */
function diagnoseChapterStatus(
  at: string,
  entry: JsonObject,
  ids: Set<string>,
  add: AddFinding,
): void {
  if (entry.status === "skipped-irrelevant") {
    if (entry.reason === undefined || !isValid(NonBlankString, entry.reason))
      add(
        "invalid-chapter-status",
        at + ".reason",
        "Skipped chapters require a reason.",
      );

    return;
  }

  if (entry.status !== "covered") {
    add(
      "invalid-chapter-status",
      at + ".status",
      "Status must be covered or skipped-irrelevant.",
    );

    return;
  }

  const evidence = entry.evidence_ids;

  if (
    evidence === undefined ||
    !isValid(JsonArraySchema, evidence) ||
    evidence.length === 0
  ) {
    add(
      "invalid-chapter-status",
      at + ".evidence_ids",
      "Covered chapters require evidence IDs.",
    );

    return;
  }

  evidence.forEach((id, index) => {
    if (!isValid(StringSchema, id) || !ids.has(id))
      add(
        "unresolved-evidence-id",
        `${at}.evidence_ids[${index}]`,
        `Evidence ID ${String(id)} does not resolve in the supplied map.`,
      );
  });
}
