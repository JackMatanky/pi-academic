import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, type TestContext } from "vitest";

import {
  loadProfile,
  parseProfileMd,
  serializeProfileMd,
  updateProfile,
  type Profile,
} from "../lib/profile.js";
import { createToolHarness } from "./helpers.js";

function project(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "profile-merge-"));

  t.onTestFinished(() => rmSync(dir, { recursive: true, force: true }));

  mkdirSync(join(dir, ".pi-academic"), { recursive: true });

  return dir;
}

function seedProfile(dir: string, tools: NonNullable<Profile["tools"]>): void {
  const profile = parseProfileMd(
    [
      "# Pi Academic Profile",
      "",
      "---",
      "createdAt: 2026-01-01T00:00:00.000Z",
      "---",
      "",
    ].join("\n"),
  );

  profile.tools = tools;
  writeFileSync(
    join(dir, ".pi-academic", "profile.md"),
    serializeProfileMd(profile),
  );
}

test("updateProfile merges the tools section instead of replacing it", async (t) => {
  const dir = project(t);

  seedProfile(dir, {
    zotero: { enabled: true },
    sefaria: { enabled: true },
  });

  const updated = await updateProfile(dir, {
    tools: { zotero: { enabled: false } },
  });

  assert.equal(updated?.tools?.zotero?.enabled, false);
  assert.equal(
    updated?.tools?.sefaria?.enabled,
    true,
    "a one-key patch must not drop sibling integrations",
  );

  const reread = loadProfile(dir);

  assert.equal(reread?.tools?.zotero?.enabled, false);
  assert.equal(reread?.tools?.sefaria?.enabled, true);
  assert.match(
    readFileSync(join(dir, ".pi-academic", "profile.md"), "utf8"),
    /sefaria/,
  );
});

test("updateProfile merges nested objects and nested null deletes", async (t) => {
  const dir = project(t);

  seedProfile(dir, {
    zotero: {
      enabled: true,
      collection: { id: "LIB", key: "old-key", name: "Old" },
    },
    sefaria: { enabled: true },
  });

  const updated = await updateProfile(dir, {
    tools: {
      zotero: {
        enabled: false,
        collection: { name: "Ancient", key: null },
      },
    },
  });

  const zotero = updated?.tools?.zotero;

  assert.equal(zotero?.enabled, false);
  assert.equal(zotero?.collection?.id, "LIB", "sibling nested keys survive");
  assert.equal(zotero?.collection?.name, "Ancient");
  assert.equal(
    zotero?.collection?.key,
    undefined,
    "a nested null deletes the key",
  );
  assert.equal(updated?.tools?.sefaria?.enabled, true);
});

test("pi_academic_update_profile deep-merges through the tool surface", async (t) => {
  const dir = project(t);

  seedProfile(dir, {
    zotero: { enabled: true, collection: { id: "LIB" } },
    sefaria: { enabled: true },
  });

  const { callTool } = createToolHarness();

  const result = await callTool(dir, "pi_academic_update_profile", {
    fieldsJson: {
      tools: { zotero: { enabled: false, collection: { name: "Ancient" } } },
    },
  });

  assert.equal(result.isError, false, result.content[0]?.text ?? "");

  const profile = loadProfile(dir);

  assert.equal(profile?.tools?.zotero?.enabled, false);
  assert.equal(profile?.tools?.zotero?.collection?.id, "LIB");
  assert.equal(profile?.tools?.zotero?.collection?.name, "Ancient");
  assert.equal(profile?.tools?.sefaria?.enabled, true);
});

test("updateProfile still removes fields set to null", async (t) => {
  const dir = project(t);

  seedProfile(dir, { zotero: { enabled: true } });

  const updated = await updateProfile(dir, { tools: null });

  assert.equal(updated?.tools, undefined);

  const reread = loadProfile(dir);

  assert.equal(reread?.tools, undefined);
});

test("loadProfile automatically migrates profile.json when profile.md is missing", (t) => {
  const dir = project(t);
  const jsonPath = join(dir, ".pi-academic", "profile.json");
  writeFileSync(
    jsonPath,
    JSON.stringify({
      fieldOfStudy: "Philosophy",
      citationStyle: "chicago",
      tools: { zotero: { enabled: true } },
    }),
  );

  const profile = loadProfile(dir);
  assert.ok(profile);
  assert.equal(profile.fieldOfStudy, "Philosophy");
  assert.equal(profile.citationStyle, "chicago");
  assert.equal(profile.tools?.zotero?.enabled, true);
});
