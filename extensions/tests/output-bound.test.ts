import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";

import {
  boundOutput,
  MAX_OUTPUT_BYTES,
  MAX_OUTPUT_LINES,
} from "../pi-academic-writer/output-bound.js";

function project(t: TestContext, withState: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "aw-bound-"));

  t.after(() => rmSync(root, { recursive: true, force: true }));

  if (withState) mkdirSync(join(root, ".academic-writer"));

  return root;
}

const spillDir = (root: string) =>
  join(root, ".academic-writer", "runs", "tool-output");

test("output at the line cap is returned unchanged", (t) => {
  const text = "x\n".repeat(MAX_OUTPUT_LINES - 1) + "x";

  assert.equal(boundOutput(project(t, true), "tool", text), text);
});

test("too many lines are cut with a notice and saved in full", (t) => {
  const root = project(t, true);
  const text = "x\n".repeat(3000);
  const out = boundOutput(root, "tool", text, 1_000);

  assert.match(
    out,
    /\[output truncated: showing 2000 of 3001 lines, [\d]+ of 6000 bytes\. Full output: \.academic-writer\/runs\/tool-output\/tool-1000\.txt\./,
  );
  assert.equal(out.split("\n\n[output truncated")[0]?.split("\n").length, 2000);
  assert.equal(
    readFileSync(join(spillDir(root), "tool-1000.txt"), "utf8"),
    text,
  );
});

test("an oversized single line is cut within the byte cap without a broken character", (t) => {
  const ascii = boundOutput(project(t, false), "tool", "a".repeat(60_000));
  const hebrew = boundOutput(project(t, false), "tool", "א".repeat(40_000));

  for (const out of [ascii, hebrew]) {
    const head = out.split("\n\n[output truncated")[0] ?? "";

    assert.ok(Buffer.byteLength(head) <= MAX_OUTPUT_BYTES);
    assert.ok(!head.includes("\uFFFD"));
  }
});

test("spill files older than a day are removed on the next spill", (t) => {
  const root = project(t, true);

  mkdirSync(spillDir(root), { recursive: true });

  const old = join(spillDir(root), "old.txt");

  writeFileSync(old, "stale");

  const past = new Date(Date.now() - 2 * 86_400_000);

  utimesSync(old, past, past);
  boundOutput(root, "tool", "x\n".repeat(3000));
  assert.ok(!existsSync(old));
  assert.equal(readdirSync(spillDir(root)).length, 1);
});

test("without .academic-writer nothing is created and the notice says the output was not saved", (t) => {
  const root = project(t, false);
  const out = boundOutput(root, "tool", "x\n".repeat(3000));

  assert.match(out, /The full output was not saved/);
  assert.deepEqual(readdirSync(root), []);
});
