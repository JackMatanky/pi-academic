import assert from "node:assert/strict";

import { test } from "vitest";

import { stripCodeSpans } from "../lib/markdown.js";

test("backtick robustness preserves text across paragraph boundaries on unmatched typo backtick", () => {
  const text = "The word it`s has an accent\n\n# Heading\n[@smith2020]";
  const stripped = stripCodeSpans(text);

  assert.ok(stripped.includes("# Heading"));
  assert.ok(stripped.includes("[@smith2020]"));
});

test("balanced inline code spans are replaced with whitespace preserving length", () => {
  const span = "`inline code`";
  const text = `Prefix ${span} suffix`;
  const stripped = stripCodeSpans(text);

  assert.equal(stripped.length, text.length);
  assert.equal(stripped, `Prefix ${" ".repeat(span.length)} suffix`);
});
