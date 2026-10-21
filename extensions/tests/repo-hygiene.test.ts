import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { test } from "vitest";

import { createToolHarness, readRepo, repoFiles, repoRoot } from "./helpers.js";

// Forbidden words are assembled from fragments so that this scan, which also
// covers extensions/tests, does not match its own source.
const STALE = "leg" + "acy";

const HELPER = "academic" + "-helper";

const ROOT_ENV = "PI_ACADEMIC" + "_ROOT";

const ENV_INJECT = "env" + "-inject";

const isDir = (rel: string): boolean => {
  const path = join(repoRoot, rel);

  return existsSync(path) && statSync(path).isDirectory();
};

const filesUnder = (dirs: string[], suffixes: string[]): string[] =>
  dirs.filter(isDir).flatMap((dir) => repoFiles(dir, suffixes));

test("[test_no_pi_academic_root_env_contract] package assets are exposed through tools, not environment injection", () => {
  assert.ok(
    !existsSync(join(repoRoot, "extensions", ENV_INJECT, "index.ts")),
    `${ENV_INJECT} must not reintroduce global ${ROOT_ENV} mutation`,
  );
  assert.ok(
    existsSync(join(repoRoot, "extensions/pi-academic/index.ts")),
    "pi-academic extension missing",
  );

  const { definitions } = createToolHarness();

  for (const name of [
    "pi_academic_read_resource",
    "pi_academic_resolve_csl",
    "pi_academic_generate_docx",
    "pi_academic_list_agents",
    "pi_academic_fix_typography",
    "pi_academic_status",
    "pi_academic_lint_prose",
    "pi_academic_migrate_profile",
    "pi_academic_diagnose_outline",
    "pi_academic_reverse_outline",
  ]) {
    assert.ok(definitions.has(name), `${name} is not registered`);
  }

  assert.ok(
    readRepo("agents/academic.md").includes("pi_academic_diagnose_outline"),
  );

  for (const path of [
    "skills/academic-write/SKILL.md",
    "skills/academic-edit/SKILL.md",
  ]) {
    assert.ok(readRepo(path).includes("pi_academic_diagnose_outline"), path);
  }

  assert.ok(
    readRepo("agents/editor.md").includes("pi_academic_reverse_outline"),
  );
  assert.ok(
    readRepo("skills/academic-review/SKILL.md").includes(
      "pi_academic_reverse_outline",
    ),
  );

  const forbidden = [ROOT_ENV, `extensions/${ENV_INJECT}`];

  const paths = [
    ...["AGENTS.md", "README.md"].filter((file) =>
      existsSync(join(repoRoot, file)),
    ),
    ...filesUnder(["skills", "agents", "extensions", "tests"], [".md", ".ts"]),
  ];

  for (const path of paths) {
    const content = readRepo(path);

    for (const marker of forbidden)
      assert.ok(!content.includes(marker), `${path} contains ${marker}`);
  }
});

test("[test_no_academic_helper_references] no stale product or wording references anywhere in the repo", () => {
  const files = repoFiles(".", [
    ".md",
    ".ts",
    ".json",
    ".yml",
    ".yaml",
    ".toml",
    ".gitignore",
    ".prettierignore",
  ]);

  for (const file of files) {
    const content = readRepo(file);

    assert.ok(!content.includes(HELPER), `${file} contains ${HELPER}`);
    assert.equal(
      new RegExp(STALE, "i").exec(content),
      null,
      `${file} contains the forbidden stale-word pattern`,
    );
  }
});

test("[test_no_engine_choice_plumbing] no engine-choice or bundled second-model tool references", () => {
  const gemini = "gem" + "ini";

  const pattern = new RegExp(
    [
      `${gemini}Fallback`,
      `${gemini}Mode`,
      "compare" + "-models",
      `${gemini}_write_section`,
      `${gemini}_synthesize`,
      `${gemini}_edit`,
      `${gemini}_calibrate_sample`,
      `${gemini}_raw`,
    ].join("|"),
    "gi",
  );

  for (const file of filesUnder(
    ["skills", "agents", "extensions"],
    [".md", ".ts"],
  )) {
    const matches = readRepo(file).match(pattern) ?? [];

    assert.deepEqual(
      matches,
      [],
      `Found engine-choice/bundled-second-model tool reference in ${file}: ${matches}`,
    );
  }
});

test("[test_no_candlekeep] no catalogue-tool references beyond the known migration sentence", () => {
  const candle = "candle" + "keep";
  const ck = "c" + "k";

  const pattern = new RegExp(
    `${candle}|${ck} items|${ck} auth|${ck} books|command -v ${ck}\\b|voice` +
      "-sync",
    "gi",
  );

  // Only this exact sentence in the profile-schema migration may name the old
  // key, and only up to its own three occurrences.
  const migrationSentence = new RegExp(
    `contains a \`${candle}\` key but no \`zotero\` key.*?old ${candle}\\.enabled`,
    "gi",
  );

  // This file's own provenance tag, `[test_no_candlekeep]`, names the word.
  const files = filesUnder(
    ["skills", "agents", "extensions"],
    [".md", ".ts"],
  ).filter((file) => file !== "extensions/tests/repo-hygiene.test.ts");

  for (const file of files) {
    const content = readRepo(file);
    const matches = content.match(pattern) ?? [];
    const exempt = (content.match(migrationSentence) ?? []).length * 3;

    assert.ok(
      matches.length - exempt <= 0,
      `Found ${candle} reference in ${file}: ${matches}`,
    );
  }
});

test("[test_no_old_slash_command_form] no stale plugin-router slash commands in skills or agents", () => {
  const pattern = new RegExp("/academic-writer" + ":[a-zA-Z0-9_-]+", "g");

  for (const file of filesUnder(["skills", "agents"], [".md"])) {
    const matches = readRepo(file).match(pattern) ?? [];

    assert.deepEqual(
      matches,
      [],
      `Found stale slash command in ${file}: ${matches}`,
    );
  }
});

test("[test_no_claude_code_runtime_mentions] no Claude-specific runtime instructions in skills or agents", () => {
  const marker = "Claude " + "Code";

  for (const file of filesUnder(["skills", "agents"], [".md"])) {
    assert.ok(
      !readRepo(file).includes(marker),
      `Found stale '${marker}' runtime reference in ${file}`,
    );
  }
});

test("[test_no_removed_zotero_add_tool_names] no Zotero tools removed upstream are named", () => {
  const pattern = new RegExp(
    [
      "zotero_add_by_doi",
      "zotero_add_from_file",
      "zotero_add_by_url",
      "zotero_add_by_isbn",
      "zotero_add_by_bibtex",
      "zotero_add_by_csl_json",
    ].join("|"),
    "g",
  );

  const paths = [
    "README.md",
    "AGENTS.md",
    ...filesUnder(["skills", "agents", "docs"], [".md"]),
  ];

  for (const path of paths) {
    const matches = readRepo(path).match(pattern) ?? [];

    assert.deepEqual(
      matches,
      [],
      `Found zotero-mcp tool removed upstream in 0.9.0 in ${path}: ${matches}`,
    );
  }
});
