import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Type } from "typebox";
import { test } from "vitest";

import { isValid, parseJsonText } from "../lib/schema.js";
import { resolveResourcePath } from "../pi-academic-writer/core/resources.js";
import {
  createToolHarness,
  get,
  parseFrontmatter,
  readRepo,
  repoRoot,
} from "./helpers.js";

const isFile = (rel: string): boolean => {
  const path = join(repoRoot, rel);

  return existsSync(path) && statSync(path).isFile();
};

test("[test_skills_frontmatter] every skill has valid frontmatter and the expected set exists", () => {
  const skillsDir = join(repoRoot, "skills");

  assert.ok(existsSync(skillsDir));

  const names = new Set<string>();

  for (const dir of readdirSync(skillsDir)) {
    const rel = `skills/${dir}/SKILL.md`;

    if (!isFile(rel)) continue;

    const { frontmatter, body } = parseFrontmatter(rel);

    assert.ok(frontmatter, `Missing frontmatter in ${rel}`);
    assert.ok("name" in frontmatter);

    const name = get(frontmatter, "name");

    assert.equal(
      name,
      dir,
      `Skill name ${String(name)} does not match directory ${dir}`,
    );
    assert.ok("description" in frontmatter);
    assert.ok(!("user-invocable" in frontmatter));
    assert.ok(!("agents" in frontmatter));
    assert.ok(isValid(Type.String(), name));
    assert.ok(!names.has(name), `Duplicate skill name ${name}`);
    names.add(name);
    assert.ok(body.trim().length > 50, `Body too short in ${rel}`);
  }

  assert.deepEqual(
    [...names].sort(),
    [
      "academic-write",
      "academic-import",
      "academic-research",
      "academic-edit",
      "academic-review",
      "academic-setup",
      "academic-voice",
      "academic-feedback",
      "academic-health",
      "academic-export",
      "academic-present",
      "academic-help",
    ].sort(),
  );
});

test("[test_agents_frontmatter] every agent has valid frontmatter, comma-separated tools and Input/Output sections", () => {
  const expectedAgents = [
    "academic.md",
    "editor.md",
    "researcher.md",
    "writer.md",
  ];

  assert.ok(existsSync(join(repoRoot, "agents")));

  for (const agentFile of expectedAgents) {
    const rel = `agents/${agentFile}`;

    assert.ok(isFile(rel), `Missing agent ${agentFile}`);

    const { frontmatter, body } = parseFrontmatter(rel);

    assert.ok(frontmatter, `Missing frontmatter in ${rel}`);
    assert.ok(
      !("model" in frontmatter),
      `Model key should be dropped in ${rel}`,
    );

    if ("tools" in frontmatter) {
      const toolsValue = get(frontmatter, "tools");

      assert.ok(
        isValid(Type.String(), toolsValue),
        `tools must be a scalar string in ${rel}`,
      );

      // pi-subagents splits `tools:` only on commas; a space-separated list
      // parses as one malformed tool name and silently breaks the allowlist.
      const tools = toolsValue.split(",").map((tool) => tool.trim());

      assert.ok(tools.length > 0, `Empty tools list in ${rel}`);

      for (const tool of tools) {
        assert.ok(
          !tool.includes(" "),
          `tools entry '${tool}' contains a space in ${rel} — tools: must be comma-separated, not space-separated`,
        );

        if (tool.startsWith("mcp:")) {
          assert.ok(
            !tool.includes("__"),
            `invalid mcp tool grant '${tool}' in ${rel} — use mcp:<server> or mcp:<server>/<tool>`,
          );

          continue;
        }

        assert.ok(
          (tool === tool.toLowerCase() && tool !== tool.toUpperCase()) ||
            tool === "subagent",
          `Invalid tool format ${tool} in ${rel}`,
        );
      }
    }

    assert.ok(body.includes("## Input"), `Missing Input section in ${rel}`);
    assert.ok(body.includes("## Output"), `Missing Output section in ${rel}`);
  }
});

test("[test_extensions_valid] extensions keep strict TypeScript and export a default factory", () => {
  const tsconfig = parseJsonText(readRepo("extensions/tsconfig.json"));

  assert.equal(
    get(tsconfig, "compilerOptions", "strict"),
    true,
    "extensions/tsconfig.json must keep strict TypeScript enabled",
  );

  for (const dir of readdirSync(join(repoRoot, "extensions"))) {
    const rel = `extensions/${dir}/index.ts`;

    if (isFile(rel)) {
      assert.ok(
        readRepo(rel).includes("export default function"),
        `Missing export default function in ${rel}`,
      );
    }
  }
});

test("[test_thresholds_resource_honors_project_override] read_resource prefers the project's thresholds.json", async (t) => {
  const { callTool } = createToolHarness();
  const root = mkdtempSync(join(tmpdir(), "aw-thresholds-"));

  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  const packaged = await callTool(root, "academic_writer_read_resource", {
    name: "thresholds",
  });

  assert.ok(packaged.content[0]?.text.includes("antiAi"));

  mkdirSync(join(root, ".academic-writer"));
  writeFileSync(
    join(root, ".academic-writer", "thresholds.json"),
    '{"marker": true}\n',
  );

  const overridden = await callTool(root, "academic_writer_read_resource", {
    name: "thresholds",
  });

  assert.ok(overridden.content[0]?.text.includes('"marker"'));
});

const PACKAGED_RESOURCES = {
  voice_profile_load: "skills/academic-write/references/voice-profile-load.md",
  voice_profile_template: "templates/voice/profile.md",
  run_state_contract: "skills/academic-write/references/run-state-contract.md",
  citation_export_contract:
    "skills/academic-write/references/citation-export-contract.md",
  pandoc_citation_syntax:
    "skills/academic-write/references/pandoc-citation-syntax.md",
  article_metadata: "skills/academic-write/references/article-metadata.md",
  citation_review_gate:
    "skills/academic-review/references/citation-review-gate.md",
  dispatch_contract: "skills/academic-write/references/dispatch-contract.md",
};

test("[test_packaged_prompt_resources_exist] packaged prompt resources resolve to existing files", (t) => {
  const root = mkdtempSync(join(tmpdir(), "aw-resources-"));

  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  for (const [resource, path] of Object.entries(PACKAGED_RESOURCES)) {
    assert.ok(isFile(path), `missing resource file for ${resource}`);
    assert.ok(
      existsSync(resolveResourcePath(resource, root)),
      `resource ${resource} does not resolve to an existing file`,
    );
  }
});

test("[test_pandoc_filters_exist] every shipped Lua filter is passed to Pandoc by the extension", () => {
  const shipped = readdirSync(join(repoRoot, "extensions", "pandoc")).sort();

  assert.deepEqual(shipped, [
    "note-refs.lua",
    "strip-highlight.lua",
    "unwrap-link-underline.lua",
  ]);

  const users = [
    "extensions/pi-academic-writer/article/docx-import.ts",
    "extensions/pi-academic-writer/core/pandoc.ts",
  ]
    .map(readRepo)
    .join("\n");

  for (const name of shipped) {
    assert.ok(users.includes(`"${name}"`), `${name} is not used`);
  }
});

test("[test_no_bundled_mcp_json] no .mcp.json ships with the package", () => {
  assert.ok(
    !isFile(".mcp.json"),
    ".mcp.json should be user/project config, not a package source file",
  );
});

test("[test_lifecycle_does_not_mount_mcp_adapter] lifecycle does not mount the MCP adapter", () => {
  assert.ok(isFile("extensions/lifecycle/index.ts"));

  const content = readRepo("extensions/lifecycle/index.ts");

  assert.ok(
    !content.includes("pi-mcp-adapter"),
    "lifecycle must not mount pi-mcp-adapter; Pi loads the package dependency directly",
  );
  assert.ok(
    !content.includes("mcpExtension("),
    "lifecycle must not register MCP tools/flags that conflict with pi-mcp-adapter",
  );
  assert.ok(
    !content.includes("createMcpAdapter({"),
    "programmatic config is isolated and would ignore .mcp.json/global MCP config",
  );
});

test("[test_no_bundled_mcp_server_dir] no bundled mcp/ server directory", () => {
  assert.ok(
    !existsSync(join(repoRoot, "mcp")),
    "mcp/ should not exist — model choice is a pi setting, not a bundled MCP server (see AGENTS.md)",
  );
});
