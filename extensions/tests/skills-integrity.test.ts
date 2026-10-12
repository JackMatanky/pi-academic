import assert from "node:assert/strict";
import { test } from "node:test";

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

test("the write skill has no ellipsis placeholder lines", () => {
  const lines = readRepo("skills/academic-write/SKILL.md").split("\n");

  for (const [index, line] of lines.entries())
    assert.ok(
      line.trim() !== "…" && line.trim() !== "...",
      `placeholder at skills/academic-write/SKILL.md:${index + 1}`,
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

test("no skill or agent mentions removed memory, logs or the voice-facilitator agent", () => {
  const removed = [
    ".academic-writer/logs",
    "agent-memory",
    ".academic-writer/memory",
    "voice-" + "facilitator",
  ];

  for (const file of promptFiles) {
    const content = readRepo(file);

    for (const marker of removed)
      assert.ok(!content.includes(marker), `${file} mentions ${marker}`);
  }
});

test("auditor and section-writer gate on the structured verdict, not a prose line", () => {
  for (const file of ["agents/auditor.md", "agents/section-writer.md"])
    assert.ok(!readRepo(file).includes("VERDICT:"), `${file} keeps VERDICT:`);
});
