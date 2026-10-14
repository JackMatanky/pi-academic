import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, type TestContext } from "vitest";

import {
  analyzeCitationText,
  auditCitations,
  resolveCitationKeys,
  type CitationAuditDetails,
  type CitationAuditResult,
} from "../pi-academic-writer/citations/audit.js";

function details(result: CitationAuditResult): CitationAuditDetails {
  if (result.status === "error") throw new Error(result.error);

  return result;
}

function fixture(t: TestContext, article = "Text [@smith2020, p. 4].") {
  const root = mkdtempSync(join(tmpdir(), "citation-audit-"));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "articles"));
  mkdirSync(join(root, ".academic-writer"));
  writeFileSync(join(root, "articles", "essay.md"), article);
  writeFileSync(
    join(root, ".academic-writer", "sources.json"),
    JSON.stringify([{ citeKey: "smith2020" }]),
  );
  writeFileSync(
    join(root, ".academic-writer", "bibliography.bib"),
    "@book{smith2020, title={Book}}\n",
  );

  return root;
}

test("citeproc returns the complete stable result shape", (t) => {
  const root = fixture(t);
  assert.deepEqual(auditCitations("articles/essay.md", "chicago", root), {
    status: "passed",
    article: "articles/essay.md",
    citationStyle: "chicago",
    mode: "citeproc",
    assetScope: "global",
    sourcesPath: ".academic-writer/sources.json",
    bibliographyPath: ".academic-writer/bibliography.bib",
    markers: ["[@smith2020, p. 4]"],
    citationKeys: ["smith2020"],
    missingFromSources: [],
    missingFromBibliography: [],
    malformedMarkers: [],
    warnings: [],
  });
});

test("article assets take precedence even when only one exists", (t) => {
  const root = fixture(t);
  writeFileSync(
    join(root, "articles", "essay.sources.json"),
    '[{"citeKey":"local"}]',
  );
  assert.deepEqual(auditCitations("articles/essay.md", "apa", root), {
    status: "failed",
    article: "articles/essay.md",
    citationStyle: "apa",
    mode: "citeproc",
    assetScope: "article",
    sourcesPath: "articles/essay.sources.json",
    bibliographyPath: "articles/essay.bibliography.bib",
    markers: ["[@smith2020, p. 4]"],
    citationKeys: ["smith2020"],
    missingFromSources: [],
    missingFromBibliography: [],
    malformedMarkers: [],
    warnings: [],
    reason: "articles/essay.bibliography.bib not found",
  });
});

test("complete article-local assets override conflicting global assets", (t) => {
  const root = fixture(t, "Text [@local2024].");
  writeFileSync(
    join(root, "articles", "essay.sources.json"),
    JSON.stringify([{ citeKey: "local2024" }]),
  );
  writeFileSync(
    join(root, "articles", "essay.bibliography.bib"),
    "@book{local2024, title={Local}}\n",
  );
  const result = details(auditCitations("articles/essay.md", "chicago", root));
  assert.equal(result.status, "passed");
  assert.equal(result.assetScope, "article");
  assert.equal(result.sourcesPath, "articles/essay.sources.json");
  assert.equal(result.bibliographyPath, "articles/essay.bibliography.bib");
});

test("nested cite keys, bibliography keys and ordered missing keys", (t) => {
  const root = fixture(t, "[@a; @b] [@a] [@c] [@]");
  writeFileSync(
    join(root, ".academic-writer", "sources.json"),
    JSON.stringify({ nested: [{ citeKey: " a " }, { citeKey: "b" }] }),
  );
  writeFileSync(
    join(root, ".academic-writer", "bibliography.bib"),
    "@book{a, title={A}}\n@article{c, title={C}}\n",
  );
  const result = details(auditCitations("articles/essay.md", "mla", root));
  assert.deepEqual(result.markers, ["[@a; @b]", "[@a]", "[@c]", "[@]"]);
  assert.deepEqual(result.citationKeys, ["a", "b", "c"]);
  assert.deepEqual(result.malformedMarkers, ["[@]"]);
  assert.deepEqual(result.missingFromSources, ["c"]);
  assert.deepEqual(result.missingFromBibliography, ["b"]);
  assert.equal(result.status, "failed");
});

test("citeproc warns without markers and inline mode skips assets", (t) => {
  const root = fixture(t, "No citations.");
  const result = details(auditCitations("articles/essay.md", "chicago", root));
  assert.equal(result.status, "passed");
  assert.deepEqual(result.warnings, ["No Pandoc citeproc markers found"]);
  rmSync(join(root, ".academic-writer"), { recursive: true });
  assert.deepEqual(
    auditCitations("articles/essay.md", "inline-parenthetical", root),
    {
      status: "passed",
      article: "articles/essay.md",
      citationStyle: "inline-parenthetical",
      mode: "inline-parenthetical",
      assetScope: null,
      sourcesPath: null,
      bibliographyPath: null,
      markers: [],
      citationKeys: [],
      missingFromSources: [],
      missingFromBibliography: [],
      malformedMarkers: [],
      warnings: [],
    },
  );
  writeFileSync(join(root, "articles", "essay.md"), "[@smith2020]");
  assert.deepEqual(
    details(auditCitations("articles/essay.md", "inline-parenthetical", root)),
    {
      status: "failed",
      article: "articles/essay.md",
      citationStyle: "inline-parenthetical",
      mode: "inline-parenthetical",
      assetScope: null,
      sourcesPath: null,
      bibliographyPath: null,
      markers: ["[@smith2020]"],
      citationKeys: ["smith2020"],
      missingFromSources: [],
      missingFromBibliography: [],
      malformedMarkers: [],
      warnings: [],
      reason:
        "inline-parenthetical articles must not contain Pandoc citeproc markers",
    },
  );
});

test("invalid JSON and missing articles report operational errors", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, ".academic-writer", "sources.json"), "{");
  const invalid = auditCitations("articles/essay.md", "chicago", root);
  assert.equal(invalid.status, "error");

  if (invalid.status !== "error") throw new Error("expected parse error");
  assert.match(
    invalid.error,
    /^Could not read \.academic-writer\/sources\.json:/,
  );
  const absent = auditCitations("articles/missing.md", "chicago", root);
  assert.deepEqual(absent, {
    status: "error",
    error: `Article not found: ${join(root, "articles", "missing.md")}`,
  });
});

test("article paths cannot escape the project via traversal or symlinks", (t) => {
  const root = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), "citation-outside-"));
  t.onTestFinished(() => rmSync(outside, { recursive: true, force: true }));
  symlinkSync(outside, join(root, "articles", "outside"));

  for (const article of [
    "../outside.md",
    "articles/outside/new.md",
    join(outside, "essay.md"),
  ]) {
    assert.deepEqual(auditCitations(article, "chicago", root), {
      status: "error",
      error: `Path must stay inside the project: ${article}`,
    });
  }
});

test("analyzer extracts markers from content without filesystem access", () => {
  const analysis = analyzeCitationText(
    [
      "---",
      "title: ignored [@frontmatter]",
      "---",
      "Text [@smith2020, p. 4] with `[@inlinecode]` and [@jones1999].",
      "",
      "```ts",
      "const notACitation = [@fenced];",
      "```",
    ].join("\n"),
    "chicago",
  );

  assert.deepEqual(analysis.markers, ["[@smith2020, p. 4]", "[@jones1999]"]);
  assert.deepEqual(analysis.citationKeys.sort(), ["jones1999", "smith2020"]);
  assert.deepEqual(analysis.malformedMarkers, []);
  assert.deepEqual(analysis.warnings, []);
  assert.equal(analysis.status, "passed");
});

test("analyzer reports inline and malformed defects without assets", () => {
  const inline = analyzeCitationText(
    "See [@smith2020].",
    "inline-parenthetical",
  );

  assert.equal(inline.status, "failed");
  assert.equal(
    inline.reason,
    "inline-parenthetical articles must not contain Pandoc citeproc markers",
  );

  const malformed = analyzeCitationText("[@a] and [@]", "mla");

  assert.deepEqual(malformed.malformedMarkers, ["[@]"]);
  assert.equal(malformed.status, "failed");

  const quiet = analyzeCitationText("No citations here.", "chicago");

  assert.deepEqual(quiet.warnings, ["No Pandoc citeproc markers found"]);
  assert.equal(quiet.status, "passed");
});

test("key resolution compares decoded records without the filesystem", () => {
  assert.deepEqual(
    resolveCitationKeys(
      ["a", "b", "c"],
      { nested: [{ citeKey: " a " }, { citeKey: "b" }] },
      "@book{a, title={A}}\n@article{c, title={C}}\n",
    ),
    { missingFromSources: ["c"], missingFromBibliography: ["b"] },
  );
});

test("analyzer ignores BOM and frontmatter closed with ... delimiter", () => {
  const analysis = analyzeCitationText(
    "\uFEFF---\ntitle: Document [@frontmatter]\n...\nText [@smith2020].",
    "chicago",
  );

  assert.deepEqual(analysis.markers, ["[@smith2020]"]);
  assert.deepEqual(analysis.citationKeys, ["smith2020"]);
});

test("analyzer masks email addresses so they are not treated as narrative citations", () => {
  const analysis = analyzeCitationText(
    "Contact author@example.com or user.name@domain.org. According to @doe2021, this holds.",
    "chicago",
  );

  assert.deepEqual(analysis.citationKeys, ["doe2021"]);
  assert.ok(!analysis.citationKeys.includes("example.com"));
  assert.ok(!analysis.citationKeys.includes("domain.org"));
});

test("analyzer ignores inline code spans that cross line breaks", () => {
  const analysis = analyzeCitationText(
    [
      "Real claim [@realkey].",
      "",
      "Use `mymodule.config",
      "with @fakekey and [@faketoo] inside` here.",
      "",
      "Trailing prose [@otherkey].",
    ].join("\n"),
    "chicago",
  );

  assert.deepEqual(analysis.citationKeys, ["realkey", "otherkey"]);
  assert.ok(!analysis.citationKeys.includes("fakekey"));
  assert.ok(!analysis.markers.some((marker) => marker.includes("faketoo")));
  assert.equal(analysis.status, "passed");
});
