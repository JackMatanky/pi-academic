import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { test } from "vitest";

import { parseJsonText } from "../lib/schema.js";
import { readRepo, repoFiles, repoRoot } from "./helpers.js";

const isFile = (rel: string): boolean => {
  const path = join(repoRoot, rel);

  return existsSync(path) && statSync(path).isFile();
};

test("[test_voice_artifacts_under_academic_writer] voice artifacts live under .academic-writer/voice/", () => {
  const voiceTools = readRepo("extensions/pi-academic-writer/tools/voice.ts");

  assert.ok(voiceTools.includes(".academic-writer/voice/profile.md"));
  assert.ok(
    !voiceTools.includes(".voice/"),
    "voice paths must not use .voice/",
  );
});

test("[test_fixture_voice_profile_location] the e2e fixture voice profile sits in .academic-writer/voice/", () => {
  assert.ok(
    isFile("tests/e2e/fixture-project/.academic-writer/voice/profile.md"),
  );
});

test("[test_no_voice_state_in_package] the package repo keeps no voice state at its root", () => {
  assert.ok(!isFile("AUTHOR_VOICE.md"));
  assert.ok(!existsSync(join(repoRoot, ".voice")));
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
