import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { parseJsonText } from "../lib/schema.js";
import { readRepo, repoFiles, repoRoot } from "./helpers.js";

const isFile = (rel: string): boolean => {
  const path = join(repoRoot, rel);

  return existsSync(path) && statSync(path).isFile();
};

test("[test_author_voice_at_root_exists] AUTHOR_VOICE.md sits at the repo root", () => {
  assert.ok(isFile("AUTHOR_VOICE.md"));
});

test("[test_voice_dir_exists] .voice/ exists and is kept by .gitkeep", () => {
  assert.ok(statSync(join(repoRoot, ".voice")).isDirectory());
  assert.ok(isFile(".voice/.gitkeep"));
});

test("[test_voice_artifacts_gitignored] voice artifacts are gitignored except .gitkeep", () => {
  const gitignore = readRepo(".gitignore");

  assert.ok(gitignore.includes(".voice/*"));
  assert.ok(gitignore.includes("!.voice/.gitkeep"));
});

/**
 * The body of a `[table]` in a TOML file, up to the next table header.
 */
function tomlTable(text: string, name: string): string {
  const start = text.indexOf(`[${name}]`);

  assert.notEqual(start, -1, `mise.toml has no [${name}] table`);

  const body = text.slice(start + name.length + 2);
  const next = body.search(/^\[/m);

  return next === -1 ? body : body.slice(0, next);
}

test("[test_mise_tasks_cover_format_lint_and_hk] mise tasks cover format, lint and hk", () => {
  const text = readRepo("mise.toml");
  const tools = tomlTable(text, "tools");

  assert.match(tools, /^hk\s*=/m);
  assert.match(tools, /^taplo\s*=/m);

  for (const task of ["fmt", "fmt-check", "lint", "ci", "install-hooks"])
    assert.ok(text.includes(`[tasks.${task}]`), `missing task ${task}`);

  const lint = tomlTable(text, "tasks.lint");

  assert.ok(lint.includes("npm run typecheck"));
  assert.ok(lint.includes("fmt-check"));
  assert.match(
    tomlTable(text, "tasks.install-hooks"),
    /^run\s*=\s*"hk install"\s*$/m,
  );

  const depends = /^depends\s*=\s*\[([^\]]*)\]/m.exec(
    tomlTable(text, "tasks.ci"),
  );

  assert.ok(depends, "[tasks.ci] has no depends array");
  assert.ok(depends[1]?.includes('"lint"'));
  assert.ok(depends[1]?.includes('"test"'));
});

test("[test_hk_runs_before_commit_and_push] hk runs fmt/lint before commit and ci before push", () => {
  const content = readRepo("hk.pkl");

  assert.ok(content.includes("github.com/jdx/hk"));
  assert.ok(content.includes('["pre-commit"]'));
  assert.ok(content.includes('["pre-push"]'));
  assert.ok(content.includes("mise run fmt"));
  assert.ok(content.includes("mise run lint"));
  assert.ok(content.includes("mise run ci"));
});

test("[test_json_validity] every committed JSON file parses", () => {
  for (const file of repoFiles(".", [".json"])) {
    assert.doesNotThrow(
      () => parseJsonText(readRepo(file)),
      `Invalid JSON in ${file}`,
    );
  }
});

test("[test_csl_styles_are_downloaded_not_bundled] no CSL file is bundled in the package", () => {
  assert.deepEqual(
    repoFiles(".", [".csl"]),
    [],
    "CSL files should be downloaded into .academic-writer/csl/, not bundled in the package",
  );
});
