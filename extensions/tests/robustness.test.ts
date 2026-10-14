import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

import { strToU8, zipSync } from "fflate";
import { test, type TestContext } from "vitest";

import { extractDocument } from "../pi-academic-writer/parsers/documents.js";

function scratch(t: TestContext): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "robustness-")));

  t.onTestFinished(() => rmSync(dir, { recursive: true, force: true }));

  return dir;
}

function docx(documentXml: string): Uint8Array {
  return zipSync({ "word/document.xml": strToU8(documentXml) });
}

const BODY = (text: string) =>
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`;

/**
 * Runs `extractDocument` with only a failing `pandoc` stub on PATH.
 */
async function withFailingPandoc<T>(
  t: TestContext,
  dir: string,
  run: () => Promise<T>,
): Promise<T> {
  const bin = join(dir, "bin");
  const stub = join(bin, "pandoc");

  rmSync(bin, { recursive: true, force: true });
  mkdirSync(bin);
  writeFileSync(stub, "#!/bin/sh\necho 'pandoc exploded' >&2\nexit 1\n");
  chmodSync(stub, 0o755);
  const previous = process.env.PATH;

  process.env.PATH = [bin, "/usr/bin", "/bin"].join(delimiter);
  t.onTestFinished(() => {
    process.env.PATH = previous;
  });

  return run();
}

test("a failing Pandoc falls back to paragraph text with a warning", async (t) => {
  const dir = scratch(t);

  writeFileSync(join(dir, "essay.docx"), docx(BODY("Plain body text")));

  const result = await withFailingPandoc(t, dir, () =>
    extractDocument(dir, "essay.docx"),
  );

  assert.equal(result.ok, true);
  assert.equal(result.text, "Plain body text");
  assert.match(
    (result.warnings ?? []).join("\n"),
    /Pandoc extraction unavailable \(pandoc exploded|Pandoc extraction unavailable \(Command failed/,
  );
  assert.match((result.warnings ?? []).join("\n"), /footnotes and citations/);
});

test("an aborted extraction fails instead of falling back to paragraph text", async (t) => {
  const dir = scratch(t);

  writeFileSync(join(dir, "essay.docx"), docx(BODY("Plain body text")));

  const controller = new AbortController();

  controller.abort();

  const result = await withFailingPandoc(t, dir, () =>
    extractDocument(dir, "essay.docx", controller.signal),
  );

  assert.equal(result.ok, false);
  assert.equal(result.text, "");
});

test("an oversized document.xml is refused instead of inflated", async (t) => {
  const dir = scratch(t);
  // 65 MiB of spaces compresses to a few dozen KiB, the shape of a zip bomb.
  const bomb = BODY(" ".repeat(65 * 1024 * 1024));

  writeFileSync(join(dir, "bomb.docx"), docx(bomb));

  const result = await withFailingPandoc(t, dir, () =>
    extractDocument(dir, "bomb.docx"),
  );

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /too large/);
});

test("withFileLock serialises read-modify-write across processes", async (t) => {
  const dir = scratch(t);
  const counter = join(dir, "counter.json");

  const lockModule = fileURLToPath(
    new URL("../lib/fs-safe.ts", import.meta.url),
  );

  writeFileSync(counter, "0");

  const worker = join(dir, "worker.mjs");

  writeFileSync(
    worker,
    `import { readFileSync, writeFileSync } from "node:fs";
import { withFileLock } from ${JSON.stringify(lockModule)};
const [path, rounds] = process.argv.slice(2);
for (let i = 0; i < Number(rounds); i++) {
  await withFileLock(path, () => {
    const value = Number(readFileSync(path, "utf8"));
    const until = Date.now() + 2;
    while (Date.now() < until);
    writeFileSync(path, String(value + 1));
  });
}
`,
  );

  const workers = 4;
  const rounds = 15;

  await Promise.all(
    Array.from(
      { length: workers },
      () =>
        new Promise<void>((resolve, reject) => {
          const child = spawn(
            process.execPath,
            [worker, counter, String(rounds)],
            { stdio: "inherit" },
          );

          child.on("error", reject);
          child.on("exit", (code) =>
            code === 0 ? resolve() : reject(new Error(`worker exit ${code}`)),
          );
        }),
    ),
  );

  assert.equal(Number(readFileSync(counter, "utf8")), workers * rounds);
});
