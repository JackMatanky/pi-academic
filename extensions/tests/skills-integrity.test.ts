import assert from "node:assert/strict";

import { test } from "vitest";

import { readRepo, repoFiles } from "./helpers.js";

const promptFiles = [
  ...repoFiles("skills", [".md"]),
  ...repoFiles("agents", [".md"]),
];

/**
 * Lines outside fenced code, with their 1-based numbers.
 */
function proseLines(text: string): { line: number; text: string }[] {
  const lines: { line: number; text: string }[] = [];
  let fence = false;

  text.split("\n").forEach((raw, index) => {
    if (/^\s*(```|~~~)/.test(raw)) {
      fence = !fence;

      return;
    }

    if (!fence) lines.push({ line: index + 1, text: raw });
  });

  return lines;
}

test("no skill or agent ends a section with a dangling log or mark-complete stub", () => {
  const stub = /\b(log|logs|logged|mark node complete)\b/i;

  for (const file of promptFiles) {
    const lines = proseLines(readRepo(file)).filter((l) => l.text.trim());

    lines.forEach((current, index) => {
      if (!current.text.trimEnd().endsWith(":") || !stub.test(current.text))
        return;

      const next = lines[index + 1]?.text.trim();

      assert.ok(
        next !== undefined && !next.startsWith("#") && next !== "---",
        `${file}:${current.line} ends with a stub: ${current.text.trim()}`,
      );
    });
  }
});

const authoredDocs = [...promptFiles, "AGENTS.md", "README.md"];

test("no skill, agent or doc has an ellipsis placeholder line", () => {
  for (const file of authoredDocs) {
    const content = readRepo(file);

    for (const [index, line] of content.split("\n").entries())
      assert.notEqual(line.trim(), "…", `placeholder at ${file}:${index + 1}`);

    for (const { line, text } of proseLines(content))
      assert.notEqual(text.trim(), "...", `placeholder at ${file}:${line}`);
  }
});

test("no skill, agent or doc has a line cut off mid-sentence by an ellipsis", () => {
  // A line that is 700+ characters and ends in an ellipsis was truncated by a
  // tool, not written that way.
  for (const file of authoredDocs)
    for (const [index, line] of readRepo(file).split("\n").entries())
      assert.ok(
        line.length < 700 || !/(…|\.\.\.)$/.test(line),
        `${file}:${index + 1} looks truncated: ...${line.slice(-60)}`,
      );
});

test("the write skill and its references keep Steps 8.5 through 9b", () => {
  const text = [
    "skills/academic-write/SKILL.md",
    ...repoFiles("skills/academic-write/references", [".md"]),
  ]
    .map(readRepo)
    .join("\n");

  for (const step of ["Step 8.5", "Step 8.7", "Step 9", "Step 9a", "Step 9b"])
    assert.match(
      text,
      new RegExp(`^#{2,5} ${step}\\b`, "m"),
      `missing ${step}`,
    );
});

test("no skill or agent mentions removed memory, logs or removed agents", () => {
  const removedSubstrings = [
    ".academic-writer/logs",
    "agent-memory",
    ".academic-writer/memory",
    "voice-" + "facilitator",
    "deep-" + "reader",
    "section-" + "writer",
    "voice-profile-" + "builder",
  ];
  // Whole-word markers: `auditor_result` (the kept schema name) must not trip
  // these, so match on word boundaries instead of raw substrings.

  const removedWords = [
    "audit" + "or",
    "synth" + "esizer",
    "proof" + "reader",
    "archi" + "tect",
  ];

  for (const file of promptFiles) {
    const content = readRepo(file);

    for (const marker of removedSubstrings)
      assert.ok(!content.includes(marker), `${file} mentions ${marker}`);

    for (const marker of removedWords)
      assert.ok(
        !new RegExp(`\\b${marker}\\b`).test(content),
        `${file} mentions ${marker}`,
      );
  }
});

test("editor and writer gate on the structured verdict, not a prose line", () => {
  for (const file of ["agents/editor.md", "agents/writer.md"])
    assert.ok(!readRepo(file).includes("VERDICT:"), `${file} keeps VERDICT:`);
});
