import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { strFromU8, unzipSync } from "fflate";
import { test, type TestContext } from "vitest";

import { bibliographyTitle } from "../pi-academic/citations/csl-resolver.js";
import { createToolHarness } from "./helpers.js";

const hasPandoc = !!spawnSync("which", ["pandoc"], { encoding: "utf8" }).stdout;

const needsPandoc = { skip: !hasPandoc };

const { callTool } = createToolHarness();

// Written inline: the package ships no CSL files.
const CSL = `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="in-text" version="1.0" default-locale="en-US">
  <info><title>Test</title><id>http://example.org/test</id><updated>2020-01-01T00:00:00+00:00</updated></info>
  <citation><layout prefix="(" suffix=")"><text variable="citation-number"/></layout></citation>
  <bibliography><layout><text variable="title"/></layout></bibliography>
</style>`;

const BIB =
  "@book{mm, author={Maimonides, Moses}, title={Treatise}, year={1938}}\n";

/**
 * A project whose `articles/essay.md` is `markdown`, exported with the `apa`
 * alias (so the package's own title for the style applies).
 */
async function exportEssay(
  t: TestContext,
  markdown: string,
  formats: string[],
  style = "apa",
): Promise<string> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "bib-page-")));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, ".academic-writer"));
  mkdirSync(join(root, "articles"));
  writeFileSync(join(root, "style.csl"), CSL);
  writeFileSync(join(root, ".academic-writer", "bibliography.bib"), BIB);
  writeFileSync(
    join(root, ".academic-writer", "sources.json"),
    JSON.stringify([{ citeKey: "mm" }]),
  );
  writeFileSync(join(root, "articles", "essay.md"), markdown);

  const result = await callTool(root, "academic_writer_export_article", {
    article: "articles/essay.md",
    citationStyle: style,
    formats,
    csl: "style.csl",
  });

  assert.equal(result.details.ok, true, result.content[0]?.text ?? "");

  return root;
}

const docxXml = (root: string) =>
  strFromU8(
    unzipSync(readFileSync(join(root, "articles", "essay.docx")))[
      "word/document.xml"
    ] ?? new Uint8Array(),
  );

test("the title comes from the citation style, case-insensitively", () => {
  assert.equal(bibliographyTitle("apa"), "References");
  assert.equal(bibliographyTitle("MLA"), "Works Cited");
  assert.equal(bibliographyTitle("chicago"), "Bibliography");
  assert.equal(bibliographyTitle("chicago-author-date"), "References");
  assert.equal(bibliographyTitle("some-journal-style"), undefined);
});

test(
  "docx: the style's heading starts a new page, with no empty paragraph before it",
  needsPandoc,
  async (t) => {
    const root = await exportEssay(t, "Claim [@mm, p. 5].\n", ["docx"]);

    assert.match(
      docxXml(root),
      /<w:pStyle w:val="Heading1"\/><w:pageBreakBefore\/><\/w:pPr><w:r><w:t xml:space="preserve">References<\/w:t>/,
    );
    assert.doesNotMatch(docxXml(root), /<w:br w:type="page"\/>/);
  },
);

test("latex: a page break precedes the heading", needsPandoc, async (t) => {
  const root = await exportEssay(t, "Claim [@mm, p. 5].\n", ["latex"], "mla");

  assert.match(
    readFileSync(join(root, "articles", "essay.tex"), "utf8"),
    /\\clearpage\s+\\section\*\{Works Cited\}/,
  );
});

test(
  "odt: the heading uses a page-break style that the file defines",
  needsPandoc,
  async (t) => {
    const root = await exportEssay(t, "Claim [@mm, p. 5].\n", ["odt"]);

    const parts = unzipSync(readFileSync(join(root, "articles", "essay.odt")));
    const content = strFromU8(parts["content.xml"] ?? new Uint8Array());
    const styles = strFromU8(parts["styles.xml"] ?? new Uint8Array());

    assert.match(
      content,
      /<text:h text:style-name="Bibliography_20_Heading_20_1" text:outline-level="1">References<\/text:h>/,
    );
    assert.match(
      styles,
      /style:name="Bibliography_20_Heading_20_1"[^>]*style:parent-style-name="Heading_20_1"><style:paragraph-properties fo:break-before="page"\/>/,
    );
    assert.equal(Object.keys(parts)[0], "mimetype");
  },
);

test(
  "a title the article sets, or a heading it already has, is not replaced",
  needsPandoc,
  async (t) => {
    const own = await exportEssay(
      t,
      "---\nreference-section-title: Sources\n---\n\nClaim [@mm].\n",
      ["docx"],
    );

    assert.match(docxXml(own), />Sources</);
    assert.doesNotMatch(docxXml(own), />References</);

    const written = await exportEssay(
      t,
      "Claim [@mm].\n\n# Works consulted\n",
      ["docx"],
    );

    assert.match(docxXml(written), /<w:pageBreakBefore\/>.*>Works consulted</);
    assert.doesNotMatch(docxXml(written), />References</);
  },
);

test(
  "a non-English article gets no English title but still breaks the page",
  needsPandoc,
  async (t) => {
    const root = await exportEssay(t, "---\nlang: de\n---\n\nClaim [@mm].\n", [
      "docx",
    ]);

    assert.doesNotMatch(docxXml(root), />References</);
    assert.match(docxXml(root), /<w:br w:type="page"\/>/);
  },
);
