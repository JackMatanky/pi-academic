import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { test, type TestContext } from "node:test";
import { isDeepStrictEqual } from "node:util";

import { Type } from "typebox";

import {
  isValid,
  JsonArraySchema,
  JsonObjectSchema,
  parseJsonText,
  type JsonObject,
  type JsonValue,
} from "../lib/schema.js";
import {
  createToolHarness,
  get,
  repoRoot,
  type ToolResult,
} from "./helpers.js";

const { callTool } = createToolHarness();

function scratch(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "aw-outline-"));

  t.after(() => rmSync(dir, { recursive: true, force: true }));

  return dir;
}

function str(value: JsonValue | undefined): string {
  assert.ok(isValid(Type.String(), value), "expected a string");

  return value;
}

function arr(value: JsonValue | undefined): JsonValue[] {
  assert.ok(isValid(JsonArraySchema, value), "expected an array");

  return value;
}

const at = (result: ToolResult, ...path: (string | number)[]) =>
  get(result.details, ...path);

const codes = (findings: JsonValue | undefined): string[] =>
  arr(findings).map((finding) => str(get(finding, "code")));

const ok = (result: ToolResult) => result.details.ok;

const OUTLINE_ARTICLE = { article: "articles/essay.md" };

interface SectionNode {
  id: string;
  kind: "section";
  title: string;
  purpose: string;
  thesisContribution: string;
  items: SectionNode[];
}

const section = (
  id: string,
  title: string,
  items: SectionNode[] = [],
): SectionNode => ({
  id,
  kind: "section",
  title,
  purpose: "P",
  thesisContribution: "C",
  items,
});

function treeOutline() {
  return {
    schemaVersion: 1,
    article: {
      slug: "tree",
      title: "Tree",
      targetLanguage: "English",
      citationStyle: "apa",
    },
    researchQuestion: "Question?",
    thesis: { text: "Thesis", status: "proposed" },
    status: "draft",
    items: [
      section("outer", "Outer", [
        section("inner", "Inner", [section("deep", "Deep")]),
        section("inner-two", "Inner Two"),
      ]),
      section("outer-two", "Outer Two"),
    ],
  };
}

/**
 * Every file under `root` keyed by relative path.
 */
function snapshotFiles(root: string): Map<string, string> {
  const files = new Map<string, string>();

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);

      if (statSync(path).isDirectory()) walk(path);
      else
        files.set(relative(root, path), readFileSync(path).toString("base64"));
    }
  };

  walk(root);

  return files;
}

for (const [style, citation] of [
  ["inline-parenthetical", "(Augustine, Confessions XI, 14)"],
  ["note", "[1]"],
  ["apa", "[@augConfessions, p. 14]"],
] as const) {
  test(`[test_approved_snapshots_preserve_both_citation_modes] ${style} snapshots freeze sources, bibliography and notes`, async (t) => {
    const root = scratch(t);
    const state = join(root, ".academic-writer");
    const articles = join(root, "articles");

    mkdirSync(state);
    mkdirSync(articles);

    const sourceId = "zotero:fixture:ABC12345";

    const sources = [
      {
        sourceId,
        sourceType: "zotero",
        libraryId: "fixture",
        itemKey: "ABC12345",
        citeKey: "augConfessions",
        sourceFingerprint: null,
      },
    ];

    const bibliography = "@book{augConfessions, title={Confessions}}\n";

    writeFileSync(join(state, "sources.json"), JSON.stringify(sources));
    writeFileSync(join(state, "bibliography.bib"), bibliography);

    const articleText = `# Essay\n\nThe claim remains interpretive ${citation}.\n`;
    const articlePath = join(articles, "essay.md");

    writeFileSync(articlePath, articleText);

    const note = await callTool(root, "academic_writer_write_research_notes", {
      notesJson: JSON.stringify([
        {
          id: "evidence",
          kind: "quotation",
          coreStatement: "Evidence claim",
          sourceRef: sourceId,
          anchor: {
            locator: { display: "Confessions XI, 14" },
            textQuote: { exact: "Exact source words" },
          },
        },
      ]),
    });

    assert.equal(ok(note), true);

    await callTool(root, "academic_writer_review_research_notes", {
      noteIds: ["evidence"],
      state: "verified",
    });

    const outline = {
      schemaVersion: 1,
      article: {
        slug: "essay",
        title: "Essay",
        targetLanguage: "English",
        citationStyle: style,
      },
      researchQuestion: "Question?",
      thesis: { text: "Thesis", status: "approved" },
      status: "approved",
      items: [
        {
          id: "section",
          kind: "section",
          title: "Argument",
          purpose: "Purpose",
          thesisContribution: "Contribution",
          items: [
            {
              id: "point",
              kind: "point",
              role: "argument",
              claim: "Claim",
              reasoning: "Reasoning",
              noteUses: [
                {
                  noteId: "evidence",
                  function: "supports",
                  handling: "analyze",
                  coverage: "primary",
                },
              ],
            },
          ],
        },
      ],
    };

    const saved = await callTool(root, "academic_writer_write_outline", {
      outlineJson: JSON.stringify(outline),
    });

    assert.equal(ok(saved), true);
    assert.equal(
      ok(
        await callTool(root, "academic_writer_render_outline", OUTLINE_ARTICLE),
      ),
      true,
    );
    assert.equal(
      ok(
        await callTool(
          root,
          "academic_writer_snapshot_citations",
          OUTLINE_ARTICLE,
        ),
      ),
      true,
    );
    assert.equal(
      ok(
        await callTool(root, "academic_writer_snapshot_notes", OUTLINE_ARTICLE),
      ),
      true,
    );

    const audit = await callTool(root, "academic_writer_audit_citations", {
      ...OUTLINE_ARTICLE,
      citationStyle: style,
    });

    assert.equal(ok(audit), true);

    const bundle = await callTool(root, "academic_writer_query_research", {
      operation: "section_bundle",
      ...OUTLINE_ARTICLE,
      sectionId: "section",
    });

    assert.equal(ok(bundle), true);
    assert.equal(at(bundle, "value", "notes", 0, "id"), "evidence");
    assert.equal(readFileSync(articlePath, "utf8"), articleText);
    assert.deepEqual(
      parseJsonText(readFileSync(join(articles, "essay.sources.json"), "utf8")),
      sources,
    );
    assert.equal(
      readFileSync(join(articles, "essay.bibliography.bib"), "utf8"),
      bibliography,
    );
    assert.equal(
      get(
        parseJsonText(readFileSync(join(articles, "essay.notes.json"), "utf8")),
        "notes",
        0,
        "id",
      ),
      "evidence",
    );
  });
}

test("[test_query_operations_caps_and_recursive_render_order] query operations, caps and recursive render order", async (t) => {
  const root = scratch(t);
  const state = join(root, ".academic-writer");

  mkdirSync(state);
  writeFileSync(
    join(state, "sources.json"),
    JSON.stringify([{ sourceId: "zotero:library:item", sourceType: "zotero" }]),
  );

  const notes = [
    {
      id: "source-note",
      kind: "paraphrase",
      coreStatement: "Source-linked finding",
      researcherNote: "Researcher paraphrase",
      sourceRef: "zotero:library:item",
      tags: ["common"],
    },
    ...Array.from({ length: 105 }, (_, index) => ({
      id: `idea-${index}`,
      kind: "idea",
      coreStatement: `Idea ${index}`,
      tags: ["common"],
    })),
  ];

  const saved = await callTool(root, "academic_writer_write_research_notes", {
    notesJson: JSON.stringify(notes),
  });

  assert.equal(ok(saved), true);

  const invalidDate = await callTool(
    root,
    "academic_writer_write_research_notes",
    {
      notesJson: JSON.stringify([
        {
          id: "invalid-date",
          kind: "idea",
          coreStatement: "Invalid timestamp",
          createdAt: "March 4, 2024",
        },
      ]),
    },
  );

  assert.equal(ok(invalidDate), false);

  const byId = await callTool(root, "academic_writer_query_research", {
    operation: "note_by_id",
    noteId: "source-note",
  });

  assert.equal(ok(byId), true);
  assert.equal(at(byId, "value", "id"), "source-note");

  const bySource = await callTool(root, "academic_writer_query_research", {
    operation: "notes_by_source",
    sourceId: "zotero:library:item",
  });

  assert.equal(ok(bySource), true);
  assert.deepEqual(
    arr(at(bySource, "value")).map((note) => get(note, "id")),
    ["source-note"],
  );

  const tagQuery = { operation: "notes_by_tag", tag: "common" };

  const defaultList = await callTool(
    root,
    "academic_writer_query_research",
    tagQuery,
  );

  const capped = await callTool(root, "academic_writer_query_research", {
    ...tagQuery,
    limit: 100,
  });

  assert.equal(arr(at(defaultList, "value")).length, 20);
  assert.equal(arr(at(capped, "value")).length, 100);

  const overLimit = await callTool(root, "academic_writer_query_research", {
    ...tagQuery,
    limit: 101,
  });

  assert.equal(overLimit.isError, true);

  const mixed = await callTool(root, "academic_writer_query_research", {
    operation: "note_by_id",
    noteId: "source-note",
    tag: "common",
  });

  assert.equal(ok(mixed), false);

  const noSource = await callTool(root, "academic_writer_query_research", {
    operation: "notes_by_source",
  });

  assert.equal(ok(noSource), false);

  const written = await callTool(root, "academic_writer_write_outline", {
    outlineJson: JSON.stringify(treeOutline()),
  });

  assert.equal(ok(written), true);

  const rendered = await callTool(root, "academic_writer_render_outline", {
    article: "articles/tree.md",
  });

  assert.equal(ok(rendered), true);

  const headings = readFileSync(
    join(root, "articles", "tree.outline.md"),
    "utf8",
  )
    .split(/\r?\n/)
    .filter((line) => line.startsWith("#"));

  assert.deepEqual(headings, [
    "# Tree",
    "## 1. Outer",
    "### 1. Inner",
    "#### 1. Deep",
    "### 2. Inner Two",
    "## 2. Outer Two",
  ]);

  const summary = await callTool(root, "academic_writer_query_research", {
    operation: "outline_summary",
    article: "articles/tree.md",
  });

  assert.equal(ok(summary), true);
  assert.deepEqual(
    arr(at(summary, "value", "sections")).map((entry) => get(entry, "id")),
    ["outer", "inner", "deep", "inner-two", "outer-two"],
  );
});

const FIXTURE = join(repoRoot, "tests", "e2e", "fixture-project");

test("[test_e2e_fixture_outline_uses_frozen_notes] fixture outline uses frozen notes", async () => {
  const summary = await callTool(FIXTURE, "academic_writer_query_research", {
    operation: "outline_summary",
    article: "articles/augustine-time.md",
  });

  assert.equal(ok(summary), true);
  assert.equal(at(summary, "value", "status"), "approved");

  const bundle = await callTool(FIXTURE, "academic_writer_query_research", {
    operation: "section_bundle",
    article: "articles/augustine-time.md",
    sectionId: "augustine",
  });

  assert.equal(ok(bundle), true);
  assert.equal(at(bundle, "value", "directPoints", 0, "id"), "soul-times");
  assert.equal(at(bundle, "value", "notes", 0, "id"), "note-aug-soul");
  assert.equal(at(bundle, "value", "notes", 0, "review", "state"), "verified");
  assert.equal(
    at(bundle, "value", "notes", 0, "sourceRef"),
    "zotero:fixture-library:CFN11AAA",
  );
});

test("[test_e2e_fixture_diagnostic_tools_are_read_only] fixture diagnostics are read-only", async (t) => {
  const root = join(scratch(t), "fixture");

  cpSync(FIXTURE, root, { recursive: true });
  writeFileSync(
    join(root, "articles", "augustine-time.md"),
    "# Review\nA fixture paragraph [@CFN11AAA].\n",
  );

  const before = snapshotFiles(root);

  const diagnosed = await callTool(root, "academic_writer_diagnose_outline", {
    article: "articles/augustine-time.md",
  });

  const segmented = await callTool(root, "academic_writer_reverse_outline", {
    article: "articles/augustine-time.md",
  });

  assert.equal(at(diagnosed, "value", "status"), "advisory");
  assert.equal(at(segmented, "value", "status"), "advisory");
  assert.equal(
    at(segmented, "value", "units", 0, "text"),
    "A fixture paragraph [@CFN11AAA].",
  );
  assert.deepEqual(snapshotFiles(root), before);
});

test("[test_outline_migration_preserves_markdown_and_conflicts] outline migration preserves markdown and detects conflicts", async (t) => {
  const root = scratch(t);
  const articles = join(root, "articles");

  mkdirSync(articles);

  const markdown =
    "Intro paragraph\n\n# Main\n\n  First body paragraph.  \n\n## Nested\n\nSecond body paragraph.\n";

  const articlePath = join(articles, "old-article.md");

  writeFileSync(articlePath, markdown);

  const migrated = await callTool(
    root,
    "academic_writer_migrate_article_outline",
    { article: "articles/old-article.md" },
  );

  assert.equal(ok(migrated), true);

  const outline = at(migrated, "value");

  assert.ok(isValid(JsonObjectSchema, outline));
  assert.equal(outline.status, "draft");
  assert.equal(readFileSync(articlePath, "utf8"), markdown);
  assert.equal(get(outline, "items", 0, "draftText"), "Intro paragraph");
  assert.equal(
    get(outline, "items", 1, "items", 0, "draftText"),
    "  First body paragraph.  ",
  );
  assert.equal(
    get(outline, "items", 1, "items", 1, "items", 0, "draftText"),
    "Second body paragraph.",
  );

  const forged = structuredClone(outline);

  assert.ok(isValid(JsonObjectSchema, forged.article));
  forged.article.slug = "forged";

  const forgedResult = await callTool(root, "academic_writer_write_outline", {
    outlineJson: JSON.stringify(forged),
  });

  assert.equal(ok(forgedResult), false);

  const accepted = await callTool(root, "academic_writer_write_outline", {
    outlineJson: JSON.stringify(outline),
  });

  assert.equal(ok(accepted), true);
  assert.equal(
    ok(
      await callTool(root, "academic_writer_render_outline", {
        article: "articles/old-article.md",
      }),
    ),
    true,
  );

  const conflict = await callTool(
    root,
    "academic_writer_migrate_article_outline",
    { article: "articles/old-article.md" },
  );

  assert.equal(ok(conflict), false);
});

test("[test_health_includes_rumdl_field] health reports rumdl detection", async (t) => {
  const root = scratch(t);

  mkdirSync(join(root, ".academic-writer"));
  mkdirSync(join(root, "articles"));
  writeFileSync(join(root, "articles", "ok.md"), "Text [@smith2020].");
  writeFileSync(
    join(root, ".academic-writer", "profile.json"),
    JSON.stringify({
      fieldOfStudy: "Literature",
      citationStyle: "apa",
      abstractLanguages: ["English"],
      tools: {},
    }),
  );

  await callTool(root, "academic_writer_migrate_profile", {});

  const health = await callTool(root, "academic_writer_health", {});

  assert.ok("rumdl" in health.details);
  assert.ok(isValid(Type.Boolean(), health.details.rumdl));
});

test("[test_outline_diagnostics_and_reverse_outline_are_read_only] outline diagnostics and reverse outline are read-only", async (t) => {
  const root = scratch(t);
  const articles = join(root, "articles");

  mkdirSync(articles);
  mkdirSync(join(root, ".academic-writer"));

  const article =
    "# Intro\nFirst [@citeKey]\ncontinued.\n\n> quoted\n> passage\n\n```python\nnot prose\n```\n\n## Child\nLast paragraph.\n";

  const articlePath = join(articles, "essay.md");
  const outlinePath = join(articles, "essay.outline.json");

  writeFileSync(articlePath, article);
  writeFileSync(
    outlinePath,
    JSON.stringify({
      items: [
        {
          id: "point-1",
          kind: "point",
          noteUses: [{ noteId: "missing-note" }],
        },
      ],
    }),
  );

  const before = [articlePath, outlinePath].map((path) => readFileSync(path));

  const value = async (name: string, params: Record<string, string>) =>
    at(await callTool(root, name, params), "value");

  const diagnosed = await value("academic_writer_diagnose_outline", {
    article: "articles/essay.md",
  });

  const segmented = await value("academic_writer_reverse_outline", {
    article: "articles/essay.md",
  });

  const escaped = await value("academic_writer_reverse_outline", {
    article: "../outside.md",
  });

  assert.equal(get(diagnosed, "status"), "advisory");

  const findings = arr(get(diagnosed, "findings"));

  assert.ok(
    findings.some((finding) =>
      isDeepStrictEqual(finding, {
        code: "missing-required-field",
        path: "$.items[0].claim",
        nodeId: "point-1",
        explanation: "Point is missing claim.",
      }),
    ),
  );
  assert.equal(
    get(findings[findings.length - 1], "code"),
    "unresolved-note-reference",
  );
  assert.equal(get(segmented, "status"), "advisory");

  const units = arr(get(segmented, "units"));

  assert.deepEqual(
    units.map((unit) => get(unit, "text")),
    ["First [@citeKey]\ncontinued.", "> quoted\n> passage", "Last paragraph."],
  );
  assert.deepEqual(
    [
      get(units[0], "startLine"),
      get(units[0], "endLine"),
      get(units[0], "headingPath"),
    ],
    [2, 3, ["Intro"]],
  );
  assert.equal(get(units[0], "hasCitationMarker"), true);
  assert.equal(get(units[1], "hasCitationMarker"), false);
  assert.deepEqual(get(units[2], "headingPath"), ["Intro", "Child"]);
  assert.equal(get(units[2], "endLine"), 13);
  assert.equal(get(escaped, "status"), "error");
  assert.deepEqual(
    [articlePath, outlinePath].map((path) => readFileSync(path)),
    before,
  );

  const cleanOutline = join(articles, "clean.outline.json");

  writeFileSync(cleanOutline, JSON.stringify({ items: [] }));

  const clean = await value("academic_writer_diagnose_outline", {
    article: "articles/clean.md",
  });

  assert.deepEqual(clean, {
    status: "advisory",
    artifact: cleanOutline,
    findings: [],
  });

  const diagnoseWith = (evidenceMap: JsonObject) =>
    callTool(root, "academic_writer_diagnose_outline", {
      article: "articles/clean.md",
      evidenceMapJson: JSON.stringify(evidenceMap),
    });

  const coverage = await diagnoseWith({
    chapter_counts: { Ezra: 3 },
    chapter_coverage: {
      Ezra: [
        { chapter: 1, status: "covered", evidence_ids: ["ev1"] },
        { chapter: 3, status: "skipped-irrelevant", reason: "Not relevant" },
      ],
    },
    evidence: [{ id: "ev1" }],
  });

  const coverageCodes = codes(at(coverage, "value", "findings"));

  assert.ok(coverageCodes.includes("missing-chapter"));
  assert.ok(!coverageCodes.includes("unresolved-evidence-id"));

  const incomplete = await diagnoseWith({
    chapter_coverage: {
      Ezra: [{ chapter: 1, status: "covered", evidence_ids: ["ev1"] }],
    },
    evidence: [{ id: "ev1" }],
  });

  assert.ok(
    codes(at(incomplete, "value", "findings")).includes(
      "unsupported-chapter-coverage",
    ),
  );

  const malformed = await diagnoseWith({ chapter_coverage: "not-an-object" });

  assert.equal(at(malformed, "value", "status"), "advisory");
  assert.equal(
    at(malformed, "value", "findings", 0, "path"),
    "$.chapter_coverage",
  );

  writeFileSync(join(articles, "broken.outline.json"), "{");

  const broken = await value("academic_writer_diagnose_outline", {
    article: "articles/broken.md",
  });

  assert.equal(get(broken, "status"), "error");
  assert.deepEqual(get(broken, "findings"), []);

  const missing = await value("academic_writer_diagnose_outline", {
    article: "articles/absent.md",
  });

  assert.equal(get(missing, "status"), "error");

  writeFileSync(
    join(articles, "crlf.md"),
    Buffer.from("# Heading\r\nExact\r\nsecond line\r\n"),
  );

  const exact = await value("academic_writer_reverse_outline", {
    article: "articles/crlf.md",
  });

  assert.equal(get(exact, "units", 0, "text"), "Exact\r\nsecond line");
  assert.deepEqual(
    [get(exact, "units", 0, "startLine"), get(exact, "units", 0, "endLine")],
    [2, 3],
  );

  const absent = await value("academic_writer_reverse_outline", {
    article: "articles/absent.md",
  });

  assert.equal(get(absent, "status"), "error");
  assert.deepEqual(get(absent, "units"), []);
  assert.ok(!existsSync(join(articles, "absent.outline.json")));
});
