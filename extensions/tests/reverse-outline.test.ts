import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import { reverseOutline } from "../pi-academic-writer/reverse-outline.js";

function fixture(t: TestContext) {
  const root = mkdtempSync(join(tmpdir(), "reverse-outline-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "articles"));
  writeFileSync(
    join(root, "articles", "essay.md"),
    "# Intro\n\nFirst paragraph.\n",
  );

  return root;
}

test("a valid article inside articles/ still segments", (t) => {
  const root = fixture(t);
  const result = reverseOutline(root, "articles/essay.md");

  assert.equal(result.status, "advisory");

  if (result.status !== "advisory") return;
  assert.deepEqual(
    result.units.map((unit) => unit.text),
    ["First paragraph."],
  );
  assert.deepEqual([result.units[0]?.headingPath], [["Intro"]]);
});

test("traversal outside articles/ is refused", (t) => {
  const root = fixture(t);
  writeFileSync(join(root, "secret.md"), "outside contents");

  const result = reverseOutline(root, "../secret.md");

  assert.equal(result.status, "error");

  if (result.status !== "error") return;
  assert.equal(
    result.reason,
    "Article must be a Markdown file inside project articles/.",
  );
  assert.deepEqual(result.units, []);
});

test("a symlink escaping articles/ is refused without reading the target", (t) => {
  const root = fixture(t);
  const outside = mkdtempSync(join(tmpdir(), "reverse-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(
    join(outside, "secret.md"),
    "# Secret\n\nExternal contents [@hidden].\n",
  );
  symlinkSync(join(outside, "secret.md"), join(root, "articles", "link.md"));

  const result = reverseOutline(root, "articles/link.md");

  assert.equal(result.status, "error");

  if (result.status !== "error") return;
  assert.equal(
    result.reason,
    "Article must be a Markdown file inside project articles/.",
  );
  assert.deepEqual(result.units, []);
});

test("a symlink to an article inside articles/ keeps working", (t) => {
  const root = fixture(t);
  symlinkSync(
    join(root, "articles", "essay.md"),
    join(root, "articles", "alias.md"),
  );

  const result = reverseOutline(root, "articles/alias.md");

  assert.equal(result.status, "advisory");

  if (result.status !== "advisory") return;
  assert.deepEqual(
    result.units.map((unit) => unit.text),
    ["First paragraph."],
  );
});
