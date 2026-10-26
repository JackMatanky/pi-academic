import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, type TestContext } from "vitest";

import { importDocx } from "../pi-academic/article/docx-import.js";
import {
  analyzeNoteRefs,
  linkNoteRefs,
} from "../pi-academic/citations/note-refs.js";
import {
  relinkFootnotes,
  sourceRefs,
} from "../pi-academic/citations/relink.js";
import { NOTE_REFS_FILTER, runPandoc } from "../pi-academic/core/pandoc.js";
import { wordDocx } from "./word-docx.js";

const hasPandoc = !!spawnSync("which", ["pandoc"], { encoding: "utf8" }).stdout;

const needsPandoc = { skip: !hasPandoc };

const fixtures = join(import.meta.dirname, "fixtures");

// A CSL file must not ship in the package, so the minimal note style is built here.
const NOTE_CSL = `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="note" version="1.0">
  <info><title>Minimal note style</title><id>http://example.org/minimal-note</id><updated>2020-01-01T00:00:00+00:00</updated></info>
  <citation><layout><text variable="title"/></layout></citation>
</style>
`;

function scratch(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "aw-noterefs-"));

  t.onTestFinished(() => rmSync(dir, { recursive: true, force: true }));

  return dir;
}

function render(t: TestContext, markdown: string): Promise<string> {
  const dir = scratch(t);

  writeFileSync(join(dir, "a.md"), markdown);
  writeFileSync(join(dir, "n.csl"), NOTE_CSL);
  copyFileSync(join(fixtures, "refs.bib"), join(dir, "b.bib"));

  return runPandoc(
    [
      "a.md",
      "--citeproc",
      "--bibliography=b.bib",
      "--csl=n.csl",
      NOTE_REFS_FILTER,
      "-t",
      "plain",
    ],
    { cwd: dir },
  ).then((out) => out.toString("utf8"));
}

/**
 * Imports a `.docx` whose footnotes carry cross-references and checks the
 * links, the anchors and the exported numbers.
 */
async function checkCrossRefImport(dir: string): Promise<void> {
  const result = await importDocx(dir, "essay.docx", { output: "essay.md" });

  const markdown = readFileSync(join(dir, "essay.md"), "utf8");

  assert.equal(result.footnotes, 4);
  assert.equal(result.noteRefs, 3);
  assert.match(result.warnings.join("\n"), /note 9 above/);
  assert.match(markdown, /^\[\^1\]: \[\]\{#fn-1\} /m);
  assert.match(markdown, /^\[\^2\]: \[\]\{#fn-2\} /m);
  assert.match(markdown, /^\[\^3\]: \[\]\{#fn-3\} /m);
  assert.match(markdown, /See note \[\]\(#fn-1\) above/);
  assert.match(markdown, /notes \[\]\(#fn-1\) and \[\]\(#fn-2\) above/);
  assert.match(markdown, /supra note \[\]\(#fn-3\)/);
  assert.match(markdown, /note 9 above/);
  assert.match(markdown, /note 4 records a variant/);

  const out = (
    await runPandoc(["essay.md", NOTE_REFS_FILTER, "-t", "plain"], {
      cwd: dir,
    })
  )
    .toString("utf8")
    .replace(/\s+/g, " ");

  assert.doesNotMatch(out, /fn-\d/);
  assert.match(out, /See note 1 above on the Treatise/);
  assert.match(out, /notes 1 and 2 above/);
}

test(
  "a Pandoc-built Word file's literal note references import as links, then export as numbers",
  needsPandoc,
  async (t) => {
    const dir = scratch(t);

    copyFileSync(
      join(fixtures, "note-cross-refs.docx"),
      join(dir, "essay.docx"),
    );

    await checkCrossRefImport(dir);
  },
);

test(
  "a Word-shaped file converts although spell-check markers split the phrases mid-word",
  needsPandoc,
  async (t) => {
    const dir = scratch(t);

    writeFileSync(
      join(dir, "essay.docx"),
      wordDocx(
        [
          [
            "The first claim rests on a source.",
            "^1",
            " The second extends it.",
            "^2",
          ],
          [
            "The third returns to both.",
            "^3",
            " The fourth cites a missing note.",
            "^4",
          ],
        ],
        [
          ["Moses Maimonides, Treatise on Logic (Press, 1938), 5."],
          ["Maimonides, Treatise on Logic, 9."],
          [
            "See no",
            "te 1 abo",
            "ve on the Treatise on Logic, and no",
            "tes 1 an",
            "d 2 above.",
          ],
          [
            "Compare sup",
            "ra note 3, and note 9 ",
            "above. In the source, note 4 records a variant reading.",
          ],
        ],
      ),
    );

    await checkCrossRefImport(dir);
  },
);

test(
  "the fixture CSL and bibliography number a note citeproc builds",
  needsPandoc,
  async (t) => {
    const out = await render(
      t,
      "Claim[]{#fn-x} [@mm, p. 5]. Later.[^a]\n\n[^a]: See note [](#fn-x) above.\n",
    );

    assert.match(out, /See note 1 above/);
  },
);

test("analysis finds duplicate anchors, dangling links and literal references", () => {
  const found = analyzeNoteRefs(
    [
      "Text.[^1] More.[^2]",
      "",
      "[^1]: []{#fn-a} One.",
      "",
      "[^2]: []{#fn-a} Two, see note [](#fn-b) and [here](#fn-a) and note 4 above, nn. 3 and 5 below, supra note 2.",
      "",
    ].join("\n"),
  );

  assert.deepEqual(found.duplicateAnchors, ["fn-a"]);
  assert.deepEqual(found.danglingLinks, ["fn-b"]);
  assert.deepEqual(found.labelledLinks, ["fn-a"]);
  assert.deepEqual(found.hardCoded, [
    "note 4 above",
    "nn. 3 and 5 below",
    "supra note 2",
  ]);
});

test("a bare note number, a locator and code are not literal references", () => {
  const found = analyzeNoteRefs(
    "See Guide I, note 4. Cited at [@mm, n. 19]. Run `note 19 above`.\n\n```\nnote 3 above\n```\n",
  );

  assert.deepEqual(found.hardCoded, []);
});

test("a cross-reference inside an inline note is not a labelled link", () => {
  const found = analyzeNoteRefs(
    "Claim.^[See note [](#fn-a) above on the *Treatise*; not [8](#fn-b).]\n\n[^1]: []{#fn-a} One.\n\n[^2]: []{#fn-b} Two.\n",
  );

  assert.deepEqual(found.labelledLinks, ["fn-b"]);
});

test("literal references become links and the named notes get anchors", () => {
  const { markdown, linked, unresolved } = linkNoteRefs(
    [
      "A.[^1] B.[^2] C.[^3]",
      "",
      "[^1]: First.",
      "",
      "[^2]: Second.",
      "",
      "[^3]: See note 1 above and notes 1 and 2 above; nn. 9 below.",
      "",
    ].join("\n"),
  );

  assert.equal(linked, 2);
  assert.deepEqual(unresolved, ["nn. 9 below"]);
  assert.match(markdown, /^\[\^1\]: \[\]\{#fn-1\} First\.$/m);
  assert.match(markdown, /^\[\^2\]: \[\]\{#fn-2\} Second\.$/m);
  assert.match(markdown, /^\[\^3\]: See note \[\]\(#fn-1\) above and /m);
  assert.match(markdown, /notes \[\]\(#fn-1\) and \[\]\(#fn-2\) above/);
  assert.match(markdown, /nn\. 9 below/);
  assert.equal(analyzeNoteRefs(markdown).danglingLinks.length, 0);
  assert.deepEqual(analyzeNoteRefs(markdown).hardCoded, ["nn. 9 below"]);

  // A second pass changes nothing.
  assert.equal(linkNoteRefs(markdown).markdown, markdown);
});

test("an anchor travels with a note that relink turns into an inline citation", () => {
  const refs = sourceRefs([
    {
      citeKey: "stern2013",
      author: "Stern, Josef",
      workTitle: "The Matter and Form of Maimonides' Guide",
    },
  ]);

  const { markdown } = relinkFootnotes(
    [
      "Claim one.[^1] Claim two.[^2]",
      "",
      "[^1]: []{#fn-stern} Stern, *Matter and Form*, 202.",
      "",
      "[^2]: See note [](#fn-stern) above; Stern, *Matter and Form*, 9.",
      "",
    ].join("\n"),
    refs,
    { noteStyle: true },
  );

  assert.match(
    markdown,
    /^Claim one\[\]\{#fn-stern\} \[@stern2013, p\. 202\]\./,
  );
  assert.doesNotMatch(markdown, /^\[\^1\]/m);
});

test(
  "export numbers a link to an explicit note and to a note citeproc builds",
  needsPandoc,
  async (t) => {
    const out = await render(
      t,
      [
        "One.[^a] Two[]{#fn-logic} [@mm, p. 5]. Three.[^b]",
        "",
        "[^a]: []{#fn-first} First.",
        "",
        "[^b]: See note [](#fn-logic) above and note [](#fn-first).",
        "",
      ].join("\n"),
    );

    assert.match(out, /See note 2 above and note 1\./);
    assert.doesNotMatch(out, /fn-/);
    assert.match(out, /Two\.\[2\]/);
  },
);

test(
  "export fails on a link with no anchor, a duplicate anchor, and a trailing anchor",
  needsPandoc,
  async (t) => {
    await assert.rejects(
      render(t, "A.[^a]\n\n[^a]: See [](#fn-nope).\n"),
      /no matching note anchor/,
    );
    await assert.rejects(
      render(t, "A.[^a] B.[^b]\n\n[^a]: []{#fn-x} 1\n\n[^b]: []{#fn-x} 2\n"),
      /defined more than once/,
    );
    await assert.rejects(render(t, "A.[]{#fn-x}\n"), /has no note after it/);
    await assert.rejects(
      render(t, "A.[^a]\n\n[^a]: []{#fn-x} See [note](#fn-x).\n"),
      /must have empty text/,
    );
  },
);
