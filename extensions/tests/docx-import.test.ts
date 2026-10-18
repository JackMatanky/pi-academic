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

import { test, type TestContext } from "vitest";

import { createToolHarness } from "./helpers.js";

const hasPandoc = spawnSync("pandoc", ["--version"]).status === 0;

const { callTool } = createToolHarness();

const ESSAY = `# Essay

Claim one[^1] and claim two[^2].

[^1]: Smith, *Book* (2020), 15.

[^2]: Second note.

    With a second paragraph.
`;

function project(t: TestContext, markdown = ESSAY): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "docx-import-")));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "drafts"));
  writeFileSync(join(root, "drafts", "my essay.md"), markdown);

  const built = spawnSync("pandoc", [
    join(root, "drafts", "my essay.md"),
    "-o",
    join(root, "drafts", "my essay.docx"),
  ]);

  assert.equal(built.status, 0);

  return root;
}

test.skipIf(!hasPandoc)(
  "imports a DOCX to markdown with its footnotes, and protects an existing article",
  async (t) => {
    const root = project(t);

    const result = await callTool(root, "academic_writer_import_docx", {
      input: "drafts/my essay.docx",
    });

    assert.equal(result.details.output, "articles/my-essay.md");
    assert.equal(result.details.footnotes, 2);
    assert.deepEqual(result.details.warnings, []);

    const markdown = readFileSync(join(root, "articles/my-essay.md"), "utf8");
    assert.match(markdown, /Claim one\[\^1\] and claim two\[\^2\]/);
    assert.match(markdown, /^\[\^1\]: Smith, \*Book\* \(2020\), 15\.$/m);
    assert.match(markdown, /^\[\^2\]: Second note\.$/m);
    assert.match(markdown, /^ {4}With a second paragraph\.$/m);
    assert.ok(!existsSync(join(root, "articles/my-essay.media")));

    const clash = await callTool(root, "academic_writer_import_docx", {
      input: "drafts/my essay.docx",
    });

    assert.equal(clash.details.ok, false);
    assert.match(clash.content[0]?.text ?? "", /already exists/);

    const again = await callTool(root, "academic_writer_import_docx", {
      input: "drafts/my essay.docx",
      output: "articles/my-essay.md",
      overwrite: true,
    });

    assert.equal(again.details.footnotes, 2);
  },
);

test.skipIf(!hasPandoc)(
  "rejects paths outside the project and non-DOCX input",
  async (t) => {
    const root = project(t);
    const outside = project(t);

    const escaped = await callTool(root, "academic_writer_import_docx", {
      input: join(outside, "drafts", "my essay.docx"),
    });

    assert.equal(escaped.details.ok, false);

    const notDocx = await callTool(root, "academic_writer_import_docx", {
      input: "drafts/my essay.md",
    });

    assert.match(notDocx.content[0]?.text ?? "", /must be a \.docx/);
  },
);

const PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";

test.skipIf(!hasPandoc)(
  "extracts images beside the markdown with links that resolve from it",
  async (t) => {
    const root = project(t, "Text.\n\n![fig](pixel.png)\n");

    writeFileSync(
      join(root, "drafts", "pixel.png"),
      Buffer.from(PIXEL, "base64"),
    );

    const built = spawnSync("pandoc", ["my essay.md", "-o", "my essay.docx"], {
      cwd: join(root, "drafts"),
    });

    assert.equal(built.status, 0);

    const result = await callTool(root, "academic_writer_import_docx", {
      input: "drafts/my essay.docx",
      output: "articles/deep/essay.md",
    });

    assert.equal(result.details.media, "articles/deep/essay.media");

    const link = /!\[[^\]]*\]\(([^)\s]+)\)/.exec(
      readFileSync(join(root, "articles/deep/essay.md"), "utf8"),
    )?.[1];

    assert.ok(link && existsSync(join(root, "articles/deep", link)), "image");
  },
);

test.skipIf(!hasPandoc)(
  "unwraps Word's underline on hyperlinks but keeps other underlines",
  async (t) => {
    const root = project(
      t,
      "See [[https://example.com/a]{.underline}](https://example.com/a) and [marked]{.underline}.\n",
    );

    const result = await callTool(root, "academic_writer_import_docx", {
      input: "drafts/my essay.docx",
    });

    const markdown = readFileSync(
      join(root, String(result.details.output)),
      "utf8",
    );

    assert.match(markdown, /<https:\/\/example\.com\/a>/);
    assert.match(markdown, /\[marked\]\{\.underline\}/);
  },
);
