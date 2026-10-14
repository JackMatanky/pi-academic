import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, test } from "vitest";

import {
  overrideHardlinkForTest,
  resolveCslStyle,
} from "../pi-academic-writer/citations/csl-resolver.js";

const projects: string[] = [];

const originalFetch = globalThis.fetch;

const xml =
  '<?xml version="1.0"?><style xmlns="http://purl.org/net/xbiblio/csl" version="1.0"></style>';

afterEach(() => {
  globalThis.fetch = originalFetch;

  for (const project of projects.splice(0))
    rmSync(project, { recursive: true, force: true });
});

/**
 * A temp project; realpath'd because macOS tmpdir is a symlink and the resolver
 * returns real paths.
 */
function project(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "csl-resolver-")));
  projects.push(root);

  return root;
}

function style(path: string, content = xml): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);

  return path;
}

test("popular aliases and style IDs resolve cached files, without network access", async () => {
  const root = project();
  const cache = join(root, ".academic-writer", "csl");
  const apa = style(join(cache, "apa.csl"));
  const chicago = style(join(cache, "chicago-author-date.csl"));
  const journal = style(join(cache, "journal-of-example.csl"));
  globalThis.fetch = () => {
    throw new Error("unexpected download");
  };

  for (const alias of [
    "apa",
    "APA 7th edition",
    "American Psychological Association",
    "apa.csl",
  ])
    assert.equal(await resolveCslStyle(alias, root), apa);
  assert.equal(await resolveCslStyle("Chicago 18 Author-Date", root), chicago);
  assert.equal(await resolveCslStyle("journal-of-example", root), journal);
});

test("project, cache-relative, absolute and home paths validate CSL content", async () => {
  const root = project();
  const local = style(join(root, "my-style.csl"));
  const relative = join(root, ".academic-writer", "csl", "relative.csl");
  const cached = style(relative);
  assert.equal(await resolveCslStyle("relative.csl", root), cached);
  assert.equal(await resolveCslStyle("relative.csl", root), cached);
  assert.equal(await resolveCslStyle(local, root), local);
  const invalid = style(join(root, "invalid.csl"), "not CSL");
  await assert.rejects(
    resolveCslStyle(invalid, root),
    /File does not look like a CSL style/,
  );
  await assert.rejects(
    resolveCslStyle("missing.csl", root),
    /CSL file not found\. Tried:/,
  );
  await assert.rejects(
    resolveCslStyle("no-extension", root),
    /Unknown CSL style/,
  );
  await assert.rejects(resolveCslStyle("  ", root), /CSL style is empty/);
});

test("direct URL downloads even without --download and reuses its cached basename", async () => {
  const root = project();
  const url = "https://www.zotero.org/styles/my-style?version=1";
  const calls: string[] = [];
  globalThis.fetch = async (value) => {
    calls.push(String(value));

    return new Response(xml);
  };

  const path = await resolveCslStyle(url, root);
  assert.equal(path, join(root, ".academic-writer", "csl", "my-style.csl"));
  assert.equal(readFileSync(path, "utf8"), xml);
  assert.equal(await resolveCslStyle(url, root), path);
  assert.deepEqual(calls, [url]);
});

test("style IDs fall back from Zotero to the CSL repository and report both failures", async () => {
  const root = project();
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);

    return url.includes("raw.githubusercontent.com")
      ? new Response(xml)
      : new Response("not found", { status: 404 });
  };

  const path = await resolveCslStyle("mla", root, true);
  assert.equal(
    path,
    join(root, ".academic-writer", "csl", "modern-language-association.csl"),
  );
  assert.deepEqual(calls, [
    "https://www.zotero.org/styles/modern-language-association",
    "https://raw.githubusercontent.com/citation-style-language/styles/master/modern-language-association.csl",
  ]);
  const other = project();
  globalThis.fetch = async () => new Response("not found", { status: 404 });

  const failure = await resolveCslStyle("absent", other, true).then(
    () => undefined,
    (cause: Error) => cause,
  );

  assert.ok(failure instanceof Error);
  assert.match(
    failure.message,
    /CSL style id not found via Zotero or citation-style-language\/styles: absent/,
  );
  assert.equal((failure.message.match(/\(404\)/g) ?? []).length, 2);
  assert.equal(
    existsSync(join(other, ".academic-writer", "csl", "absent.csl")),
    false,
  );
});

test("invalid download never poisons cache; symlinked cache cannot write outside project", async () => {
  const root = project();
  globalThis.fetch = async () => new Response("not a style");
  await assert.rejects(
    resolveCslStyle("https://example.org/invalid.csl", root),
    /File does not look like a CSL style/,
  );
  assert.equal(
    existsSync(join(root, ".academic-writer", "csl", "invalid.csl")),
    false,
  );
  const outside = project();
  mkdirSync(join(root, ".academic-writer"), { recursive: true });
  symlinkSync(outside, join(root, ".academic-writer", "csl"));
  globalThis.fetch = async () => new Response(xml);
  await assert.rejects(
    resolveCslStyle("https://example.org/journal.csl", root),
    /CSL cache must remain inside the project/,
  );
  assert.equal(existsSync(join(outside, "journal.csl")), false);
});

test("download falls back to rename when linkSync fails with EXDEV, ENOTSUP, or EPERM", async () => {
  const root = project();

  globalThis.fetch = async () => new Response(xml);

  for (const code of ["EXDEV", "ENOTSUP", "EPERM"] as const) {
    const restore = overrideHardlinkForTest(() => {
      const err = Object.assign(new Error(`${code} failure`), { code });

      throw err;
    });

    try {
      const path = await resolveCslStyle(
        `https://example.org/${code.toLowerCase()}-test.csl`,
        root,
      );

      assert.equal(existsSync(path), true);
      assert.equal(readFileSync(path, "utf8"), xml);
    } finally {
      restore();
    }
  }
});
