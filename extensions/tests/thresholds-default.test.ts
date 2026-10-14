import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, type TestContext } from "vitest";

import { parseJsonText } from "../lib/schema.js";
import {
  THRESHOLDS_DEFAULT,
  thresholdsDefaultJson,
} from "../pi-academic-writer/thresholds-default.js";
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

  const packaged = await callTool(root, "academic_writer_read_resource", {
    name: "thresholds",
  });

  assert.equal(packaged.details.source, "package");
  assert.equal(packaged.content[0]?.text, thresholdsDefaultJson());

  mkdirSync(join(root, ".academic-writer"));
  writeFileSync(
    join(root, ".academic-writer", "thresholds.json"),
    `${JSON.stringify({ ...THRESHOLDS_DEFAULT, rewriteCycles: { max: 5 } }, null, 2)}\n`,
  );

  const overridden = await callTool(root, "academic_writer_read_resource", {
    name: "thresholds",
  });

  assert.equal(overridden.details.source, "project");
  assert.ok(
    (overridden.content[0]?.text ?? "").includes('"max": 5'),
    "project override must win",
  );
});
