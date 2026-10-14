import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, type TestContext } from "vitest";

import { reverseOutline } from "../pi-academic-writer/research/reverse-outline.js";

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "reverse-outline-"));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "articles"));
  writeFileSync(
    join(root, "articles", "essay.md"),
    "# Intro\n\nFirst paragraph.\n",
  );

  return root;
}

test("a valid article inside articles/ still segments", (t) => {
  const root = fixture(t);
  const result = reverseOutline(root, "articles/essay.md");

  assert.equal(result.status, "advisory");

  if (result.status !== "advisory") return;
  assert.deepEqual(
    result.units.map((unit) => unit.text),
    ["First paragraph."],
  );
  assert.deepEqual([result.units[0]?.headingPath], [["Intro"]]);
});

test("YAML frontmatter never becomes a unit and line ranges are 1-indexed", (t) => {
  const root = fixture(t);
  writeFileSync(
    join(root, "articles", "fronted.md"),
    "---\ntitle: Foo\n---\n\n# Heading\n\nFirst paragraph.\n",
  );

  const result = reverseOutline(root, "articles/fronted.md");

  assert.equal(result.status, "advisory");

  if (result.status !== "advisory") return;
  assert.equal(result.units.length, 1);

  const unit = result.units[0];

  assert.equal(unit?.text, "First paragraph.");
  assert.deepEqual(unit?.headingPath, ["Heading"]);
  assert.equal(unit?.startLine, 7);
  assert.equal(unit?.endLine, 7);
});

test("traversal outside articles/ is refused", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, "secret.md"), "outside contents");

  const result = reverseOutline(root, "../secret.md");

  assert.equal(result.status, "error");

  if (result.status !== "error") return;
  assert.equal(
    result.reason,
    "Article must be a Markdown file inside project articles/.",
  );
  assert.deepEqual(result.units, []);
});

test("a symlink escaping articles/ is refused without reading the target", (t) => {
  const root = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), "reverse-outside-"));
  t.onTestFinished(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(
    join(outside, "secret.md"),
    "# Secret\n\nExternal contents [@hidden].\n",
  );
  symlinkSync(join(outside, "secret.md"), join(root, "articles", "link.md"));

  const result = reverseOutline(root, "articles/link.md");

  assert.equal(result.status, "error");

  if (result.status !== "error") return;
  assert.equal(
    result.reason,
    "Article must be a Markdown file inside project articles/.",
  );
  assert.deepEqual(result.units, []);
});

test("a symlink to an article inside articles/ keeps working", (t) => {
  const root = fixture(t);
  symlinkSync(
    join(root, "articles", "essay.md"),
    join(root, "articles", "alias.md"),
  );

  const result = reverseOutline(root, "articles/alias.md");

  assert.equal(result.status, "advisory");

  if (result.status !== "advisory") return;
  assert.deepEqual(
    result.units.map((unit) => unit.text),
    ["First paragraph."],
  );
});

test("mixed-length fences and nested-looking code lines are completely ignored", (t) => {
  const root = fixture(t);

  const markdown = [
    "# Code Analysis",
    "",
    "Introductory paragraph before code block.",
    "",
    "````markdown",
    "Here is an example code block:",
    "```typescript",
    "const greeting = 'hello'; // [@citeInCode]",
    "```",
    "Still inside the outer markdown fence.",
    "````",
    "",
    "Paragraph after code block with citation [@realCite].",
    "",
  ].join("\n");

  writeFileSync(join(root, "articles", "code.md"), markdown);

  const result = reverseOutline(root, "articles/code.md");

  assert.equal(result.status, "advisory");

  if (result.status !== "advisory") return;
  assert.equal(result.units.length, 2);
  assert.deepEqual(
    result.units.map((unit) => unit.text),
    [
      "Introductory paragraph before code block.",
      "Paragraph after code block with citation [@realCite].",
    ],
  );
  assert.equal(result.units[0]?.startLine, 3);
  assert.equal(result.units[0]?.endLine, 3);
  assert.equal(result.units[0]?.hasCitationMarker, false);
  assert.equal(result.units[1]?.startLine, 13);
  assert.equal(result.units[1]?.endLine, 13);
  assert.equal(result.units[1]?.hasCitationMarker, true);
});
