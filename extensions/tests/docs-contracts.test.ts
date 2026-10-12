import assert from "node:assert/strict";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { createToolHarness, readRepo, repoRoot } from "./helpers.js";

const isFile = (rel: string): boolean => {
  const path = join(repoRoot, rel);

  return existsSync(path) && statSync(path).isFile();
};

const skillNames = (): string[] =>
  readdirSync(join(repoRoot, "skills")).filter((name) =>
    isFile(`skills/${name}/SKILL.md`),
  );

test("[test_citation_audit_is_wired_into_output_paths] citation audit ships in TypeScript and output skills use it", () => {
  assert.ok(
    isFile("extensions/pi-academic-writer/citation-audit.ts"),
    "citation audit must ship as TypeScript",
  );

  for (const skill of [
    "skills/academic-write/SKILL.md",
    "skills/academic-edit/SKILL.md",
    "skills/academic-export/SKILL.md",
    "skills/academic-review/SKILL.md",
  ]) {
    const content = readRepo(skill);

    assert.ok(content.includes("academic_writer_audit_citations"), skill);
    assert.ok(content.includes("run_state_contract"), skill);
  }
});

test("[test_profile_migration_is_tool_backed] profile migration is a registered tool, not an inline script", () => {
  const { definitions } = createToolHarness();

  const schema = readRepo("skills/academic-setup/references/profile-schema.md");

  const setup = readRepo("skills/academic-setup/SKILL.md");
  const heredoc = "python3 << 'PYTHON'";

  assert.ok(definitions.has("academic_writer_migrate_profile"));
  assert.ok(setup.includes("academic_writer_migrate_profile"));
  assert.ok(!schema.includes(heredoc));
  assert.ok(!setup.includes(heredoc));
});

test("[test_docs_require_direct_mcp_tools] docs require direct MCP tool wiring", () => {
  const docs = [
    "AGENTS.md",
    "README.md",
    "skills/academic-setup/references/integration-setup.md",
    "skills/academic-setup/SKILL.md",
  ]
    .map(readRepo)
    .join("\n");

  for (const needle of [
    "toolPrefix",
    "directTools",
    "zotero_get_recent",
    "notebook_list",
    "notebooklm-mcp",
    ".mcp.json",
    "tools.zotero.collection",
    "tools.notebooklm.notebook",
  ])
    assert.ok(docs.includes(needle), `docs do not mention ${needle}`);
});

test("[test_slash_commands] every skill's slash command is documented in README or AGENTS", () => {
  const readme = isFile("README.md") ? readRepo("README.md") : "";
  const agentsMd = isFile("AGENTS.md") ? readRepo("AGENTS.md") : "";

  for (const name of skillNames()) {
    const command = `/skill:${name}`;

    assert.ok(
      readme.includes(command) || agentsMd.includes(command),
      `Command ${command} missing in README.md/AGENTS.md`,
    );
  }
});

test("[test_pdf_export_uses_health_and_wrapper_tools] PDF export goes through health and the export wrapper", () => {
  const exportSkill = readRepo("skills/academic-export/SKILL.md");
  const healthSkill = readRepo("skills/academic-health/SKILL.md");
  const readme = readRepo("README.md");

  assert.ok(exportSkill.includes("academic_writer_health"));
  assert.ok(exportSkill.includes("academic_writer_export_article"));
  assert.ok(healthSkill.includes("academic_writer_health"));
  assert.ok(readme.includes("brew install tectonic"));
});

test("[test_cross_references] the help skill mentions every skill", () => {
  assert.ok(isFile("skills/academic-help/SKILL.md"));

  const helpBody = readRepo("skills/academic-help/SKILL.md");

  for (const name of skillNames())
    assert.ok(
      helpBody.includes(name),
      `Help skill missing reference to ${name}`,
    );
});

test("[test_research_skill_zotero_search_guidance] research skill gives current Zotero search guidance", () => {
  const content = readRepo("skills/academic-research/SKILL.md");

  assert.ok(
    !content.includes("cannot accept a collection filter"),
    "zotero_search_items accepts collection_key natively — drop the hedge",
  );
  assert.ok(
    content.includes("collection_key=COLLECTION_KEY"),
    "collection scope must be passed as collection_key",
  );
  assert.ok(
    content.includes("zotero-mcp-server[semantic]"),
    "zotero_semantic_search needs the optional [semantic] extra documented",
  );
  assert.ok(
    content.includes("zotero_get_search_database_status"),
    "semantic search readiness must be checked before it is recommended",
  );
  assert.ok(
    !content.includes("Vectorless RAG"),
    "'not active' note contradicts the same skill offering zotero_semantic_search",
  );
});

test("[test_agents_md_whole_server_grant_includes_write_tools] AGENTS.md documents that a whole-server Zotero grant includes write tools", () => {
  const content = readRepo("AGENTS.md");

  assert.ok(
    content.includes("mcp:zotero/"),
    "AGENTS.md must document the per-tool read-only grant form",
  );
  assert.ok(
    content.includes("write tools"),
    "AGENTS.md must warn that mcp:zotero exposes upstream write tools",
  );
});
