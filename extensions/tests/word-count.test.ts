import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, type TestContext } from "vitest";

import {
  calculateArticleWordCount,
  countWords,
} from "../pi-academic/prose/word-count.js";
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
  assert.equal(countWords("בית\u05BEספר"), 1);
  assert.equal(countWords("רש\u05F3י"), 1);
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

test("a YAML metadata block is left out of the body words but not the file's raw words", (t) => {
  const root = scratch(t);
  mkdirSync(join(root, "articles"));

  const body = "# Title\n\nThree plain words.\n";

  writeFileSync(join(root, "articles", "plain.md"), body);

  writeFileSync(
    join(root, "articles", "meta.md"),
    `---\ntitle: "A long title with many metadata words"\nlang: en-US\n---\n\n${body}`,
  );

  const plain = calculateArticleWordCount(root, "articles/plain.md", "apa");
  const meta = calculateArticleWordCount(root, "articles/meta.md", "apa");

  assert.equal(meta.bodyWords, plain.bodyWords);
  assert.equal(meta.expectedDocumentWords, plain.expectedDocumentWords);
  assert.ok(meta.markdownWords > plain.markdownWords);
});

test("[test_calculate_article_word_count_citeproc] estimates citation words and parses cited bibliography entries", (t) => {
  const root = scratch(t);
  mkdirSync(join(root, "articles"));
  mkdirSync(join(root, ".pi-academic"));

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

  writeFileSync(join(root, ".pi-academic", "bibliography.bib"), bib);

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

  const result = await callTool(root, "pi_academic_count_words", {
    article: "articles/essay.md",
    citationStyle: "inline-parenthetical",
  });

  assert.equal(result.isError, false);
  assert.ok(result.content[0]?.text.includes("Markdown source:"));
  assert.ok(result.content[0]?.text.includes("Expected document total:"));
  assert.equal(result.details.ok, true);
  assert.equal(result.details.markdownWords, 3);
});

test("[test_parse_bib_entries_multiline_at_symbol] does not truncate entry when abstract has newline starting with @online", (t) => {
  const root = scratch(t);
  mkdirSync(join(root, "articles"));
  mkdirSync(join(root, ".pi-academic"));

  const md = `# Title

Claim supported by [@smith2020].
`;

  writeFileSync(join(root, "articles", "test.md"), md);

  const bib = `@article{smith2020,
  author = {Smith, John},
  title = {A Study},
  abstract = {First line of abstract.
@online resources were consulted extensively during this project.},
  year = {2020}
}

@online{web2021,
  title = {Online Resource},
  year = {2021}
}
`;

  writeFileSync(join(root, ".pi-academic", "bibliography.bib"), bib);

  const counts = calculateArticleWordCount(root, "articles/test.md", "apa");

  assert.equal(counts.citationCount, 1);
  assert.equal(counts.bibliographyEntriesCount, 1);
  assert.equal(counts.bibliographyWords, 17);
});

test("[test_parse_bib_entries_unbalanced_braces_recovery] recovers when an entry has unclosed braces and preserves following entries", (t) => {
  const root = scratch(t);
  mkdirSync(join(root, "articles"));
  mkdirSync(join(root, ".pi-academic"));

  const md = `# Title

Claim one [@broken2019] and claim two [@smith2020].
`;

  writeFileSync(join(root, "articles", "test.md"), md);

  const bib = `@article{broken2019,
  author = {Broken, Ben},
  title = {Unclosed { brace in field,
@article{smith2020,
  author = {Smith, John},
  title = {A Study},
  year = {2020}
}
`;

  writeFileSync(join(root, ".pi-academic", "bibliography.bib"), bib);

  const counts = calculateArticleWordCount(root, "articles/test.md", "apa");

  assert.equal(counts.citationCount, 2);
  assert.equal(counts.bibliographyEntriesCount, 2);
  assert.ok(counts.bibliographyWords > 0);
});
