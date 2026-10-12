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
import { test, type TestContext } from "node:test";

import { Type } from "typebox";

import { resolveInside, withFileLock } from "../lib/fs-safe.js";
import {
  loadProfile,
  serializeProfileMd,
  updateProfile,
} from "../lib/profile.js";
import {
  JsonObjectSchema,
  parseJsonText,
  parseWith,
  type JsonValue,
} from "../lib/schema.js";
import { ParagraphSchema } from "../pi-academic-writer/article.js";
import { auditCitations } from "../pi-academic-writer/citation-audit.js";
import { assembleDocxJson } from "../pi-academic-writer/docx-assembly.js";
import { type OutlineItem } from "../pi-academic-writer/research-core.js";
import { migrateArticleOutline } from "../pi-academic-writer/research-outline.js";
import {
  ingestSources,
  snapshotCitationAssets,
} from "../pi-academic-writer/source-registry.js";

function project(t: TestContext): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "project-safety-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));

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

const AssembledArticle = Type.Object({
  title: Type.String(),
  thesis: Type.String(),
  sections: Type.Array(
    Type.Object({
      title: Type.String(),
      paragraphs: Type.Array(ParagraphSchema),
    }),
  ),
});

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

test("withFileLock serialises callers and takes over an abandoned lock", (t) => {
  const root = project(t);
  const target = join(root, "state.json");
  assert.equal(
    withFileLock(target, () => {
      assert.throws(
        () => withFileLock(target, () => 0, { timeoutMs: 60 }),
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
  assert.equal(
    withFileLock(target, () => "taken over"),
    "taken over",
  );
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

test("snapshotCitationAssets and assembleDocxJson refuse paths outside the project", (t) => {
  const root = project(t);
  write(root, ".academic-writer/sources.json", "[]");
  write(root, ".academic-writer/bibliography.bib", "");
  write(root, "articles/a.md", "# T\n\nBody.\n");
  assert.throws(
    () => snapshotCitationAssets(root, "../outside/x.md"),
    /inside the project/,
  );
  const result = assembleDocxJson(root, "articles/a.md", "../out.json", {});
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /inside the project/);
  assert.equal(existsSync(join(root, "..", "out.json")), false);
});

test("assembleDocxJson keeps subheadings, turns [^n] into footnotes and leaves code alone", (t) => {
  const root = project(t);
  write(
    root,
    "articles/a.md",
    [
      "# Title",
      "",
      "*The thesis line.*",
      "",
      "Opening claim.[^1] More text.[^2]",
      "",
      "## Section",
      "",
      "*An italic line in a section is body text.*",
      "",
      "### Sub heading",
      "",
      "```",
      "# not a heading",
      "",
      "[^1]: not a definition",
      "```",
      "",
      "[^1]: First note,",
      "    continued.",
      "[^2]: Second note.",
      "",
    ].join("\n"),
  );

  const result = assembleDocxJson(root, "articles/a.md", "out.json", {
    targetLanguage: "English",
  });

  assert.equal(result.ok, true, result.error ?? "");

  const data = parseWith(
    AssembledArticle,
    readJson(root, "out.json"),
    "article",
  );

  assert.equal(data.title, "Title");
  assert.equal(data.thesis, "The thesis line.");
  assert.deepEqual(
    data.sections.map((section) => section.title),
    ["Body", "Section", "Sub heading"],
  );
  assert.deepEqual(data.sections[0]?.paragraphs[0], {
    text: "Opening claim. More text.",
    footnotes: [
      { after: "Opening claim.", text: "First note, continued." },
      { after: " More text.", text: "Second note." },
    ],
  });
  assert.equal(
    data.sections[1]?.paragraphs[0],
    "*An italic line in a section is body text.*",
  );
  assert.match(String(data.sections[2]?.paragraphs[0]), /# not a heading/);
  assert.match(
    String(data.sections[2]?.paragraphs[0]),
    /\[\^1\]: not a definition/,
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
  assert.ok("mode" in audit);
  assert.deepEqual(audit.citationKeys.sort(), ["ghost", "smith2020"]);
  assert.deepEqual(audit.missingFromSources, ["ghost"]);
  assert.deepEqual(audit.malformedMarkers, []);
});

test("updateProfile keeps unknown fields and sections, quotes awkward values and rejects bad patches", (t) => {
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
  updateProfile(root, {
    fieldOfStudy: "Line one\nLine two",
    citationStyle: "",
  });
  const profile = loadProfile(root);
  assert.equal(profile?.fieldOfStudy, "Line one\nLine two");
  assert.equal(profile?.citationStyle, "");
  assert.deepEqual(profile?.extraFrontmatter, { customKey: "kept" });
  assert.deepEqual(profile?.extraSections, { "Custom Notes": { a: 1 } });

  assert.throws(() => updateProfile(root, { abstractLanguages: "English" }));
  assert.throws(() => updateProfile(root, { tools: [1] }));
  assert.equal(updateProfile(join(root, "nowhere"), {}), null);
  assert.equal(serializeProfileMd({}).includes("abstractLanguages: []"), true);
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
