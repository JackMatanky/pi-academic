import { Type, type Static } from "typebox";

import { errorMessage } from "../lib/fs-safe.js";
import {
  firstViolation,
  isValid,
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
 * One chapter record; value-level problems stay per-entry findings.
 */
const ChapterEntrySchema = Type.Record(Type.String(), JsonValueSchema);

/**
 * The evidence-map contract, decoded once at the JSON text boundary. Containers
 * are strict, while scalar values (chapter numbers, statuses, evidence ids) are
 * left to the walk so one bad entry cannot mask the rest of the map.
 */
export const EvidenceMapSchema = Type.Object({
  chapter_counts: Type.Optional(Type.Record(Type.String(), PositiveInteger)),
  chapter_coverage: Type.Optional(
    Type.Record(Type.String(), Type.Array(ChapterEntrySchema)),
  ),
  evidence: Type.Optional(Type.Array(Type.Object({ id: NonBlankString }))),
});

export type EvidenceMap = Static<typeof EvidenceMapSchema>;

/**
 * Renders firstViolation path keys as a JSONPath-style locator, e.g. a.b[0].
 */
function violationLocator(path: readonly string[]): string {
  return path
    .map((segment) => (/^\d+$/.test(segment) ? `[${segment}]` : `.${segment}`))
    .join("");
}

/**
 * Checks a book/chapter evidence map: every chapter up to the declared final
 * one is covered or skipped with a reason, every declared book has coverage
 * records, and covered chapters cite evidence IDs from actual evidence records
 * in the map.
 *
 * Malformed input is reported as findings, never thrown.
 */
export function diagnoseChapterCoverage(json: string): CoverageFinding[] {
  const findings: CoverageFinding[] = [];

  const add = (code: string, path: string, explanation: string) =>
    findings.push({ code, path, explanation });

  let root: JsonValue;

  try {
    root = parseJsonText(json);
  } catch (cause) {
    add(
      "unsupported-chapter-coverage",
      "$.chapter_coverage",
      errorMessage(cause),
    );

    return findings;
  }

  if (!isValid(EvidenceMapSchema, root)) {
    const violation = firstViolation(EvidenceMapSchema, root);

    add(
      "unsupported-chapter-coverage",
      "$" + violationLocator(violation?.path ?? []),
      violation?.message ?? "evidence map must be a JSON object",
    );

    return findings;
  }

  const { chapter_counts: counts, chapter_coverage: coverage, evidence } = root;

  // Both fields absent keeps the optional no-coverage behavior.
  if (coverage === undefined && counts === undefined) return findings;

  const ids = new Set((evidence ?? []).map((record) => record.id));

  if (coverage === undefined || counts === undefined) {
    if (counts !== undefined)
      for (const book of Object.keys(counts))
        add(
          "unsupported-chapter-coverage",
          `$.chapter_coverage.${book}`,
          `chapter_counts declares book ${book} but chapter_coverage has no records for it.`,
        );

    if (coverage !== undefined)
      add(
        "unsupported-chapter-coverage",
        "$.chapter_counts",
        "chapter_counts must map book names to positive chapter counts.",
      );

    return findings;
  }

  for (const book of Object.keys(counts))
    if (!(book in coverage))
      add(
        "unsupported-chapter-coverage",
        `$.chapter_coverage.${book}`,
        `chapter_counts declares book ${book} but chapter_coverage has no records for it.`,
      );

  for (const [book, entries] of Object.entries(coverage)) {
    const base = "$.chapter_coverage." + book;
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

  return findings;
}

type AddFinding = (code: string, path: string, explanation: string) => number;

/**
 * Checks one book's chapter records and returns the chapter numbers seen.
 * Entries are decoded objects; value-level defects stay findings.
 */
function diagnoseBookEntries(
  base: string,
  entries: JsonObject[],
  ids: Set<string>,
  add: AddFinding,
): Set<number> {
  const chapters = new Set<number>();

  entries.forEach((item, index) => {
    const at = `${base}[${index}]`;
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
