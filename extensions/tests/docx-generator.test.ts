import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { strFromU8, unzipSync, zipSync, strToU8 } from "fflate";
import { test, type TestContext } from "vitest";

import {
  parseArticle,
  type ArticleData,
} from "../pi-academic/article/article.js";
import {
  articleMarkdown,
  escapeMarkdown,
  generateDocx,
  formatDesign,
} from "../pi-academic/article/docx-generator.js";
import { cleanRtlText } from "../pi-academic/prose/typography.js";

const hasPandoc = spawnSync("pandoc", ["--version"]).status === 0;

const needsPandoc = { skip: !hasPandoc };

function project(t: TestContext): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "docx-generator-")));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  return root;
}

function part(path: string, entry: string): string {
  const data = unzipSync(new Uint8Array(readFileSync(path)))[entry];
  assert.ok(data, `${entry} missing`);

  return strFromU8(data);
}

/**
 * Text of every w:t run, entity-decoded and joined, to compare against source
 * text.
 */
function runText(xml: string): string {
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)]
    .map((m) => m[1] ?? "")
    .join("")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function build(
  t: TestContext,
  article: ArticleData,
  referenceDoc?: string,
): Promise<{ root: string; out: string }> {
  const root = project(t);
  writeFileSync(join(root, "a.json"), JSON.stringify(article));
  await generateDocx("a.json", "a.docx", root, { referenceDoc });

  return { root, out: join(root, "a.docx") };
}

test("footnotes follow the cursor, unmatched markers are placed at cursor rather than dropped", () => {
  const { markdown, footnotes } = articleMarkdown(
    {
      sections: [
        {
          paragraphs: [
            {
              text: "Hello world, then more. Later again.",
              footnotes: [
                { after: "world", text: "one" },
                { after: "nowhere", text: "skipped" },
                { after: "Later", text: "two" },
                { after: "world", text: "behind the cursor, so skipped" },
                { after: "", text: "empty marker is skipped" },
              ],
            },
          ],
        },
      ],
    },
    false,
  );

  assert.equal(footnotes, 5);
  assert.equal(
    markdown,
    "Hello world[^1][^2]\\, then more\\. Later[^3][^4][^5] again\\.\n\n[^1]: one\n\n[^2]: skipped\n\n[^3]: two\n\n[^4]: behind the cursor\\, so skipped\n\n[^5]: empty marker is skipped\n",
  );
});

test("user text is made literal for Pandoc markdown", () => {
  assert.equal(
    escapeMarkdown("  *a*  _b_ # c\n[d](e) 1. f  "),
    "\\*a\\* \\_b\\_ \\# c \\[d\\]\\(e\\) 1\\. f",
  );
  assert.equal(escapeMarkdown("שלום, עולם"), "שלום\\, עולם");
});

test("Hebrew typography cleanup applies to RTL text only and keeps hyphens", () => {
  assert.equal(
    cleanRtlText('a \u2014 b "ציטוט" well-known'),
    "a - b \u05f4ציטוט\u05f4 well-known",
  );
  assert.equal(cleanRtlText("a\u2014b"), "a - b");
  assert.equal(cleanRtlText('say "hi" ok'), 'say "hi" ok');
  assert.equal(cleanRtlText(".NET is a framework"), ".NET is a framework");
  assert.equal(cleanRtlText(", orphan"), "orphan");
  assert.equal(cleanRtlText(", marker", false), ", marker");
  assert.equal(cleanRtlText("x\u200f\u200e\u200fy"), "xy");

  const rtl = articleMarkdown(
    { sections: [{ paragraphs: ['say "שלום" \u2014 ok'] }] },
    true,
  ).markdown;

  const ltr = articleMarkdown(
    { sections: [{ paragraphs: ['say "hi" \u2014 ok'] }] },
    false,
  ).markdown;

  assert.match(rtl, /\u05f4שלום\u05f4/);
  assert.match(ltr, /\\"hi\\"/);
});

test("malformed article payloads are rejected with the offending path", () => {
  assert.throws(() => parseArticle({}), /sections/);
  assert.throws(() => parseArticle({ sections: [{}] }), /sections\/0/);
  assert.throws(
    () => parseArticle({ sections: [{ paragraphs: [3] }] }),
    /sections\/0\/paragraphs\/0/,
  );
  assert.throws(
    () =>
      parseArticle({
        sections: [{ paragraphs: [{ text: "t", footnotes: [{ after: 1 }] }] }],
      }),
    /paragraphs\/0/,
  );
});

test("article format values become the style design", () => {
  const design = formatDesign({
    font: "Arial",
    bodySize: 10,
    margins: 2,
    lineSpacing: 1,
    isRtl: false,
  });

  assert.equal(design.components.body?.fontFamily, "Arial");
  assert.equal(design.components.body?.fontSizePt, 10);
  assert.equal(design.components.heading1?.alignment, "left");
  assert.equal(design.page.marginsMm.top, 50.8);
  assert.equal(formatDesign({}).components.heading1?.alignment, "right");
});

test(
  "docx: real footnotes, literal text, headings, abstracts, title and page numbers",
  needsPandoc,
  async (t) => {
    const literal = "*not italic* _x_ [not a link](http://x.org) 1. not a list";

    const { out } = await build(t, {
      title: "Title *with* markup",
      thesis: "A subtitle",
      abstract: { primary: "תקציר ראשי", secondary: "Second abstract" },
      sections: [
        {
          title: "פרק א",
          paragraphs: [
            {
              text: `${literal} end.`,
              footnotes: [{ after: "list", text: "הערה אחת" }],
            },
          ],
        },
      ],
    });

    const doc = part(out, "word/document.xml");
    assert.equal(
      runText(doc).includes(literal),
      true,
      "markup characters must stay literal",
    );
    assert.doesNotMatch(doc, /<w:hyperlink/);
    assert.doesNotMatch(doc, /<w:i\s*\/>/);
    assert.match(doc, /w:pStyle w:val="Title"/);
    assert.match(doc, /w:pStyle w:val="Subtitle"/);
    assert.match(doc, /w:pStyle w:val="Heading1"/);
    assert.match(doc, /w:pStyle w:val="AbstractTitle"/);
    assert.match(
      runText(doc),
      /^Title \*with\* markup/,
      "title metadata stays literal",
    );
    // The footnote reference sits right after "list", before " end.".
    assert.match(
      doc,
      /not a list<\/w:t><\/w:r><w:r><w:rPr><w:rStyle w:val="FootnoteReference" \/><\/w:rPr><w:footnoteReference w:id="\d+" \/><\/w:r>(?:(?!<\/w:p>)[\s\S])*?end\./,
    );
    assert.match(part(out, "word/footnotes.xml"), /הערה אחת/);
    assert.match(part(out, "word/footer1.xml"), /PAGE/);
    assert.match(doc, /<w:footerReference/);
  },
);

test(
  "docx: RTL articles are bidi throughout and LTR articles are not",
  needsPandoc,
  async (t) => {
    const paragraph = {
      text: "טקסט עם הערה",
      footnotes: [{ after: "הערה", text: "הערת שוליים" }],
    };

    const rtl = await build(t, {
      sections: [{ title: "כותרת", paragraphs: [paragraph] }],
    });

    assert.match(part(rtl.out, "word/document.xml"), /<w:bidi/);
    assert.match(part(rtl.out, "word/footnotes.xml"), /<w:bidi/);

    const ltr = await build(t, {
      format: { isRtl: false },
      sections: [
        { paragraphs: [{ text: 'Plain "quoted" text', footnotes: [] }] },
      ],
    });

    const ltrDoc = part(ltr.out, "word/document.xml");
    assert.doesNotMatch(ltrDoc, /<w:bidi/);
    assert.equal(runText(ltrDoc), 'Plain "quoted" text');
  },
);

test(
  "docx: the article format drives fonts, sizes, spacing and margins",
  needsPandoc,
  async (t) => {
    const { out } = await build(t, {
      format: {
        font: "Arial",
        bodySize: 10,
        lineSpacing: 2,
        margins: 1.5,
        isRtl: false,
      },
      sections: [{ paragraphs: ["Body."] }],
    });

    const styles = part(out, "word/styles.xml");

    const body =
      styles.match(/w:styleId="BodyText"[\s\S]*?<\/w:style>/)?.[0] ?? "";

    assert.match(body, /w:ascii="Arial"/);
    assert.match(body, /<w:sz w:val="20"/);
    assert.match(body, /w:line="480"/);

    const section =
      part(out, "word/document.xml").match(
        /<w:sectPr[\s\S]*?<\/w:sectPr>/,
      )?.[0] ?? "";

    assert.match(section, /w:pgSz w:w="12240" w:h="15840"/);
    assert.match(
      section,
      /w:top="2160" w:right="2160" w:bottom="2160" w:left="2160"/,
    );
  },
);

test(
  "docx: a reference without footnote parts is rejected before Pandoc runs",
  needsPandoc,
  async (t) => {
    const root = project(t);
    const bad = join(root, "bad.docx");
    writeFileSync(bad, zipSync({ "word/styles.xml": strToU8("<x/>") }));
    writeFileSync(
      join(root, "a.json"),
      JSON.stringify({ sections: [{ paragraphs: ["x"] }] }),
    );
    await assert.rejects(
      generateDocx("a.json", "a.docx", root, { referenceDoc: bad }),
      /lacks required footnote parts/,
    );
  },
);

test(
  "docx: a style package reference controls the appearance",
  needsPandoc,
  async (t) => {
    const root = project(t);

    const { installStarterPackage } =
      await import("../pi-academic/styling/document-style.js");

    const installed = await installStarterPackage(root);
    writeFileSync(
      join(root, "a.json"),
      JSON.stringify({
        title: "T",
        sections: [{ title: "H", paragraphs: ["Body."] }],
      }),
    );
    await generateDocx("a.json", "a.docx", root, {
      referenceDoc: join(installed.directory, "native", "reference.docx"),
    });
    const styles = part(join(root, "a.docx"), "word/styles.xml");
    assert.match(
      styles.match(/w:styleId="Heading1"[\s\S]*?<\/w:style>/)?.[0] ?? "",
      /w:ascii="Times New Roman"/,
    );
  },
);

test(
  "docx: Hebrew quote enclosing a footnote preserves the footnote definition and reference",
  needsPandoc,
  async (t) => {
    const root = project(t);
    writeFileSync(
      join(root, "article.md"),
      [
        "# כותרת",
        "",
        '"טקסט [^1] בדיקה"',
        "",
        "[^1]: הערת שוליים לבדיקה",
        "",
      ].join("\n"),
    );
    const res = await generateDocx("article.md", "article.docx", root);
    assert.equal(res.ok, true);
    assert.equal(res.footnotes, 1);
    const doc = part(join(root, "article.docx"), "word/document.xml");
    assert.match(doc, /w:footnoteReference/);
    assert.match(
      part(join(root, "article.docx"), "word/footnotes.xml"),
      /הערת שוליים לבדיקה/,
    );
  },
);

test(
  "docx: generateDocx creates nested output directory if it does not exist",
  needsPandoc,
  async (t) => {
    const root = project(t);
    writeFileSync(
      join(root, "a.json"),
      JSON.stringify({
        title: "Title",
        sections: [{ paragraphs: ["Body text."] }],
      }),
    );

    const res = await generateDocx(
      "a.json",
      "articles/nested/deep/out.docx",
      root,
    );

    assert.equal(res.ok, true);
    assert.equal(existsSync(join(root, "articles/nested/deep/out.docx")), true);
  },
);

test(
  "docx: preserves Hebrew quote footnote even with English targetLanguage",
  needsPandoc,
  async (t) => {
    const root = project(t);
    writeFileSync(
      join(root, "article.md"),
      [
        "# Title",
        "",
        'English text with "טקסט [^1] בעברית" and more prose.',
        "",
        "[^1]: Hebrew footnote note",
        "",
      ].join("\n"),
    );
    const res = await generateDocx("article.md", "article.docx", root);
    assert.equal(res.ok, true);
    assert.equal(res.footnotes, 1);
    const doc = part(join(root, "article.docx"), "word/document.xml");
    assert.match(doc, /w:footnoteReference/);
    assert.match(
      part(join(root, "article.docx"), "word/footnotes.xml"),
      /Hebrew footnote note/,
    );
  },
);

test(
  "docx: direct Markdown compilation generates DOCX with native RTL footnotes and bidi",
  needsPandoc,
  async (t) => {
    const root = project(t);
    writeFileSync(
      join(root, "article.md"),
      [
        "---",
        "title: Test",
        "lang: he-IL",
        "dir: rtl",
        "---",
        "",
        "פסקה עם הערת שוליים[^1].",
        "",
        "[^1]: הערת שוליים בעברית",
        "",
      ].join("\n"),
    );

    const res = await generateDocx("article.md", "article.docx", root);
    assert.equal(res.ok, true);
    assert.equal(existsSync(join(root, "article.docx")), true);
    assert.equal(
      existsSync(join(root, ".academic-writer/runs/article.docx.json")),
      false,
    );

    const footnotesXml = part(join(root, "article.docx"), "word/footnotes.xml");
    assert.match(footnotesXml, /הערת שוליים בעברית/);
    assert.match(footnotesXml, /w:rtl/);

    const docXml = part(join(root, "article.docx"), "word/document.xml");
    assert.match(docXml, /w:bidi/);
  },
);

test(
  "docx: detects Hebrew and RTL from profile targetLanguage and extracts title without duplication",
  needsPandoc,
  async (t) => {
    const root = project(t);
    mkdirSync(join(root, ".academic-writer"), { recursive: true });
    writeFileSync(
      join(root, ".academic-writer", "profile.md"),
      [
        "# Academic Writer Profile",
        "",
        "---",
        "targetLanguage: Hebrew",
        "citationStyle: inline-parenthetical",
        "---",
        "",
      ].join("\n"),
    );

    writeFileSync(
      join(root, "article.md"),
      [
        "# חיבור בדיקה",
        "",
        "*משפט התזה.*",
        "",
        "פסקה בעברית ללא כותרות עליונות של יאמל[^1].",
        "",
        "[^1]: תוכן הערה בעברית",
        "",
      ].join("\n"),
    );

    const res = await generateDocx("article.md", "article.docx", root);
    assert.equal(res.ok, true);
    assert.equal(existsSync(join(root, "article.docx")), true);

    const footnotesXml = part(join(root, "article.docx"), "word/footnotes.xml");
    assert.match(footnotesXml, /תוכן הערה בעברית/);
    assert.match(footnotesXml, /w:rtl/);

    const docXml = part(join(root, "article.docx"), "word/document.xml");
    assert.match(docXml, /w:bidi/);

    // Verify that חיבור בדיקה appears as title and is not duplicated as a heading
    const heading1Matches =
      docXml.match(/w:pStyle w:val="Heading1"[^>]*>[\s\S]*?חיבור בדיקה/g) ?? [];

    assert.equal(heading1Matches.length, 0);
  },
);
