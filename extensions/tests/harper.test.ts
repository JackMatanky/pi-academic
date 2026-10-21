import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test } from "vitest";

import { lintWithHarper } from "../pi-academic/prose/harper.js";
import { createToolHarness } from "./helpers.js";

test("[test_harper_finds_indefinite_article_error] lintWithHarper flags the indefinite-article error", async () => {
  const text = "This is a example of how to use harper.";
  const findings = await lintWithHarper(text, "American");

  assert.ok(findings.length >= 1, "expected at least one finding");

  const article = findings.find((finding) =>
    finding.message.toLowerCase().includes("indefinite article"),
  );

  assert.ok(article, "missing the indefinite-article finding");
  assert.ok(article.message.length > 0, "message must be a non-empty string");
  assert.equal(text.slice(article.start, article.end), "a");

  const first = article.suggestions[0];

  assert.ok(first, "missing a suggestion");
  assert.equal(first.kind, "replace");
  assert.equal(first.replacementText, "an");
});

test("[test_harper_hebrew_returns_without_throwing] lintWithHarper returns an array for Hebrew text", async () => {
  const findings = await lintWithHarper(
    "זהו פסקה עברית לבדיקה, ואין בה שגיאות אנגליות.",
    "American",
  );

  assert.ok(Array.isArray(findings));
});

test("[test_harper_tool_rejects_blank_text] the proofread tool rejects blank input at the boundary", async (t) => {
  const { callTool } = createToolHarness();
  const root = mkdtempSync(join(tmpdir(), "aw-harper-"));

  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  const result = await callTool(root, "academic_writer_proofread", {
    text: "   ",
  });

  assert.equal(result.isError, true);
  assert.ok(result.content[0]?.text.includes("empty"));
});
