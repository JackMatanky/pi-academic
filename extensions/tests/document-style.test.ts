import type { JsonObject } from "../lib/schema.js";

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { strFromU8, unzipSync } from "fflate";
import { test, type TestContext } from "vitest";

import {
  checkStylePackage,
  installStarterPackage,
  listStylePackages,
  renderDocumentStyle,
} from "../pi-academic-writer/document-style.js";
import { formatDesign } from "../pi-academic-writer/docx-generator.js";
import { defaultReference, runPandoc } from "../pi-academic-writer/pandoc.js";
import {
  loadStarterDesign,
  loadStylePackage,
} from "../pi-academic-writer/style-design.js";
import { buildDocxReference } from "../pi-academic-writer/style-docx.js";
import {
  buildLatexPreamble,
  spliceLatexColors,
} from "../pi-academic-writer/style-latex.js";

const hasPandoc = spawnSync("pandoc", ["--version"]).status === 0;

const needsPandoc = { skip: !hasPandoc };

function project(t: TestContext): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "document-style-")));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  return root;
}

/**
 * Write a package whose design.json is `design`, merged over
 * name/schemaVersion.
 */
function writePackage(
  root: string,
  name: string,
  design: JsonObject,
  files: Record<string, string> = {},
): string {
  const dir = join(root, ".academic-writer", "styles", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "design.json"),
    JSON.stringify({ schemaVersion: 1, name, ...design }),
  );

  for (const [file, content] of Object.entries(files)) {
    writeFileSync(join(dir, file), content);
  }

  return dir;
}

function zipEntry(path: string, entry: string): string {
  const entries = unzipSync(new Uint8Array(readFileSync(path)));
  const data = entries[entry];
  assert.ok(data, `${entry} missing from ${path}`);

  return strFromU8(data);
}

test("invalid designs name the field and the correction", (t) => {
  const root = project(t);

  const cases: [JsonObject, RegExp][] = [
    [{ components: { body: { color: "red" } } }, /components\.body\.color/],
    [
      { components: { body: { lineSpacing: 5 } } },
      /components\.body\.lineSpacing/,
    ],
    [
      { components: { body: { fontSizePT: 12 } } },
      /components\.body\.fontSizePT/,
    ],
    [{ components: { nothing: {} } }, /components\.nothing/],
    [{ page: { size: "A3" } }, /page\.size/],
    [{ page: { marginsMm: { top: -1 } } }, /page\.marginsMm\.top/],
    [
      { formats: { pdf: { engine: "pdflatex" } } },
      /formats\.pdf\.engine: use xelatex or tectonic/,
    ],
    [
      { formats: { docx: { referenceDocument: "../outside.docx" } } },
      /formats\.docx\.referenceDocument/,
    ],
    [
      { formats: { docx: { referenceDocument: "/etc/ref.docx" } } },
      /formats\.docx\.referenceDocument/,
    ],
    [
      { formats: { docx: { referenceDocument: "missing.docx" } } },
      /create the referenced file inside the package/,
    ],
    [
      { formats: { latex: { template: "x.txt" } } },
      /formats\.latex\.template: use a relative \.tex file/,
    ],
  ];

  cases.forEach(([design, pattern], index) => {
    const name = `bad-${index}`;
    writePackage(root, name, design);
    assert.throws(
      () => loadStylePackage(root, name, ["docx", "odt", "latex", "pdf"]),
      pattern,
      `case ${index}`,
    );
  });
  writePackage(root, "wrong-name", { name: "other" });
  assert.throws(
    () => loadStylePackage(root, "wrong-name", []),
    /matching name/,
  );
  assert.throws(
    () => loadStylePackage(root, "Bad Name", []),
    /lowercase letters/,
  );
  assert.throws(
    () => loadStylePackage(root, "absent", []),
    /create \.academic-writer\/styles/,
  );
});

test("a symlinked asset cannot point outside the package", (t) => {
  const root = project(t);
  const outside = join(root, "secret.docx");
  writeFileSync(outside, "x");

  const dir = writePackage(root, "linked", {
    formats: { docx: { referenceDocument: "ref.docx" } },
  });

  symlinkSync(outside, join(dir, "ref.docx"));
  assert.throws(
    () => loadStylePackage(root, "linked", ["docx"]),
    /must stay inside the package/,
  );
});

test("omitted properties merge from the starter and explicit components are tracked", (t) => {
  const root = project(t);
  writePackage(root, "slim", { components: { body: { fontSizePt: 14 } } });
  const loaded = loadStylePackage(root, "slim", []);
  assert.equal(loaded.design.components.body?.fontSizePt, 14);
  assert.equal(loaded.design.components.body?.fontFamily, "Times New Roman");
  assert.equal(loaded.design.components.heading1?.fontSizePt, 14);
  assert.equal(loaded.design.page.size, "A4");
  assert.deepEqual(
    [...loaded.explicit].map(([component, props]) => [component, [...props]]),
    [["body", ["fontSizePt"]]],
    "only properties that differ from the starter count as researcher changes",
  );
});

test("packaged style starters install their own design merged over the starter", async (t) => {
  const root = project(t);

  const installed = await installStarterPackage(root, "apa-7");

  const written = JSON.parse(
    readFileSync(join(installed.directory, "design.json"), "utf8"),
  );

  assert.equal(written.name, "apa-7");
  assert.equal(written.components.body.lineSpacing, 2);

  const loaded = loadStylePackage(root, "apa-7", []);
  const merged = loaded.design.components;
  assert.equal(loaded.design.page.size, "Letter");
  assert.equal(merged.body?.lineSpacing, 2);
  assert.equal(merged.body?.alignment, "left");
  assert.equal(merged.heading1?.alignment, "center");
  assert.equal(merged.table?.cellPaddingMm, 1.5);
});

test(
  "the starter installs editable native files and never overwrites",
  needsPandoc,
  async (t) => {
    const root = project(t);

    const installed = await installStarterPackage(root);
    assert.deepEqual(installed.files, [
      "design.json",
      "native/reference.docx",
      "native/reference.odt",
      "native/preamble.tex",
    ]);
    assert.deepEqual(listStylePackages(root), ["academic-default"]);
    const dir = installed.directory;
    assert.match(
      zipEntry(join(dir, "native", "reference.docx"), "word/footnotes.xml"),
      /footnote/,
    );
    assert.match(
      zipEntry(join(dir, "native", "reference.odt"), "styles.xml"),
      /Heading_20_1/,
    );
    assert.match(
      readFileSync(join(dir, "native", "preamble.tex"), "utf8"),
      /\\usepackage\[a4paper/,
    );

    await assert.rejects(installStarterPackage(root), /already exists/);
    const second = await installStarterPackage(root, "journal");
    assert.equal(
      JSON.parse(readFileSync(join(second.directory, "design.json"), "utf8"))
        .name,
      "journal",
    );
  },
);

test(
  "docx: styles, page, footer and footnotes reach a real Pandoc document",
  needsPandoc,
  async (t) => {
    const root = project(t);
    writePackage(root, "docx-pkg", {
      page: {
        size: "Letter",
        marginsMm: { top: 20, bottom: 30 },
        footerDistanceMm: 10,
      },
      components: {
        heading1: { fontFamily: "Georgia", fontSizePt: 20, color: "#112233" },
        body: { lineSpacing: 2, firstLineIndentMm: 5 },
        hyperlink: { color: "#0000FF" },
      },
    });

    const style = await renderDocumentStyle(
      root,
      "docx-pkg",
      "docx",
      join(root, "out"),
    );

    assert.deepEqual(style.generated, ["referenceDocument"]);
    assert.deepEqual(style.args, [
      `--reference-doc=${style.assets.referenceDocument}`,
    ]);
    const reference = style.assets.referenceDocument ?? "";
    const styles = zipEntry(reference, "word/styles.xml");

    const heading =
      styles.match(
        /<w:style [^>]*w:styleId="Heading1"[\s\S]*?<\/w:style>/,
      )?.[0] ?? "";

    assert.match(heading, /w:ascii="Georgia"/);
    assert.match(heading, /<w:sz w:val="40"/);
    assert.match(heading, /<w:color w:val="112233"/);
    assert.doesNotMatch(
      heading,
      /themeColor/,
      "theme attributes override explicit colour in Word",
    );
    assert.match(
      styles.match(/w:styleId="BodyText"[\s\S]*?<\/w:style>/)?.[0] ?? "",
      /w:line="480"/,
    );

    const section =
      zipEntry(reference, "word/document.xml").match(
        /<w:sectPr[\s\S]*?<\/w:sectPr>/,
      )?.[0] ?? "";

    assert.match(section, /<w:pgSz w:w="12240" w:h="15840"/);
    assert.match(section, /w:top="1134" w:right="1440" w:bottom="1701"/);
    assert.match(section, /w:footer="567"/);
    assert.match(zipEntry(reference, "word/footer1.xml"), /PAGE/);

    writeFileSync(
      join(root, "a.md"),
      "Para.[^1]\n\n# Head\n\n[^1]: Note text.\n",
    );
    const out = join(root, "a.docx");
    await runPandoc(["a.md", ...style.args, "-o", out], { cwd: root });
    assert.match(zipEntry(out, "word/footnotes.xml"), /Note text/);
    assert.match(zipEntry(out, "word/document.xml"), /<w:footerReference/);
    assert.match(zipEntry(out, "word/footer1.xml"), /PAGE/);
  },
);

test(
  "docx: a native reference is used as supplied and the design is reported as unapplied",
  needsPandoc,
  async (t) => {
    const root = project(t);

    const dir = writePackage(
      root,
      "native",
      {
        components: { body: { fontSizePt: 9 } },
        formats: { docx: { referenceDocument: "mine.docx" } },
      },
      { "mine.docx": "not really a docx" },
    );

    const style = await renderDocumentStyle(
      root,
      "native",
      "docx",
      join(root, "out"),
    );

    assert.deepEqual(style.generated, []);
    assert.equal(
      style.assets.referenceDocument,
      join(realpathSync(dir), "mine.docx"),
    );
    assert.deepEqual(style.warnings, [
      "docx: native referenceDocument is used as supplied; design.json components are not applied to it",
    ]);
  },
);

test(
  "unsupported components are reported only when the researcher wrote them",
  needsPandoc,
  async (t) => {
    const root = project(t);
    writePackage(root, "plain", {});

    const plain = await renderDocumentStyle(
      root,
      "plain",
      "docx",
      join(root, "o1"),
    );

    assert.deepEqual(plain.warnings, [], "starter defaults must not warn");
    writePackage(root, "wrote-it", {
      components: {
        citation: { bold: true },
        footnoteReference: { alignment: "center" },
      },
    });

    const docx = await renderDocumentStyle(
      root,
      "wrote-it",
      "docx",
      join(root, "o2"),
    );

    assert.ok(
      docx.warnings.some((w) =>
        w.includes("components.citation is not applied"),
      ),
    );
    assert.ok(
      docx.warnings.some(
        (w) =>
          w.includes("footnoteReference.alignment is not applied") &&
          w.includes("character style"),
      ),
    );

    const latex = await renderDocumentStyle(
      root,
      "wrote-it",
      "latex",
      join(root, "o3"),
    );

    assert.ok(
      latex.warnings.some((w) => w.startsWith("latex: components.citation")),
    );
  },
);

test(
  "odt: styles, page layout and footer land in styles.xml with mimetype first",
  needsPandoc,
  async (t) => {
    const root = project(t);
    writePackage(root, "odt-pkg", {
      page: { marginsMm: { left: 30 }, footerDistanceMm: 10 },
      components: {
        heading1: { fontSizePt: 22, bold: true },
        body: { lineSpacing: 1.5, alignment: "justify" },
      },
    });

    const style = await renderDocumentStyle(
      root,
      "odt-pkg",
      "odt",
      join(root, "out"),
    );

    const path = style.assets.referenceDocument ?? "";
    const bytes = new Uint8Array(readFileSync(path));
    assert.equal(
      Buffer.from(bytes.subarray(30, 38)).toString(),
      "mimetype",
      "mimetype must be the first entry",
    );
    const styles = zipEntry(path, "styles.xml");

    const heading =
      styles.match(/style:name="Heading_20_1"[\s\S]*?<\/style:style>/)?.[0] ??
      "";

    assert.match(heading, /fo:font-size="22pt"/);
    assert.match(heading, /fo:font-weight="bold"/);
    assert.match(
      styles.match(/style:name="Text_20_body"[\s\S]*?<\/style:style>/)?.[0] ??
        "",
      /fo:line-height="150%"/,
    );
    assert.match(styles, /fo:page-width="210mm"/);
    assert.match(styles, /fo:margin-left="30mm"/);
    assert.match(styles, /fo:margin-bottom="10mm"/);
    const out = join(root, "b.odt");
    writeFileSync(join(root, "b.md"), "# T\n\nBody.\n");
    await runPandoc(["b.md", ...style.args, "-o", out], { cwd: root });
    assert.match(zipEntry(out, "styles.xml"), /fo:font-size="22pt"/);
  },
);

test(
  "latex: the preamble carries geometry, headings, spacing, and a footer page number",
  needsPandoc,
  async (t) => {
    const root = project(t);
    writePackage(root, "tex-pkg", {
      page: {
        size: "Letter",
        orientation: "landscape",
        marginsMm: { top: 20 },
        footerDistanceMm: 10,
      },
      components: {
        body: { lineSpacing: 2, fontSizePt: 11 },
        heading1: {
          fontSizePt: 18,
          bold: true,
          color: "#112233",
          pageBreakBefore: true,
        },
        heading6: { bold: true },
        footer: { alignment: "right" },
      },
    });

    const style = await renderDocumentStyle(
      root,
      "tex-pkg",
      "latex",
      join(root, "out"),
    );

    const tex = readFileSync(style.assets.preamble ?? "", "utf8");
    assert.match(
      tex,
      /\\usepackage\[letterpaper,top=20mm,bottom=25\.4mm,left=25\.4mm,right=25\.4mm,landscape,footskip=15\.4mm\]\{geometry\}/,
    );
    assert.match(
      tex,
      /\\titleformat\{\\section\}\[hang\]\{\\normalfont\\fontsize\{18pt\}\{21\.6pt\}\\selectfont\\bfseries\\color\{awheading1\}\}/,
    );
    assert.match(tex, /\\definecolor\{awheading1\}\{HTML\}\{112233\}/);
    assert.match(tex, /\\pretocmd\{\\section\}\{\\clearpage\}/);
    assert.match(tex, /\\setstretch\{2\}/);
    assert.match(tex, /\\fancyfoot\[R\]/);
    assert.ok(
      tex.indexOf("\\definecolor{awheading1}") <
        tex.indexOf("\\titleformat{\\section}"),
      "colours must be defined before use",
    );
    assert.ok(
      style.warnings.some((w) =>
        w.startsWith("latex: components.heading6 is not applied"),
      ),
    );
    assert.deepEqual(style.args, [
      `--include-in-header=${style.assets.preamble}`,
    ]);
    writeFileSync(join(root, "c.md"), "# Head\n\nBody text.\n");
    await runPandoc(["c.md", "-s", ...style.args, "-o", join(root, "c.tex")], {
      cwd: root,
    });
    assert.match(
      readFileSync(join(root, "c.tex"), "utf8"),
      /\\titleformat\{\\section\}/,
    );
  },
);

test(
  "pdf inherits latex assets, takes its own engine, and honours a native template",
  needsPandoc,
  async (t) => {
    const root = project(t);

    const dir = writePackage(
      root,
      "pdf-pkg",
      {
        formats: {
          latex: { template: "shared.tex" },
          pdf: { engine: "tectonic" },
        },
      },
      {
        "shared.tex":
          "\\documentclass{article}\n\\begin{document}\n$body$\n\\end{document}\n",
      },
    );

    const style = await renderDocumentStyle(
      root,
      "pdf-pkg",
      "pdf",
      join(root, "out"),
    );

    assert.equal(style.assets.engine, "tectonic");
    assert.equal(style.assets.template, join(realpathSync(dir), "shared.tex"));
    assert.deepEqual(style.args, [
      `--template=${style.assets.template}`,
      `--include-in-header=${style.assets.preamble}`,
    ]);
  },
);

test(
  "checkStylePackage reports failing formats without aborting the others",
  needsPandoc,
  async (t) => {
    const root = project(t);
    writePackage(root, "partly-bad", {
      formats: {
        pdf: { engine: "pdflatex" },
        docx: { referenceDocument: "gone.docx" },
      },
    });
    const check = await checkStylePackage(root, "partly-bad");
    assert.equal(check.ok, false);
    assert.deepEqual(check.errors.map((e) => e.format).sort(), ["docx", "pdf"]);
    writePackage(root, "fine", {});
    const ok = await checkStylePackage(root, "fine");
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.errors, []);
  },
);

test(
  "buildDocxReference is idempotent and does not duplicate footer relationship or content type",
  needsPandoc,
  async () => {
    const base = await defaultReference("docx");
    const design = formatDesign({});
    const first = buildDocxReference(design, base, new Map());
    const second = buildDocxReference(design, first.bytes, new Map());

    const rels = strFromU8(
      unzipSync(second.bytes)["word/_rels/document.xml.rels"] ??
        new Uint8Array(),
    );

    const matches = [...rels.matchAll(/Id="rIdAwFooter1"/g)];
    assert.equal(matches.length, 1);

    const types = strFromU8(
      unzipSync(second.bytes)["[Content_Types].xml"] ?? new Uint8Array(),
    );

    const typeMatches = [...types.matchAll(/PartName="\/word\/footer1\.xml"/g)];
    assert.equal(typeMatches.length, 1);
  },
);

test("spliceLatexColors inserts colors after xcolor when present, or appends xcolor and colors after packages when missing", () => {
  const withXcolor = [
    "% Header",
    "\\usepackage{geometry}",
    "\\usepackage{xcolor}",
    "\\usepackage{setspace}",
  ];

  spliceLatexColors(withXcolor, ["\\definecolor{awbody}{HTML}{112233}"]);
  assert.deepEqual(withXcolor, [
    "% Header",
    "\\usepackage{geometry}",
    "\\usepackage{xcolor}",
    "\\definecolor{awbody}{HTML}{112233}",
    "\\usepackage{setspace}",
  ]);

  const missingXcolor = [
    "% Header",
    "\\usepackage{geometry}",
    "\\usepackage{setspace}",
    "\\makeatletter",
  ];

  spliceLatexColors(missingXcolor, ["\\definecolor{awbody}{HTML}{112233}"]);
  assert.deepEqual(missingXcolor, [
    "% Header",
    "\\usepackage{geometry}",
    "\\usepackage{setspace}",
    "\\usepackage{xcolor}",
    "\\definecolor{awbody}{HTML}{112233}",
    "\\makeatletter",
  ]);

  const noPackages = ["% Bare template"];
  spliceLatexColors(noPackages, ["\\definecolor{awbody}{HTML}{112233}"]);
  assert.deepEqual(noPackages, [
    "% Bare template",
    "\\usepackage{xcolor}",
    "\\definecolor{awbody}{HTML}{112233}",
  ]);
});

test("buildLatexPreamble carries xcolor and color definitions preceding their use", () => {
  const starter = loadStarterDesign();

  const design = {
    ...starter,
    components: {
      ...starter.components,
      body: { ...starter.components.body, color: "#112233" },
    },
  };

  const preamble = buildLatexPreamble(design, new Map());
  assert.match(preamble.tex, /\\usepackage\{xcolor\}/);
  assert.match(preamble.tex, /\\definecolor\{awbody\}\{HTML\}\{112233\}/);
  const xcolorIdx = preamble.tex.indexOf("\\usepackage{xcolor}");

  const defColorIdx = preamble.tex.indexOf(
    "\\definecolor{awbody}{HTML}{112233}",
  );

  assert.ok(xcolorIdx !== -1 && defColorIdx !== -1);
  assert.ok(defColorIdx > xcolorIdx);
});
