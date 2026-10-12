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
