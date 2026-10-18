import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, type TestContext } from "vitest";

import { fail, ToolFailure } from "../pi-academic-writer/core/tool-kit.js";
import { createToolHarness } from "./helpers.js";

const CORE_TOOLS = [
  "academic_writer_get_profile",
  "academic_writer_status",
  "academic_writer_query_research",
  "academic_writer_audit_citations",
  "academic_writer_read_resource",
  "academic_writer_article_paths",
  "academic_writer_proofread",
];

function scratch(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "aw-kit-"));

  t.onTestFinished(() => rmSync(dir, { recursive: true, force: true }));

  return dir;
}

test("fail exposes structured diagnostics in the error message and retains cause", () => {
  const original = new Error("root cause");
  assert.throws(
    () =>
      fail(
        "request failed",
        { diagnostics: "missing source" },
        { cause: original },
      ),
    (cause: unknown) => {
      assert.ok(cause instanceof ToolFailure);
      assert.match(cause.message, /"diagnostics":"missing source"/);
      assert.equal(cause.details.diagnostics, "missing source");
      assert.equal(cause.details.ok, false);
      assert.equal(cause.cause, original);

      return true;
    },
  );
});

test("every tool declares an approval tier and exactly the seven core tools are essential", () => {
  const { definitions } = createToolHarness();

  assert.equal(definitions.size, 40);

  for (const [name, definition] of definitions)
    assert.ok(definition.approval, `${name} has no approval`);

  const approval = (name: string, args = {}) =>
    definitions.get(name)?.approval?.(args);

  assert.equal(approval("academic_writer_get_profile"), "read");
  assert.equal(approval("academic_writer_export_article"), "exec");
  assert.equal(approval("academic_writer_write_outline"), "write");
  assert.equal(
    approval("academic_writer_style_package", { action: "list" }),
    "read",
  );
  assert.equal(
    approval("academic_writer_style_package", { action: "install-starter" }),
    "write",
  );
  assert.equal(
    approval("academic_writer_style_package", { action: "bogus" }),
    "write",
  );

  const essential = [...definitions.values()]
    .flatMap((definition) =>
      definition.loadMode === "essential" ? [definition.name] : [],
    )
    .sort();

  assert.deepEqual(essential, [...CORE_TOOLS].sort());
});

test("string choices in tool schemas are plain enums, not anyOf unions", () => {
  const { definitions } = createToolHarness();

  const schemaOf = (name: string) =>
    JSON.stringify(definitions.get(name)?.parameters);

  assert.match(
    schemaOf("academic_writer_export_article"),
    /"pdfEngine":\{[^}]*"enum":\["xelatex","tectonic"\]/,
  );
  assert.match(
    schemaOf("academic_writer_style_package"),
    /"enum":\["list","install-starter","validate"\]/,
  );
  assert.match(
    schemaOf("academic_writer_review_research_notes"),
    /"enum":\["unchecked","verified"\]/,
  );
  assert.match(
    schemaOf("academic_writer_query_research"),
    /"enum":\["section_bundle","note_by_id","notes_by_source","notes_by_tag","outline_summary"\]/,
  );

  for (const name of [
    "academic_writer_style_package",
    "academic_writer_review_research_notes",
    "academic_writer_query_research",
  ])
    assert.ok(!schemaOf(name).includes("anyOf"), `${name} uses anyOf`);
});

test("on omp the status reports the harness and MCP names resolve from all tools", async (t) => {
  const root = scratch(t);

  const { callTool } = createToolHarness({
    zod: true,
    allTools: ["mcp__zotero_get_recent"],
    activeTools: [],
  });

  const status = await callTool(root, "academic_writer_status", {});

  assert.equal(status.details.harness, "omp");
  assert.equal(status.content[0]?.text.split("\n")[0], "Harness: omp");

  const resolved = await callTool(root, "academic_writer_resolve_mcp_tool", {
    logical_name: "zotero_get_recent",
  });

  assert.equal(resolved.details.live_name, "mcp__zotero_get_recent");
});

test("on pi the status reports the harness and MCP names resolve from active tools", async (t) => {
  const root = scratch(t);

  const { callTool } = createToolHarness({
    activeTools: ["zotero_get_recent"],
    allTools: ["mcp__zotero_get_recent"],
  });

  const status = await callTool(root, "academic_writer_status", {});

  assert.equal(status.details.harness, "pi");
  assert.equal(status.content[0]?.text.split("\n")[0], "Harness: pi");

  const resolved = await callTool(root, "academic_writer_resolve_mcp_tool", {
    logical_name: "zotero_get_recent",
  });

  assert.equal(resolved.details.live_name, "zotero_get_recent");
});
