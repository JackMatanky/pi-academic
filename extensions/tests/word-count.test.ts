import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, type TestContext } from "vitest";

import {
  calculateArticleWordCount,
  countWords,
} from "../pi-academic-writer/word-count.js";
import { createToolHarness } from "./helpers.js";

const { callTool } = createToolHarness();

function scratch(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "aw-wordcount-"));

  t.onTestFinished(() => rmSync(dir, { recursive: true, force: true }));

  return dir;
}

test("[test_count_words] unicode word boundaries", () => {
  assert.equal(countWords("Hello world"), 2);
  assert.equal(countWords("שלום עולם ומלואו"), 3);
  assert.equal(countWords(""), 0);
  assert.equal(countWords("   \n\t  "), 0);
  assert.equal(countWords("Word-with-hyphens"), 3);
});

test("[test_calculate_article_word_count_inline] counts body, footnotes, and zero citation expansion for inline", (t) => {
  const root = scratch(t);
  mkdirSync(join(root, "articles"));

  const md = `# Title

This is a paragraph with three words.

Second paragraph with a footnote[^1].

[^1]: This is the footnote text with seven words.
`;

  writeFileSync(join(root, "articles", "test.md"), md);

  const counts = calculateArticleWordCount(
    root,
    "articles/test.md",
    "inline-parenthetical",
  );

  assert.equal(counts.footnoteCount, 1);
  assert.equal(counts.citationWords, 0);
  assert.equal(counts.bibliographyWords, 0);
  assert.ok(counts.bodyWords > 0);
  assert.ok(counts.footnoteWords > 0);
  assert.equal(
    counts.expectedDocumentWords,
    counts.bodyWords + counts.footnoteWords,
  );
});

test("[test_calculate_article_word_count_citeproc] estimates citation words and parses cited bibliography entries", (t) => {
  const root = scratch(t);
  mkdirSync(join(root, "articles"));
  mkdirSync(join(root, ".academic-writer"));

  const md = `# Title

Claim supported by [@smith2020, p. 12] and [@cohen2019].
`;

  writeFileSync(join(root, "articles", "citeproc.md"), md);

  const bib = `@article{smith2020,
  author = {Smith, John},
  title = {A Great Study of Something Important},
  journal = {Journal of Studies},
  year = {2020}
}

@book{cohen2019,
  author = {Cohen, David},
  title = {The Big Book},
  publisher = {Acme Press},
  year = {2019}
}

@book{unused2018,
  author = {Unused, Author},
  title = {Not Cited Anywhere In The Text},
  year = {2018}
}
`;

  writeFileSync(join(root, ".academic-writer", "bibliography.bib"), bib);

  const counts = calculateArticleWordCount(root, "articles/citeproc.md", "apa");

  assert.equal(counts.citationCount, 2);
  assert.equal(counts.bibliographyEntriesCount, 2);
  assert.ok(counts.citationWords > 0);
  assert.ok(counts.bibliographyWords > 0);
  assert.equal(
    counts.expectedDocumentWords,
    counts.bodyWords +
      counts.footnoteWords +
      counts.citationWords +
      counts.bibliographyWords,
  );
});

test("[test_count_words_tool] registered tool returns details and formatted text", async (t) => {
  const root = scratch(t);
  mkdirSync(join(root, "articles"));

  writeFileSync(
    join(root, "articles", "essay.md"),
    "# Heading\n\nBody paragraph.\n",
  );

  const result = await callTool(root, "academic_writer_count_words", {
    article: "articles/essay.md",
    citationStyle: "inline-parenthetical",
  });

  assert.equal(result.isError, false);
  assert.ok(result.content[0]?.text.includes("Markdown source:"));
  assert.ok(result.content[0]?.text.includes("Expected document total:"));
  assert.equal(result.details.ok, true);
  assert.equal(result.details.markdownWords, 3);
});
