import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Type } from "typebox";
import { test, type TestContext } from "vitest";

import { resolveInside, withFileLock } from "../lib/fs-safe.js";
import {
  loadProfile,
  parseProfileMd,
  serializeProfileMd,
  updateProfile,
} from "../lib/profile.js";
import {
  JsonObjectSchema,
  parseJsonText,
  parseWith,
  type JsonValue,
} from "../lib/schema.js";
import { auditCitations } from "../pi-academic-writer/citations/audit.js";
import {
  ingestSources,
  snapshotCitationAssets,
} from "../pi-academic-writer/citations/source-registry.js";
import { type OutlineItem } from "../pi-academic-writer/research/core.js";
import { migrateArticleOutline } from "../pi-academic-writer/research/outline.js";

function project(t: TestContext): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "project-safety-")));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  return root;
}

function write(root: string, path: string, content: string): void {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), content);
}

const readJson = (root: string, path: string): JsonValue =>
  parseJsonText(readFileSync(join(root, path), "utf8"));

const CiteKeyRecords = Type.Array(
  Type.Object({ citeKey: Type.String(), sourceType: Type.String() }),
);

test("resolveInside accepts project paths and rejects escapes, including through symlinks", (t) => {
  const root = project(t);
  const outside = project(t);
  assert.equal(resolveInside(root, "a/b.md"), join(root, "a", "b.md"));
  assert.equal(resolveInside(root, join(root, "x.md")), join(root, "x.md"));
  assert.equal(resolveInside(root, "..foo"), join(root, "..foo"));
  assert.throws(
    () => resolveInside(root, "../escape.md"),
    /inside the project/,
  );
  assert.throws(() => resolveInside(root, join(outside, "x.md")), /inside/);
  symlinkSync(outside, join(root, "link"));
  assert.throws(() => resolveInside(root, "link/x.md"), /inside/);
});

test("withFileLock serialises callers and takes over an abandoned lock", async (t) => {
  const root = project(t);
  const target = join(root, "state.json");
  assert.equal(
    await withFileLock(target, async () => {
      await assert.rejects(
        withFileLock(target, () => 0, { timeoutMs: 60 }),
        /Timed out locking/,
      );

      return "done";
    }),
    "done",
  );
  assert.equal(existsSync(`${target}.lock`), false, "lock is released");

  mkdirSync(`${target}.lock`);
  const old = new Date(Date.now() - 60_000);
  utimesSync(`${target}.lock`, old, old);
  assert.equal(await withFileLock(target, () => "taken over"), "taken over");
});

test("withFileLock queues same-process contention and keeps an active owner through a stale takeover", async (t) => {
  const root = project(t);
  const target = join(root, "state.json");
  const order: string[] = [];
  // Test-controlled gate: first holds the lock until released, so no real
  // timer decides the interleaving.
  let openGate: () => void = () => {};

  const gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });

  const first = withFileLock(target, async () => {
    order.push("first-start");
    // Older than staleMs: a naive takeover would evict this active owner.
    utimesSync(`${target}.lock`, new Date(Date.now() - 60_000), new Date());
    await gate;
    order.push("first-end");

    return 1;
  });

  const second = withFileLock(target, () => {
    order.push("second");

    return 2;
  });

  await Promise.resolve();
  openGate();

  assert.deepEqual([await first, await second], [1, 2]);
  assert.deepEqual(order, ["first-start", "first-end", "second"]);
  assert.equal(existsSync(`${target}.lock`), false, "lock is released");
});

test("withFileLock releases the lock when the callback rejects", async (t) => {
  const root = project(t);
  const target = join(root, "state.json");

  await assert.rejects(
    withFileLock(target, () => Promise.reject(new Error("boom"))),
    /boom/,
  );
  assert.equal(existsSync(`${target}.lock`), false, "lock is released");
  assert.equal(await withFileLock(target, () => "again"), "again");
});

test("withFileLock strictly serializes in-process callers and cleans up queue", async (t) => {
  const root = project(t);
  const target = join(root, "strict-serialization.json");
  let active = 0;
  let maxActive = 0;
  const events: string[] = [];

  const firstStarted = Promise.withResolvers<void>();
  const firstGate = Promise.withResolvers<void>();

  const first = withFileLock(target, async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    events.push("t1-start");
    firstStarted.resolve();
    await firstGate.promise;
    events.push("t1-end");
    active -= 1;

    return "t1";
  });

  const second = withFileLock(target, async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    events.push("t2-start");
    events.push("t2-end");
    active -= 1;

    return "t2";
  });

  await firstStarted.promise;
  assert.equal(active, 1);
  assert.deepEqual(events, ["t1-start"]);

  firstGate.resolve();

  const results = await Promise.all([first, second]);

  assert.deepEqual(results, ["t1", "t2"]);
  assert.equal(
    maxActive,
    1,
    "concurrent in-process callers execute strictly sequentially",
  );
  assert.deepEqual(events, ["t1-start", "t1-end", "t2-start", "t2-end"]);
  assert.equal(existsSync(`${target}.lock`), false, "lock is released");

  let followUpExecuted = false;

  const followUp = await withFileLock(target, () => {
    followUpExecuted = true;

    return "done";
  });

  assert.equal(followUp, "done");
  assert.equal(followUpExecuted, true);
  assert.equal(existsSync(`${target}.lock`), false);
});

test("withFileLock respects AbortSignal and safely preserves lock directory on foreign ownership", async (t) => {
  const root = project(t);
  const target = join(root, "abort-and-stolen.json");
  const lock = `${target}.lock`;

  const preController = new AbortController();
  preController.abort(new Error("pre-aborted"));
  await assert.rejects(
    withFileLock(target, () => "ok", { signal: preController.signal }),
    /pre-aborted/,
  );
  assert.equal(existsSync(lock), false);

  const firstBlocker = Promise.withResolvers<void>();
  const abortCtrl = new AbortController();

  const first = withFileLock(target, async () => {
    await firstBlocker.promise;

    return "first";
  });

  const queued = withFileLock(target, () => "second", {
    signal: abortCtrl.signal,
  });

  const third = withFileLock(target, () => "third");

  abortCtrl.abort(new Error("aborted in queue"));
  firstBlocker.resolve();

  await assert.rejects(queued, /aborted in queue/);
  assert.equal(await first, "first");
  assert.equal(await third, "third");
  assert.equal(existsSync(lock), false);

  const pollTarget = join(root, "poll-abort.json");
  const pollLock = `${pollTarget}.lock`;
  mkdirSync(pollLock, { recursive: true });
  writeFileSync(join(pollLock, "owner"), "competing-owner");

  const pollAbortCtrl = new AbortController();
  queueMicrotask(() => pollAbortCtrl.abort(new Error("aborted in poll")));
  await assert.rejects(
    withFileLock(pollTarget, () => "never", {
      signal: pollAbortCtrl.signal,
      timeoutMs: 10_000,
    }),
    /aborted in poll/,
  );
  rmSync(pollLock, { recursive: true, force: true });

  const tamperedTarget = join(root, "tampered.json");
  const tamperedLock = `${tamperedTarget}.lock`;

  const tampered = await withFileLock(tamperedTarget, async () => {
    writeFileSync(join(tamperedLock, "owner"), "foreign-stealer");

    return "tampered";
  });

  assert.equal(tampered, "tampered");
  assert.equal(
    existsSync(tamperedLock),
    true,
    "foreign lock directory preserved",
  );
  assert.equal(
    readFileSync(join(tamperedLock, "owner"), "utf8"),
    "foreign-stealer",
  );
  rmSync(tamperedLock, { recursive: true, force: true });
});

test("re-ingesting keeps Zotero records, existing citekeys and foreign BibTeX entries", async (t) => {
  const root = project(t);
  write(root, ".academic-writer/sources/n.md", "# Notes 2020\n\nBody.\n");
  const first = await ingestSources(root);
  const original = first.sources[0]?.citeKey;
  assert.equal(original, "notes_2020", "the year is not doubled");

  const registry = parseWith(
    Type.Array(JsonObjectSchema),
    readJson(root, ".academic-writer/sources.json"),
    "registry",
  );

  writeFileSync(
    join(root, ".academic-writer/sources.json"),
    JSON.stringify([
      ...registry,
      {
        sourceType: "zotero",
        sourceId: "zotero:1:ABC",
        citeKey: "smith2020",
      },
    ]),
  );
  const bibliography = join(root, ".academic-writer/bibliography.bib");
  writeFileSync(
    bibliography,
    `${readFileSync(bibliography, "utf8")}\n@book{smith2020, title={Zotero Book}}\n`,
  );

  write(root, ".academic-writer/sources/a.md", "# Another Note 2020\n");
  const second = await ingestSources(root);

  const merged = parseWith(
    CiteKeyRecords,
    readJson(root, ".academic-writer/sources.json"),
    "registry",
  );

  assert.deepEqual(merged.map((record) => record.citeKey).sort(), [
    "another_note_2020",
    "notes_2020",
    "smith2020",
  ]);
  assert.equal(
    second.sources.find((record) => record.path.endsWith("n.md"))?.citeKey,
    original,
    "adding a file does not rename existing keys",
  );
  const bib = readFileSync(bibliography, "utf8");
  assert.match(bib, /@book\{smith2020/);
  assert.equal(bib.match(/@misc\{notes_2020,/g)?.length, 1);
});

test("ingest rejects paths outside the project and refuses to overwrite a corrupt registry", async (t) => {
  const root = project(t);
  const outside = project(t);
  write(outside, "x.md", "# Outside\n");
  const result = await ingestSources(root, [join(outside, "x.md")]);
  assert.equal(result.count, 0);
  assert.match(result.errors[0]?.error ?? "", /inside the project/);

  write(root, ".academic-writer/sources.json", "{not json");
  write(root, ".academic-writer/sources/a.md", "# A\n");
  await assert.rejects(ingestSources(root));
  assert.equal(
    readFileSync(join(root, ".academic-writer/sources.json"), "utf8"),
    "{not json",
  );
});

test("snapshotCitationAssets refuses paths outside the project", (t) => {
  const root = project(t);
  write(root, ".academic-writer/sources.json", "[]");
  write(root, ".academic-writer/bibliography.bib", "");
  write(root, "articles/a.md", "# T\n\nBody.\n");
  assert.throws(
    () => snapshotCitationAssets(root, "../outside/x.md"),
    /inside the project/,
  );
});

test("the citation audit ignores e-mail, code and trailing punctuation but checks narrative citations", (t) => {
  const root = project(t);
  write(
    root,
    "articles/a.md",
    [
      "---",
      "contact: me@example.com",
      "---",
      "",
      "Mail me@example.com or [me@example.com].",
      "Code `[@fake]` stays out.",
      "",
      "```",
      "[@fake2]",
      "```",
      "",
      "Page cite [@smith2020: 4] and [@smith2020.] and @ghost argues so.",
      "",
    ].join("\n"),
  );
  write(root, ".academic-writer/sources.json", '[{"citeKey":"smith2020"}]');
  write(
    root,
    ".academic-writer/bibliography.bib",
    "@book{smith2020, title={B}}\n",
  );
  const audit = auditCitations("articles/a.md", "chicago", root);
  assert.equal(audit.status, "failed");
  assert.deepEqual(audit.citationKeys.sort(), ["ghost", "smith2020"]);
  assert.deepEqual(audit.missingFromSources, ["ghost"]);
  assert.deepEqual(audit.malformedMarkers, []);
});

test("updateProfile keeps unknown fields and sections, quotes awkward values and rejects bad patches", async (t) => {
  const root = project(t);
  write(
    root,
    ".academic-writer/profile.md",
    [
      "# Academic Writer Profile",
      "",
      "---",
      "fieldOfStudy: History",
      "customKey: kept",
      "---",
      "",
      "## Custom Notes",
      "",
      "```json",
      '{"a":1}',
      "```",
      "",
    ].join("\r\n"),
  );
  await updateProfile(root, {
    fieldOfStudy: "Line one\nLine two",
    citationStyle: "",
  });
  const profile = loadProfile(root);
  assert.equal(profile?.fieldOfStudy, "Line one\nLine two");
  assert.equal(profile?.citationStyle, "");
  assert.deepEqual(profile?.extraFrontmatter, { customKey: "kept" });
  assert.deepEqual(profile?.extraSections, { "Custom Notes": { a: 1 } });

  await assert.rejects(updateProfile(root, { abstractLanguages: "English" }));
  await assert.rejects(updateProfile(root, { tools: [1] }));
  assert.equal(await updateProfile(join(root, "nowhere"), {}), null);
  assert.equal(serializeProfileMd({}).includes("abstractLanguages: []"), true);
});

test("profile frontmatter parses as YAML with the string/list/null contract", (t) => {
  const root = project(t);
  write(
    root,
    ".academic-writer/profile.md",
    [
      "# Academic Writer Profile",
      "",
      "---",
      "fieldOfStudy: 'Ancient: History'",
      'quoted: "a: b"',
      "version: 2",
      "flag: true",
      "empty:",
      "languages:",
      "  - English",
      "  - 'Hebrew: Biblical'",
      "nested:",
      "  inner: 1",
      "---",
      "",
    ].join("\n"),
  );
  const profile = loadProfile(root);
  assert.equal(profile?.fieldOfStudy, "Ancient: History");
  // Nulls and shapes outside the contract are not carried in the extras;
  // numbers and booleans arrive as their text form.
  assert.deepEqual(profile?.extraFrontmatter, {
    quoted: "a: b",
    version: "2",
    flag: "true",
    languages: ["English", "Hebrew: Biblical"],
  });

  const serialized = parseProfileMd(serializeProfileMd(profile!));

  assert.deepEqual(
    serialized.extraFrontmatter ?? {},
    profile?.extraFrontmatter,
  );

  write(root, ".academic-writer/profile.md", "---\nbroken: a: b\n---\n");
  assert.throws(() => loadProfile(root), /Malformed profile frontmatter/);
});

test("a malformed profile section is an error, not a missing profile", (t) => {
  const root = project(t);
  write(
    root,
    ".academic-writer/profile.md",
    "---\nfieldOfStudy: X\n---\n\n## Tools\n\n```json\n{oops\n```\n",
  );
  assert.throws(
    () => loadProfile(root),
    /Profile section "Tools" has invalid JSON/,
  );
  assert.equal(loadProfile(join(root, "elsewhere")), null);
});

test("migrating an article to an outline does not treat code fences as headings", (t) => {
  const root = project(t);
  write(
    root,
    "articles/a.md",
    "# Title\n\nIntro.\n\n```sh\n# comment\n\nsecond\n```\n\n## Next\n\nText.\n",
  );
  const outline = migrateArticleOutline(root, "articles/a.md", {});
  const titles: string[] = [];

  const walk = (items: OutlineItem[]): void => {
    for (const item of items) {
      if (item.kind === "section") {
        titles.push(item.title ?? "");
        walk(item.items ?? []);
      }
    }
  };

  walk(outline.items);
  assert.deepEqual(titles, ["Title", "Next"]);
  assert.throws(
    () => migrateArticleOutline(root, "../escape.md", {}),
    /inside the project/,
  );
});
