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
} from "../pi-academic-writer/citations/relink.js";
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

const relink = (markdown: string) => relinkFootnotes(markdown, refs);

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

test("a note with other text stays a note with its citations rewritten", () => {
  const { markdown, notes } = relink(
    [
      "A claim.[^1]",
      "",
      "[^1]: See Stern, *Matter and Form*, 232 n. 36. Cf. Davidson, *Moses Maimonides*, 5.",
      "",
    ].join("\n"),
  );

  assert.match(markdown, /^A claim\.\[\^1\]$/m);
  assert.equal(notes[0]?.outcome, "unchanged");

  const second = relink(
    [
      "A claim.[^1]",
      "",
      "[^1]: Davidson, *Moses Maimonides*, 5; see also Stern, *Matter and Form*, 7.",
      "",
    ].join("\n"),
  );

  assert.match(
    second.markdown,
    /^\[\^1\]: \[@davidson2005, p\. 5\]; see also \[@stern2013, p\. 7\]\.$/m,
  );

  assert.equal(second.notes[0]?.outcome, "footnote");
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
  mkdirSync(join(root, ".academic-writer"));
  mkdirSync(join(root, "drafts"));

  const writeProject = (style: string) =>
    writeFileSync(
      join(root, ".academic-writer", "profile.md"),
      `---\nfieldOfStudy: "Test"\ncitationStyle: "${style}"\ntargetLanguage: "English"\n---\n`,
    );

  writeFileSync(
    join(root, ".academic-writer", "sources.json"),
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
    join(root, ".academic-writer", "bibliography.bib"),
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

  const dry = await callTool(root, "academic_writer_relink_citations", {
    article: "articles/a.md",
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
  });

  const markdown = readFileSync(join(root, "articles/a.md"), "utf8");

  assert.match(markdown, /A claim \[@stern2013, p\. 202\]\./);
  assert.ok(!markdown.includes("{.mark}"));
  assert.match(markdown, /\[\^2\]: Something Else/);

  const rendered = spawnSync("pandoc", [
    join(root, "articles/a.md"),
    "--citeproc",
    `--bibliography=${join(root, ".academic-writer", "bibliography.bib")}`,
    "-t",
    "plain",
  ]);

  assert.equal(rendered.status, 0);
  assert.equal(rendered.stderr.toString(), "");
  assert.match(rendered.stdout.toString(), /Stern|2013/);
});
