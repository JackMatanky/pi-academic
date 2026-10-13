import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { Type } from "typebox";
import { test, type TestContext } from "vitest";

import { isValid, parseJsonText, type JsonValue } from "../lib/schema.js";
import { createToolHarness, get, type ToolResult } from "./helpers.js";

const { callTool, definitions } = createToolHarness();

function scratch(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "aw-runtime-"));

  t.onTestFinished(() => rmSync(dir, { recursive: true, force: true }));

  return dir;
}

/**
 * Puts a stub `pandoc` script first on PATH for the rest of the test.
 */
function stubPandoc(t: TestContext, root: string, script: string): string {
  const log = join(root, "pandoc.args");
  const binDir = join(root, "bin");

  mkdirSync(binDir);

  const pandoc = join(binDir, "pandoc");

  writeFileSync(pandoc, script);
  chmodSync(pandoc, 0o755);

  const previous = process.env.PATH;
  const previousLog = process.env.PANDOC_LOG;
  const previousNoOutput = process.env.PANDOC_NO_OUTPUT;

  process.env.PATH = `${binDir}${delimiter}${previous ?? ""}`;
  process.env.PANDOC_LOG = log;
  delete process.env.PANDOC_NO_OUTPUT;

  t.onTestFinished(() => {
    if (previous === undefined) delete process.env.PATH;
    else process.env.PATH = previous;

    if (previousLog === undefined) delete process.env.PANDOC_LOG;
    else process.env.PANDOC_LOG = previousLog;

    if (previousNoOutput === undefined) delete process.env.PANDOC_NO_OUTPUT;
    else process.env.PANDOC_NO_OUTPUT = previousNoOutput;
  });

  return log;
}

function str(value: JsonValue | undefined): string {
  assert.ok(isValid(Type.String(), value), "expected a string");

  return value;
}

function strings(value: JsonValue | undefined): string[] {
  assert.ok(isValid(Type.Array(Type.String()), value), "expected strings");

  return value;
}

const at = (result: ToolResult, ...path: (string | number)[]) =>
  get(result.details, ...path);

const text = (result: ToolResult): string => result.content[0]?.text ?? "";

/**
 * The fixed tool sequence the Python smoke ran in one node process.
 */
async function runTools(root: string) {
  const status = await callTool(root, "academic_writer_status", {});
  const migration = await callTool(root, "academic_writer_migrate_profile", {});
  const health = await callTool(root, "academic_writer_health", {});
  const profile = await callTool(root, "academic_writer_get_profile", {});

  const updated = await callTool(root, "academic_writer_update_profile", {
    fieldsJson: { citationStyle: "mla" },
  });

  const paths = await callTool(root, "academic_writer_article_paths", {
    subject: "Smoke Test: חיבור",
  });

  const files = await callTool(root, "academic_writer_list_project_files", {
    kind: "articles",
  });

  const extracted = await callTool(root, "academic_writer_extract_document", {
    path: "articles/ok.md",
  });

  const resource = await callTool(root, "academic_writer_read_resource", {
    name: "thresholds",
  });

  const audit = await callTool(root, "academic_writer_audit_citations", {
    article: "articles/ok.md",
    citationStyle: "chicago",
  });

  const snapshot = await callTool(root, "academic_writer_snapshot_citations", {
    article: "articles/ok.md",
  });

  const assembled = await callTool(root, "academic_writer_assemble_docx_json", {
    input: "articles/ok.md",
    output: ".academic-writer/runs/ok.docx.json",
    targetLanguage: "English",
  });

  const ingested = await callTool(root, "academic_writer_ingest_sources", {
    paths: [".academic-writer/sources/local.md"],
  });

  return {
    status,
    migration,
    health,
    profile,
    updated,
    paths,
    files,
    extracted,
    resource,
    audit,
    snapshot,
    assembled,
    ingested,
  };
}

test("[test_prose_lint_tool_returns_advisory_findings_and_skips_hebrew] lint tool returns advisory findings and skips Hebrew", async (t) => {
  const article =
    "---\ntitle: Great question\nsummary: Let's dive in.\n---\n\n" +
    "## Introduction\n" +
    "Let's dive in. The archive records payments.\n\n" +
    "The institute stands as a testament to its founders.\n" +
    "It is worth noting that the archive was catalogued in 1924.\n" +
    "Great question. I hope this helps.\n\n" +
    "The author argues through careful analysis.\n\n" +
    "The author argues through close reading.\n\n" +
    "> Let's dive in.\n" +
    "`Let's dive in` and [a link](https://example.test/Lets-dive-in).\n" +
    "```text\nGreat question. I hope this helps.\n```\n" +
    "A supported claim [@smith2020] remains.\n";

  const root = scratch(t);

  const english = await callTool(root, "academic_writer_lint_prose", {
    text: article,
    language: "English",
  });

  const hebrew = await callTool(root, "academic_writer_lint_prose", {
    text: "טקסט בעברית.",
    language: "Hebrew",
  });

  assert.deepEqual(readdirSync(root), []);
  assert.equal(english.details.ok, true);
  assert.equal(english.details.file, "<stdin>");
  assert.equal(english.details.language, "english");
  assert.equal(english.details.status, "advisory");

  const expected: [string, number][] = [
    ["staged-opener", 7],
    ["inflated-significance", 9],
    ["meta-announcement", 10],
    ["chatbot-residue", 11],
    ["repeated-paragraph-opening", 13],
    ["repeated-paragraph-opening", 15],
  ];

  assert.deepEqual(
    expected.map((_, index) => [
      at(english, "findings", index, "id"),
      at(english, "findings", index, "line"),
    ]),
    expected,
  );
  assert.equal(at(english, "findings", 6), undefined);
  assert.deepEqual(at(english, "findings", 4, "relatedLines"), [15]);
  assert.deepEqual(at(english, "findings", 5, "relatedLines"), [13]);
  assert.equal(hebrew.details.skipped, true);
  assert.ok(str(hebrew.details.reason).includes("English only"));
});

function seedProject(root: string): void {
  const helper = join(root, ".academic-writer");

  mkdirSync(join(helper, "runs"), { recursive: true });
  mkdirSync(join(helper, "sources"));
  mkdirSync(join(root, "articles"));
  writeFileSync(
    join(helper, "profile.md"),
    [
      "---",
      "fieldOfStudy: History",
      "---",
      "",
      "## Tools",
      "",
      "```json",
      "{",
      '  "zotero": {',
      '    "enabled": true,',
      '    "mode": "mcp-config",',
      '    "collection": { "key": "COLL1234", "name": "Dissertation" }',
      "  },",
      '  "notebooklm": {',
      '    "enabled": true,',
      '    "mode": "mcp-config",',
      '    "notebook": { "id": "nb-1", "name": "Chapter Notebook" }',
      "  }",
      "}",
      "```",
      "",
    ].join("\n"),
  );
  writeFileSync(join(helper, "thresholds.json"), '{"sentinel": true}\n');
  writeFileSync(
    join(helper, "sources.json"),
    JSON.stringify([{ citeKey: "smith2020" }]),
  );
  writeFileSync(
    join(helper, "bibliography.bib"),
    "@book{smith2020, title={Book}}\n",
  );
  writeFileSync(
    join(helper, "runs", "r1.json"),
    JSON.stringify({ runId: "r1", status: "running", title: "Smoke" }),
  );
  writeFileSync(
    join(helper, "sources", "local.md"),
    "# Local Source 2024\n\nSource text.",
  );
  writeFileSync(join(root, "articles", "ok.md"), "Text [@smith2020, p. 4].");
}

test("citation audit tool distinguishes passed, failed and operational error", async (t) => {
  const root = scratch(t);
  seedProject(root);

  const run = (article: string) =>
    callTool(root, "academic_writer_audit_citations", {
      article,
      citationStyle: "chicago",
    });

  const passed = await run("articles/ok.md");
  assert.equal(passed.details.status, "passed");
  assert.equal(passed.isError, false);

  writeFileSync(join(root, "articles", "ok.md"), "[@ghost]");
  const failed = await run("articles/ok.md");
  assert.equal(failed.details.status, "failed");
  assert.deepEqual(failed.details.missingFromSources, ["ghost"]);
  assert.equal(failed.isError, true);

  const error = await run("articles/missing.md");
  assert.equal(error.details.status, "error");
  assert.match(text(error), /Article not found/);
  assert.equal(error.isError, true);
});

test("[test_package_tools_run_against_project_state] package tools run against project state", async (t) => {
  const root = scratch(t);

  seedProject(root);

  const data = await runTools(root);
  const names = [...definitions.keys()];

  for (const name of [
    "academic_writer_status",
    "academic_writer_read_resource",
    "academic_writer_lint_prose",
    "academic_writer_ingest_sources",
    "academic_writer_snapshot_citations",
    "academic_writer_assemble_docx_json",
    "academic_writer_migrate_profile",
    "academic_writer_write_research_notes",
    "academic_writer_review_research_notes",
    "academic_writer_write_outline",
    "academic_writer_render_outline",
    "academic_writer_snapshot_notes",
    "academic_writer_query_research",
    "academic_writer_migrate_article_outline",
  ]) {
    assert.ok(names.includes(name), `${name} is not registered`);
  }

  assert.ok(!names.includes("academic_writer_write_evidence_ownership"));
  assert.equal(data.status.details.ok, true);
  assert.equal(at(data.status, "sources", "count"), 1);
  assert.equal(at(data.status, "sourceDocuments", "count"), 1);
  assert.equal(at(data.status, "articles", "count"), 1);
  assert.equal(at(data.status, "runs", "active", 0, "runId"), "r1");
  assert.ok(strings(at(data.status, "agents")).includes("auditor.md"));
  assert.equal(
    at(data.status, "tools", "zotero", "collection", "key"),
    "COLL1234",
  );
  assert.ok(text(data.status).includes("Zotero scope: Dissertation"));
  assert.ok(text(data.status).includes("NotebookLM scope: Chapter Notebook"));
  assert.equal(data.migration.details.migrated, false);
  assert.equal(data.migration.details.reason, "profile already exists");
  assert.ok(Object.keys(at(data.health, "commands") ?? {}).length > 0);
  assert.equal(at(data.profile, "profile", "fieldOfStudy"), "History");
  assert.equal(at(data.updated, "profile", "citationStyle"), "mla");
  assert.equal(data.paths.details.markdown, "articles/smoke-test-חיבור.md");
  assert.equal(
    data.paths.details.sources,
    "articles/smoke-test-חיבור.sources.json",
  );
  assert.equal(at(data.files, "files", 0, "path"), "articles/ok.md");
  assert.equal(text(data.extracted), "Text [@smith2020, p. 4].");
  assert.equal(data.resource.details.source, "project");
  assert.deepEqual(parseJsonText(text(data.resource)), { sentinel: true });
  assert.equal(at(data.ingested, "sources", 0, "sourceType"), "local-file");
  assert.equal(data.audit.details.status, "passed");
  assert.deepEqual(data.audit.details.citationKeys, ["smith2020"]);
  assert.equal(data.snapshot.details.ok, true);
  assert.equal(data.snapshot.details.sources, "articles/ok.sources.json");
  assert.equal(data.assembled.details.ok, true);
  assert.equal(data.assembled.details.sections, 1);
  assert.equal(data.ingested.details.count, 1);
});

const EXPORT_STUB =
  '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$PANDOC_LOG"\nif [ "${PANDOC_NO_OUTPUT:-0}" != "1" ]; then\n  while [ "$#" -gt 1 ]; do\n    if [ "$1" = "-o" ]; then shift; : > "$1"; break; fi\n    shift\n  done\nfi\nexit 0\n';

test("[test_export_passes_citeproc_options_to_pandoc] export passes citeproc options to pandoc", async (t) => {
  const root = scratch(t);
  const helper = join(root, ".academic-writer");

  mkdirSync(helper);
  mkdirSync(join(root, "articles"));
  writeFileSync(join(root, "articles", "ok.md"), "Text [@smith2020].");
  writeFileSync(
    join(helper, "sources.json"),
    JSON.stringify([{ citeKey: "smith2020" }]),
  );
  writeFileSync(
    join(helper, "bibliography.bib"),
    "@book{smith2020, title={Book}}\n",
  );
  writeFileSync(
    join(root, "articles", "ok.sources.json"),
    JSON.stringify([{ citeKey: "smith2020" }]),
  );
  writeFileSync(
    join(root, "articles", "ok.bibliography.bib"),
    "@book{smith2020, title={Local Book}}\n",
  );

  const log = stubPandoc(t, root, EXPORT_STUB);

  const params = {
    article: "articles/ok.md",
    citationStyle: "chicago",
    formats: ["docx"],
    csl: "style.csl",
    bibliography: ".academic-writer/bibliography.bib",
  };

  const data = await callTool(root, "academic_writer_export_article", params);
  const args = readFileSync(log, "utf8").split("\n").slice(0, -1);
  const output = str(at(data, "results", 0, "output"));

  assert.equal(at(data, "results", 0, "ok"), true);
  assert.notEqual(data.isError, true);
  assert.ok(existsSync(join(root, output)));
  assert.ok(args.includes("--citeproc"));
  assert.ok(args.includes("--fail-if-warnings"));
  assert.ok(args.includes("--bibliography=articles/ok.bibliography.bib"));
  assert.equal(data.details.bibliography, "articles/ok.bibliography.bib");
  assert.ok(args.includes("--csl=style.csl"));

  unlinkSync(join(root, output));
  process.env.PANDOC_NO_OUTPUT = "1";

  const missing = await callTool(
    root,
    "academic_writer_export_article",
    params,
  );

  assert.equal(missing.details.ok, false);
  assert.equal(at(missing, "results", 0, "ok"), false);
  assert.equal(missing.isError, true);
  assert.ok(str(at(missing, "results", 0, "error")).includes("did not create"));
});

test("[test_docx_extraction_prefers_pandoc_citations] docx extraction prefers pandoc citations", async (t) => {
  const root = scratch(t);

  writeFileSync(join(root, "doc.docx"), "fake docx; pandoc stub handles it");

  const log = stubPandoc(
    t,
    root,
    "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$PANDOC_LOG\"\necho 'Text [@smith2020].'\n",
  );

  const data = await callTool(root, "academic_writer_extract_document", {
    path: "doc.docx",
  });

  const args = readFileSync(log, "utf8").split("\n");

  assert.equal(text(data), "Text [@smith2020].");
  assert.deepEqual(args.slice(0, 4), [
    "-f",
    "docx+citations",
    "-t",
    "markdown",
  ]);
});

test("[test_migrates_json_profile] migrates a JSON profile", async (t) => {
  const root = scratch(t);
  const profileDir = join(root, ".academic-writer");

  mkdirSync(profileDir);
  mkdirSync(join(root, "articles"));
  writeFileSync(join(root, "articles", "ok.md"), "Text [@smith2020, p. 4].");
  writeFileSync(
    join(profileDir, "profile.json"),
    JSON.stringify({
      fieldOfStudy: "Literature",
      citationStyle: "apa",
      abstractLanguages: ["English", "Hebrew"],
      tools: { zotero: { enabled: true, mode: "local" } },
    }),
  );

  const data = await runTools(root);

  assert.equal(data.migration.details.ok, true);
  assert.equal(data.migration.details.migrated, true);
  assert.equal(at(data.profile, "profile", "fieldOfStudy"), "Literature");
  assert.equal(at(data.profile, "profile", "citationStyle"), "apa");
});
