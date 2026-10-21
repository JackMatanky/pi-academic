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

import { test } from "vitest";

import {
  relinkFootnotes,
  sourceRefs,
} from "../pi-academic/citations/relink.js";
import { createToolHarness } from "./helpers.js";

const { callTool } = createToolHarness();

const refs = sourceRefs([
  {
    citeKey: "iser1974",
    author: "Iser, Wolfgang",
    workTitle: "The Implied Reader: Patterns of Communication in Prose Fiction",
  },
  {
    citeKey: "stern2013",
    author: "Stern, Josef",
    workTitle: "The Matter and Form of Maimonides' Guide",
  },
  {
    citeKey: "davidson2005",
    author: "Davidson, Herbert A.",
    workTitle: "Moses Maimonides: The Man and His Works",
  },
  {
    citeKey: "davidson2009",
    author: "Davidson, Herbert A.",
    workTitle: "Maimonides on Divine Attributes as Equivocal Terms",
  },
  { citeKey: "local", author: "", workTitle: "No author" },
]);

const relink = (markdown: string) =>
  relinkFootnotes(markdown, refs, { noteStyle: true });

test("a note of only citations becomes an inline marker before the punctuation", () => {
  const { markdown, notes } = relink(
    [
      "Claim one.[^1] Claim two, with more[^2] and a quote.”[^3]",
      "",
      "[^1]: Wolfgang Iser, *The Implied Reader: Patterns of Communication in Prose Fiction* (Johns Hopkins University Press, 1974), xii.",
      "",
      "[^2]: Stern, *Matter and Form*, 202; Davidson, *Moses Maimonides*, 360–75.",
      "",
      "[^3]: Davidson, “Maimonides on Divine Attributes as Equivocal Terms,” 49–51.",
      "",
    ].join("\n"),
  );

  assert.equal(
    markdown,
    "Claim one [@iser1974, p. xii]. Claim two, with more [@stern2013, p. 202; @davidson2005, pp. 360–75] and a quote.” [@davidson2009, pp. 49–51]\n",
  );

  assert.deepEqual(
    notes.map((note) => note.outcome),
    ["inline", "inline", "inline"],
  );
});

test("a note of only cited works with a see/cf. lead-in becomes an inline marker with a prefix", () => {
  const { markdown, notes } = relink(
    "A claim.[^1]\n\n[^1]: Davidson, *Moses Maimonides*, 5; see also Stern, *Matter and Form*, 7; cf. Iser, *The Implied Reader*, xii.\n",
  );

  assert.equal(
    markdown,
    "A claim [@davidson2005, p. 5; see also @stern2013, p. 7; cf. @iser1974, p. xii].\n",
  );

  assert.equal(notes[0]?.outcome, "inline");
});

test("a note with commentary stays a note; its citations are author-in-text in a note style and bracketed otherwise", () => {
  const note =
    "A claim.[^1]\n\n[^1]: Davidson disagrees; see Stern, *Matter and Form*, 7, and Iser, *The Implied Reader*.\n";

  const kept = relink(note);

  // A second citation after the first must never be dropped.
  assert.equal(kept.notes[0]?.outcome, "unchanged");
  assert.match(kept.markdown, /and Iser, \*The Implied Reader\*/);

  const mixed =
    "A claim.[^1]\n\n[^1]: Stern, *Matter and Form*, 7; and a point about the text itself.\n";

  const inNotes = relink(mixed);

  assert.equal(inNotes.notes[0]?.outcome, "footnote");
  assert.match(
    inNotes.markdown,
    /^\[\^1\]: @stern2013 \[p\. 7\]; and a point/m,
  );

  const inText = relinkFootnotes(mixed, refs, { noteStyle: false });

  assert.match(
    inText.markdown,
    /^\[\^1\]: \[@stern2013, p\. 7\]; and a point/m,
  );
});

test("an inline marker with a prefix keeps the lead-in when citeproc renders it", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "relink-render-")));

  writeFileSync(
    join(root, "a.bib"),
    "@book{stern2013, author={Stern, Josef}, title={The Matter and Form of Maimonides' Guide}, year={2013}, publisher={Harvard University Press}}\n@book{iser1974, author={Iser, Wolfgang}, title={The Implied Reader}, year={1974}, publisher={Johns Hopkins}}\n",
  );

  const rendered = (markdown: string) =>
    spawnSync(
      "pandoc",
      [
        "-f",
        "markdown",
        "--citeproc",
        "--bibliography",
        join(root, "a.bib"),
        "-t",
        "plain",
        "--wrap=none",
      ],
      { input: markdown },
    ).stdout.toString();

  const out = rendered("X [see @stern2013, p. 7; cf. @iser1974, p. xii].\n");

  assert.match(out, /\(see Stern 2013, 7; cf\. Iser 1974, xii\)/);
  rmSync(root, { recursive: true, force: true });
});

test("unmatched, ambiguous, and prose segments are left as written and reported", () => {
  const { markdown, notes } = relink(
    [
      "One.[^1] Two.[^2] Three.[^3]",
      "",
      "[^1]: Unknown, *Some Other Book*, 5.",
      "",
      "[^2]: Davidson, Maimonides, 5.",
      "",
      "[^3]: Stern, *Matter and Form*, 5. While this is so, the point stands.",
      "",
    ].join("\n"),
  );

  assert.match(markdown, /\[\^1\]: Unknown/);
  assert.match(markdown, /\[\^2\]: Davidson, Maimonides, 5\./);
  assert.match(markdown, /\[\^3\]: Stern/);
  assert.deepEqual(
    notes.map((note) => note.outcome),
    ["unchanged", "unchanged", "unchanged"],
  );
  assert.equal(notes[1]?.unresolved[0]?.candidates.length, 2);
});

test("ibid resolves to the previous note's source, and highlights are ignored", () => {
  const { markdown } = relink(
    [
      "A.[^1] B.[^2]",
      "",
      "[^1]: [Stern, *Matter and Form*, 202.]{.mark}",
      "",
      "[^2]: Ibid., 205.",
      "",
    ].join("\n"),
  );

  assert.equal(markdown, "A [@stern2013, p. 202]. B [@stern2013, p. 205].\n");
});

test("a year is publication data, not a page", () => {
  const { markdown } = relink(
    "A.[^1]\n\n[^1]: Josef Stern, *The Matter and Form of Maimonides' Guide* (Harvard University Press, 2013).\n",
  );

  assert.equal(markdown, "A [@stern2013].\n");
});

test("pages the pattern cannot read keep the note instead of dropping them", () => {
  const kept = relink(
    "A.[^1]\n\n[^1]: Stern, *Matter and Form*, see p 7 and also the 3rd 12.\n",
  );

  assert.equal(kept.notes[0]?.outcome, "unchanged");

  const listed = relink(
    "A.[^1]\n\n[^1]: Stern, *Matter and Form*, 201, 217 and n. 27.\n",
  );

  assert.equal(listed.markdown, "A [@stern2013, pp. 201, 217 and n. 27].\n");
});

test("the relink tool rewrites an imported DOCX so citeproc resolves every key", async (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "relink-tool-")));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, ".pi-academic"));
  mkdirSync(join(root, "drafts"));

  const writeProject = (style: string) =>
    writeFileSync(
      join(root, ".pi-academic", "profile.md"),
      `---\nfieldOfStudy: "Test"\ncitationStyle: "${style}"\ntargetLanguage: "English"\n---\n`,
    );

  writeFileSync(
    join(root, ".pi-academic", "sources.json"),
    JSON.stringify([
      {
        citeKey: "stern2013",
        author: "Stern, Josef",
        workTitle: "The Matter and Form of Maimonides' Guide",
        year: "2013",
        publisher: "Harvard University Press",
      },
    ]),
  );

  writeFileSync(
    join(root, ".pi-academic", "bibliography.bib"),
    "@book{stern2013, author={Stern, Josef}, title={The Matter and Form of Maimonides' Guide}, year={2013}, publisher={Harvard University Press}}\n",
  );

  writeFileSync(
    join(root, "drafts", "a.md"),
    "A claim.[^1] Marked [text]{.mark}.[^2]\n\n[^1]: Josef Stern, *The Matter and Form of Maimonides' Guide* (Harvard University Press, 2013), 202.\n\n[^2]: Something Else, *Not In Sources*, 5.\n",
  );

  const built = spawnSync("pandoc", [
    join(root, "drafts", "a.md"),
    "-o",
    join(root, "drafts", "a.docx"),
  ]);

  assert.equal(built.status, 0);

  const imported = await callTool(root, "academic_writer_import_docx", {
    input: "drafts/a.docx",
    stripHighlights: true,
  });

  assert.equal(imported.details.ok, undefined);

  writeProject("inline-parenthetical");

  const refused = await callTool(root, "academic_writer_relink_citations", {
    article: "articles/a.md",
  });

  assert.equal(refused.details.ok, false);
  writeProject("chicago");

  const undetectable = await callTool(
    root,
    "academic_writer_relink_citations",
    { article: "articles/a.md" },
  );

  assert.equal(undetectable.details.ok, false);
  assert.match(undetectable.content[0]?.text ?? "", /pass noteStyle/);

  const dry = await callTool(root, "academic_writer_relink_citations", {
    article: "articles/a.md",
    noteStyle: true,
  });

  assert.equal(dry.details.applied, false);
  assert.match(
    dry.content[0]?.text ?? "",
    /Not matched to sources\.json \(1\)/,
  );
  assert.match(
    readFileSync(join(root, "articles/a.md"), "utf8"),
    /\[\^1\]: Josef Stern/,
  );

  await callTool(root, "academic_writer_relink_citations", {
    article: "articles/a.md",
    apply: true,
    noteStyle: true,
  });

  const markdown = readFileSync(join(root, "articles/a.md"), "utf8");

  assert.match(markdown, /A claim \[@stern2013, p\. 202\]\./);
  assert.ok(!markdown.includes("{.mark}"));
  assert.match(markdown, /\[\^2\]: Something Else/);

  const rendered = spawnSync("pandoc", [
    join(root, "articles/a.md"),
    "--citeproc",
    `--bibliography=${join(root, ".pi-academic", "bibliography.bib")}`,
    "-t",
    "plain",
  ]);

  assert.equal(rendered.status, 0);
  assert.equal(rendered.stderr.toString(), "");
  assert.match(rendered.stdout.toString(), /Stern|2013/);
});

test("short-form notes resolve, including two works by one author", () => {
  const short = sourceRefs([
    {
      citeKey: "davidson2009",
      author: "Davidson, Herbert A.",
      workTitle: "Maimonides on Divine Attributes as Equivocal Terms",
    },
    {
      citeKey: "stern2013",
      author: "Stern, Josef",
      workTitle: "The Matter and Form of Maimonides' Guide",
    },
    {
      citeKey: "fraenkel2012",
      author: "Fraenkel, Carlos",
      workTitle:
        "Philosophical Religions from Plato to Spinoza: Reason, Religion, and Autonomy",
    },
    {
      citeKey: "fraenkel2006",
      author: "Fraenkel, Carlos",
      workTitle: "Maimonides' God and Spinoza's Deus sive Natura",
    },
  ]);

  const { markdown } = relinkFootnotes(
    [
      "a[^50] b[^51] c[^52] d[^53]",
      "",
      "[^50]: Davidson, “Maimonides on Divine Attributes as Equivocal Terms,” 51.",
      "",
      "[^51]: Stern, *Matter and Form*, 273–75.",
      "",
      "[^52]: Stern, *Matter and Form*, 232 n. 36.",
      "",
      "[^53]: Fraenkel, “Maimonides’ God and Spinoza’s *Deus sive Natura*,” 181–89.",
      "",
    ].join("\n"),
    short,
    { noteStyle: true },
  );

  assert.equal(
    markdown,
    "a [@davidson2009, p. 51] b [@stern2013, pp. 273–75] c [@stern2013, p. 232 n. 36] d [@fraenkel2006, pp. 181–89]\n",
  );
});

test("notes already written with [@key] markers are inlined, including multi-item brackets and lead-ins", () => {
  const written = sourceRefs([
    {
      citeKey: "hyman2008",
      author: "Hyman, Arthur",
      workTitle: "Maimonides on Religious Language",
    },
    {
      citeKey: "halbertal2007",
      author: "Halbertal, Moshe",
      workTitle: "Concealment and Revelation",
    },
    {
      citeKey: "halbertal2014",
      author: "Halbertal, Moshe",
      workTitle: "Maimonides: Life and Thought",
    },
  ]);

  const run = (markdown: string, noteStyle = true) =>
    relinkFootnotes(markdown, written, { noteStyle });

  const { markdown, notes } = run(
    [
      "A.[^3] B.[^6] C.[^7]",
      "",
      "[^3]: See [@hyman2008, pp. 175–91].",
      "",
      "[^6]: [@halbertal2007, pp. 49–68]; see also [@halbertal2014, pp. 277–312].",
      "",
      "[^7]: [@halbertal2007, pp. 1–2; see also @halbertal2014, p. 3].",
      "",
    ].join("\n"),
  );

  assert.equal(
    markdown,
    "A [see @hyman2008, pp. 175–91]. B [@halbertal2007, pp. 49–68; see also @halbertal2014, pp. 277–312]. C [@halbertal2007, pp. 1–2; see also @halbertal2014, p. 3].\n",
  );

  assert.deepEqual(
    notes.map((note) => note.outcome),
    ["inline", "inline", "inline"],
  );

  // An unknown key is never inlined.
  const unknown = run("A.[^1]\n\n[^1]: [@nobody2000, p. 5].\n");

  assert.equal(unknown.notes[0]?.outcome, "unchanged");
  assert.match(unknown.markdown, /\[\^1\]: \[@nobody2000, p\. 5\]\./);

  // Commentary keeps the note; the prefix survives in the author-in-text form.
  const mixed = run(
    "A.[^1]\n\n[^1]: Contrast the view that follows; see [@hyman2008, pp. 175–91].\n",
  );

  assert.equal(mixed.notes[0]?.outcome, "footnote");
  assert.match(mixed.markdown, /see @hyman2008 \[pp\. 175–91\]\.$/m);

  // A second pass over its own output changes nothing further.
  assert.equal(run(markdown).markdown, markdown);
});

test("a pass never doubles a period or drops a locator it cannot read, and a second pass changes nothing", () => {
  const note =
    "A.[^1]\n\n[^1]: On the point, see Stern, *Matter and Form*, 7; and Davidson, *Moses Maimonides*, the third 12.\n";

  const first = relink(note);

  assert.ok(!first.markdown.includes(".."));
  assert.match(first.markdown, /the third 12\.$/m);
  assert.equal(relink(first.markdown).markdown, first.markdown);

  // The doubled period an older pass left behind must not hide the locator.
  const doubled = relink(
    "A.[^1]\n\n[^1]: Davidson, *Moses Maimonides*, the third 12..\n",
  );

  assert.equal(doubled.notes[0]?.outcome, "unchanged");
});

test("every Pandoc locator term converts and is kept word for word", () => {
  // [text as written in the note, locator as it must appear in the marker]
  const cases: [string, string][] = [
    ["7", "p. 7"],
    ["7–9", "pp. 7–9"],
    ["xii", "p. xii"],
    ["232 n. 36", "p. 232 n. 36"],
    ["201, 217 and n. 27", "pp. 201, 217 and n. 27"],
    ["bk. 2", "bk. 2"],
    ["bks. 2–3", "bks. 2–3"],
    ["book 2", "book 2"],
    ["chap. 3", "chap. 3"],
    ["chaps. 3–4", "chaps. 3–4"],
    ["chapter 3", "chapter 3"],
    ["ch. 4", "chap. 4"],
    ["chs. 1–2", "chaps. 1–2"],
    ["col. 5", "col. 5"],
    ["cols. 5–6", "cols. 5–6"],
    ["fig. 2", "fig. 2"],
    ["figs. 2–3", "figs. 2–3"],
    ["fol. 3", "fol. 3"],
    ["fols. 3–4", "fols. 3–4"],
    ["no. 3", "no. 3"],
    ["nos. 3–4", "nos. 3–4"],
    ["l. 5", "l. 5"],
    ["ll. 5–6", "ll. 5–6"],
    ["n. 3", "n. 3"],
    ["nn. 3–4", "nn. 3–4"],
    ["op. 3", "op. 3"],
    ["opp. 3–4", "opp. 3–4"],
    ["p. 5", "p. 5"],
    ["pp. 5–6", "pp. 5–6"],
    ["para. 5", "para. 5"],
    ["paras. 5–6", "paras. 5–6"],
    ["pt. 2", "pt. 2"],
    ["pts. 2–3", "pts. 2–3"],
    ["sec. 4", "sec. 4"],
    ["secs. 4–5", "secs. 4–5"],
    ["section 4", "section 4"],
    ["v. 3", "v. 3"],
    ["vv. 3–4", "vv. 3–4"],
    ["vol. 2", "vol. 2"],
    ["vols. 2–3", "vols. 2–3"],
    ["volume 2", "volume 2"],
    ["¶ 4", "¶ 4"],
    ["¶¶ 4–5", "¶¶ 4–5"],
    ["§ 4", "§ 4"],
    ["§§ 4–5", "§§ 4–5"],
    ["§4", "§4"],
    ["vol. 2, p. 5", "vol. 2, p. 5"],
    ["chap. 3, § 4", "chap. 3, § 4"],
    ["s.v. Maimonides", "s.v. Maimonides"],
    ["s.vv. Maimonides", "s.vv. Maimonides"],
    ["sub verbo Maimonides", "sub verbo Maimonides"],
  ];

  for (const [written, locator] of cases) {
    const { markdown, notes } = relink(
      `A.[^1]\n\n[^1]: Stern, *Matter and Form*, ${written}.\n`,
    );

    assert.equal(notes[0]?.outcome, "inline", written);
    assert.equal(markdown, `A [@stern2013, ${locator}].\n`, written);
  }
});

test("short suffixes stay with the locator, and the page is singular or plural by the locator alone", () => {
  const cases: [string, string][] = [
    ["5 ff.", "p. 5 ff."],
    ["5, esp. 7", "p. 5, esp. 7"],
    ["5–7, esp. 6", "pp. 5–7, esp. 6"],
    ["5 and passim", "p. 5 and passim"],
    ["5–7 et seq.", "pp. 5–7 et seq."],
    ["pp. 5–7 and passim", "pp. 5–7 and passim"],
    ["passim", "passim"],
    ["esp. 7", "esp. 7"],
  ];

  for (const [written, locator] of cases) {
    const { markdown, notes } = relink(
      `A.[^1]\n\n[^1]: Stern, *Matter and Form*, ${written}.\n`,
    );

    assert.equal(notes[0]?.outcome, "inline", written);
    assert.equal(markdown, `A [@stern2013, ${locator}].\n`, written);
  }
});

test("common lead-ins become the citation prefix", () => {
  const cases: [string, string][] = [
    ["See Stern, *Matter and Form*, 5", "see"],
    ["See also Stern, *Matter and Form*, 5", "see also"],
    ["See generally Stern, *Matter and Form*, 5", "see generally"],
    ["See, e.g., Stern, *Matter and Form*, 5", "see, e.g.,"],
    ["But see Stern, *Matter and Form*, 5", "but see"],
    ["Cf. Stern, *Matter and Form*, 5", "cf."],
    ["Compare Stern, *Matter and Form*, 5", "compare"],
    ["Contra Stern, *Matter and Form*, 5", "contra"],
    ["E.g., Stern, *Matter and Form*, 5", "e.g.,"],
  ];

  for (const [written, prefix] of cases) {
    const { markdown } = relink(`A.[^1]\n\n[^1]: ${written}.\n`);

    assert.equal(markdown, `A [${prefix} @stern2013, p. 5].\n`, written);
  }
});

test("a locator with trailing prose is left as written, never partly converted", () => {
  const { markdown, notes } = relink(
    "A.[^1]\n\n[^1]: Stern, *Matter and Form*, 5, where he argues otherwise.\n",
  );

  assert.equal(notes[0]?.outcome, "unchanged");
  assert.match(markdown, /where he argues otherwise/);
});

test("literal [@key] text from a Word file arrives escaped and still converts, one item at a time", async (t) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "relink-literal-")));

  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "d"));

  writeFileSync(
    join(root, "d", "a.md"),
    "Body.[^3] More.[^6]\n\n[^3]: See \\[@hyman2008, pp. 175–91\\].\n\n[^6]: \\[@hyman2008, p. 1; @nobody2000, p. 2\\].\n",
  );

  const built = spawnSync("pandoc", [
    join(root, "d", "a.md"),
    "-o",
    join(root, "d", "a.docx"),
  ]);

  assert.equal(built.status, 0);

  const imported = await callTool(root, "academic_writer_import_docx", {
    input: "d/a.docx",
  });

  const markdown = readFileSync(
    join(root, String(imported.details.output)),
    "utf8",
  );

  assert.match(markdown, /\\\[@hyman2008, pp\.\s175–91\\\]/);

  const out = relinkFootnotes(
    markdown,
    sourceRefs([
      {
        citeKey: "hyman2008",
        author: "Hyman, Arthur",
        workTitle: "Maimonides on Religious Language",
      },
    ]),
    { noteStyle: true },
  );

  // [^3] converts; [^6] has an unknown second key, so it stays a note and the
  // unknown citation is written back untouched, not dropped or validated away.
  assert.match(out.markdown, /Body \[see @hyman2008, pp\. 175–91\]\./);
  assert.match(
    out.markdown,
    /@hyman2008 \[p\. 1\]; \\\[\\@nobody2000, p\.\s2\\\]/,
  );
  assert.deepEqual(
    out.notes.map((note) => note.outcome),
    ["inline", "footnote"],
  );
});

test("a year in the note that the matched record does not have is reported, not silently replaced", () => {
  const dated = sourceRefs([
    {
      citeKey: "kaplan1991",
      author: "Kaplan, Lawrence",
      workTitle: "I Sleep, But My Heart Waketh",
      year: "1991",
    },
    {
      citeKey: "stern2013",
      author: "Stern, Josef",
      workTitle: "The Matter and Form of Maimonides' Guide",
      year: "2013",
    },
  ]);

  const run = (note: string) =>
    relinkFootnotes(`A.[^1]\n\n[^1]: ${note}\n`, dated, { noteStyle: true });

  const off = run(
    "Lawrence Kaplan, “I Sleep, But My Heart Waketh,” in *The Thought*, ed. Ira Robinson (Edwin Mellen Press, 1990), 130–66.",
  );

  assert.equal(off.notes[0]?.outcome, "inline");
  assert.deepEqual(off.notes[0]?.warnings, [
    "kaplan1991: the note says 1990, sources.json says 1991",
  ]);

  const same = run(
    "Josef Stern, *The Matter and Form of Maimonides' Guide* (Harvard University Press, 2013), 7.",
  );

  assert.deepEqual(same.notes[0]?.warnings, []);

  // A short form has no year to compare.
  assert.deepEqual(run("Stern, *Matter and Form*, 7.").notes[0]?.warnings, []);
});
