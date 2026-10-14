import assert from "node:assert/strict";

import { test } from "vitest";

import { diagnoseChapterCoverage } from "../pi-academic-writer/research/coverage.js";

const covered = (chapter: number, ids: string[]) => ({
  chapter,
  status: "covered",
  evidence_ids: ids,
});

test("a complete map citing real evidence records yields no findings", () => {
  assert.deepEqual(
    diagnoseChapterCoverage(
      JSON.stringify({
        chapter_counts: { Ezra: 2 },
        chapter_coverage: {
          Ezra: [
            covered(1, ["ev1"]),
            { chapter: 2, status: "skipped-irrelevant", reason: "Lists only" },
          ],
        },
        evidence: [{ id: "ev1" }],
      }),
    ),
    [],
  );
});

test("absent coverage and counts keep the optional no-coverage behavior", () => {
  assert.deepEqual(diagnoseChapterCoverage("{}"), []);
  assert.deepEqual(
    diagnoseChapterCoverage(JSON.stringify({ evidence: [{ id: "e" }] })),
    [],
  );
});

test("a book declared in counts but missing from coverage is incomplete", () => {
  const findings = diagnoseChapterCoverage(
    JSON.stringify({
      chapter_counts: { Ezra: 2, Nehemiah: 1 },
      chapter_coverage: { Nehemiah: [covered(1, ["ev1"])] },
      evidence: [{ id: "ev1" }],
    }),
  );

  assert.deepEqual(
    findings.filter((finding) => finding.path === "$.chapter_coverage.Ezra"),
    [
      {
        code: "unsupported-chapter-coverage",
        path: "$.chapter_coverage.Ezra",
        explanation:
          "chapter_counts declares book Ezra but chapter_coverage has no records for it.",
      },
    ],
  );

  // A count-only map with no coverage section at all is also incomplete.
  const countOnly = diagnoseChapterCoverage(
    JSON.stringify({ chapter_counts: { Ruth: 1 } }),
  );

  assert.ok(
    countOnly.some((finding) => finding.path === "$.chapter_coverage.Ruth"),
  );
});

test("coverage without counts still reports the missing boundary", () => {
  const findings = diagnoseChapterCoverage(
    JSON.stringify({
      chapter_coverage: { Ezra: [covered(1, ["ev1"])] },
      evidence: [{ id: "ev1" }],
    }),
  );

  assert.ok(
    findings.some(
      (finding) =>
        finding.code === "unsupported-chapter-coverage" &&
        finding.path === "$.chapter_counts",
    ),
  );
});

test("evidence ids resolve only against evidence records", () => {
  const findings = diagnoseChapterCoverage(
    JSON.stringify({
      chapter_counts: { Ezra: 1 },
      chapter_coverage: {
        Ezra: [
          // A stray `id` on the entry must not make its own evidence resolve.
          {
            chapter: 1,
            id: "ghost",
            status: "covered",
            evidence_ids: ["ghost"],
          },
        ],
      },
      evidence: [{ id: "ev1" }],
    }),
  );

  assert.deepEqual(
    findings.filter((finding) => finding.code === "unresolved-evidence-id"),
    [
      {
        code: "unresolved-evidence-id",
        path: "$.chapter_coverage.Ezra[0].evidence_ids[0]",
        explanation: "Evidence ID ghost does not resolve in the supplied map.",
      },
    ],
  );
});

test("malformed maps produce one actionable finding with a path", () => {
  const parse = diagnoseChapterCoverage("{");

  assert.equal(parse.length, 1);
  assert.equal(parse[0]?.code, "unsupported-chapter-coverage");

  const nonObject = diagnoseChapterCoverage(
    JSON.stringify({ chapter_coverage: "not-an-object" }),
  );

  assert.equal(nonObject[0]?.path, "$.chapter_coverage");

  const badCount = diagnoseChapterCoverage(
    JSON.stringify({
      chapter_counts: { Ezra: "many" },
      chapter_coverage: { Ezra: [covered(1, ["ev1"])] },
    }),
  );

  assert.equal(badCount[0]?.path, "$.chapter_counts.Ezra");
});
