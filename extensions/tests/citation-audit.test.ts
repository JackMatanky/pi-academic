import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import {
  auditCitations,
  type CitationAuditDetails,
  type CitationAuditResult,
} from "../pi-academic-writer/citation-audit.js";

/** Narrow to a full audit result; invalid project/article paths return only an error. */
function details(result: CitationAuditResult): CitationAuditDetails {
  assert.ok("markers" in result, "expected a full audit result");

  return result;
}

function fixture(t: TestContext, article = "Text [@smith2020, p. 4].") {
  const root = mkdtempSync(join(tmpdir(), "citation-audit-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
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
    ok: true,
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
    ok: false,
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
    error: "articles/essay.bibliography.bib not found",
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
  const result = auditCitations("articles/essay.md", "chicago", root);
  assert.equal(result.ok, true);
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
  assert.equal(result.ok, false);
});

test("citeproc warns without markers and inline mode skips assets", (t) => {
  const root = fixture(t, "No citations.");
  const result = auditCitations("articles/essay.md", "chicago", root);
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, ["No Pandoc citeproc markers found"]);
  rmSync(join(root, ".academic-writer"), { recursive: true });
  assert.deepEqual(
    auditCitations("articles/essay.md", "inline-parenthetical", root),
    {
      ok: true,
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
  assert.equal(
    auditCitations("articles/essay.md", "inline-parenthetical", root).error,
    "inline-parenthetical articles must not contain Pandoc citeproc markers",
  );
});

test("invalid JSON and missing files report failures without throwing", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, ".academic-writer", "sources.json"), "{");
  const invalid = details(auditCitations("articles/essay.md", "chicago", root));
  assert.equal(invalid.ok, false);
  assert.match(
    invalid.error ?? "",
    /^Could not read \.academic-writer\/sources\.json:/,
  );
  assert.deepEqual(invalid.citationKeys, ["smith2020"]);
  const absent = auditCitations("articles/missing.md", "chicago", root);
  assert.equal(absent.ok, false);
  assert.equal(
    absent.error,
    `Article not found: ${join(realpathSync(root), "articles", "missing.md")}`,
  );
});

test("article paths cannot escape the project via traversal or symlinks", (t) => {
  const root = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), "citation-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  symlinkSync(outside, join(root, "articles", "outside"));

  for (const article of [
    "../outside.md",
    "articles/outside/new.md",
    join(outside, "essay.md"),
  ]) {
    assert.deepEqual(auditCitations(article, "chicago", root), {
      ok: false,
      error: `Path must stay inside project root: ${article}`,
    });
  }
});
