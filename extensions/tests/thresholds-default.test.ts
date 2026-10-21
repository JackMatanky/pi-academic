import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, type TestContext } from "vitest";

import { parseJsonText } from "../lib/schema.js";
import { loadResource } from "../pi-academic/core/resources.js";
import {
  THRESHOLDS_DEFAULT,
  thresholdsDefaultJson,
} from "../pi-academic/core/thresholds-default.js";
import { createToolHarness } from "./helpers.js";

const { callTool } = createToolHarness();

function scratch(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "aw-thresholds-default-"));

  t.onTestFinished(() => rmSync(dir, { recursive: true, force: true }));

  return dir;
}

test("[test_thresholds_default_shape] the shipped default carries every gate", () => {
  assert.equal(THRESHOLDS_DEFAULT.antiAi.passThreshold, 35);
  assert.equal(THRESHOLDS_DEFAULT.selfReview.passThreshold, 40);
  assert.equal(THRESHOLDS_DEFAULT.rewriteCycles.max, 3);
  assert.equal(THRESHOLDS_DEFAULT.paragraph.wordCeiling, 220);
  assert.equal(THRESHOLDS_DEFAULT.sources.minPerArticle, 3);
  assert.equal(THRESHOLDS_DEFAULT.article.minWords, 2000);
  assert.equal(THRESHOLDS_DEFAULT.article.maxWords, 12000);
  assert.equal(THRESHOLDS_DEFAULT.article.targetBandPct, 15);
  assert.equal(THRESHOLDS_DEFAULT.styleFingerprint.passThreshold, 7);
  assert.equal(THRESHOLDS_DEFAULT.voice.ruleCoverage.block, 6.0);
  assert.equal(THRESHOLDS_DEFAULT.voice.corpus.minArticles, 3);

  const parsed = parseJsonText(thresholdsDefaultJson());

  assert.deepEqual(parsed, THRESHOLDS_DEFAULT);
});

test("[test_thresholds_read_serves_default_then_override] read_resource serves the typed default, then the project override", async (t) => {
  const root = scratch(t);

  const packaged = await callTool(root, "pi_academic_read_resource", {
    name: "thresholds",
  });

  assert.equal(packaged.details.source, "package");
  assert.equal(packaged.content[0]?.text, thresholdsDefaultJson());

  mkdirSync(join(root, ".pi-academic"));
  writeFileSync(
    join(root, ".pi-academic", "thresholds.json"),
    `${JSON.stringify({ ...THRESHOLDS_DEFAULT, rewriteCycles: { max: 5 } }, null, 2)}\n`,
  );

  const overridden = await callTool(root, "pi_academic_read_resource", {
    name: "thresholds",
  });

  assert.equal(overridden.details.source, "project");
  assert.ok(
    (overridden.content[0]?.text ?? "").includes('"max": 5'),
    "project override must win",
  );
});

test("[test_load_resource_override_and_fallback] loadResource serves default, then project override", (t) => {
  const root = scratch(t);

  const fallback = loadResource("thresholds", root);
  assert.equal(fallback.source, "package");
  assert.equal(fallback.content, thresholdsDefaultJson());
  assert.match(fallback.path, /thresholds-default\.ts/);

  mkdirSync(join(root, ".pi-academic"));
  writeFileSync(
    join(root, ".pi-academic", "thresholds.json"),
    '{"antiAi": {"passThreshold": 42}}\n',
  );

  const overridden = loadResource("thresholds", root);
  assert.equal(overridden.source, "project");
  assert.equal(overridden.path, join(root, ".pi-academic", "thresholds.json"));
  assert.ok(overridden.content.includes('"passThreshold": 42'));
});

test("[test_load_resource_and_tool_missing_resource] missing or unknown resources fail cleanly with details", async (t) => {
  const root = scratch(t);

  assert.throws(
    () => loadResource("nonexistent_resource", root),
    /Unknown Pi Academic resource/,
  );

  const unknownResult = await callTool(root, "pi_academic_read_resource", {
    name: "nonexistent_resource",
  });

  assert.equal(unknownResult.isError, true);
  assert.equal(unknownResult.details.ok, false);
});
