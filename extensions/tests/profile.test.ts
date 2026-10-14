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

function project(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "profile-merge-"));

  t.onTestFinished(() => rmSync(dir, { recursive: true, force: true }));

  mkdirSync(join(dir, ".academic-writer"), { recursive: true });

  return dir;
}

function seedProfile(dir: string, tools: NonNullable<Profile["tools"]>): void {
  const profile = parseProfileMd(
    [
      "# Academic Writer Profile",
      "",
      "---",
      "createdAt: 2026-01-01T00:00:00.000Z",
      "---",
      "",
    ].join("\n"),
  );

  profile.tools = tools;
  writeFileSync(
    join(dir, ".academic-writer", "profile.md"),
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
    readFileSync(join(dir, ".academic-writer", "profile.md"), "utf8"),
    /sefaria/,
  );
});

test("updateProfile still removes fields set to null", async (t) => {
  const dir = project(t);

  seedProfile(dir, { zotero: { enabled: true } });

  const updated = await updateProfile(dir, { tools: null });

  assert.equal(updated?.tools, undefined);

  const reread = loadProfile(dir);

  assert.equal(reread?.tools, undefined);
});
