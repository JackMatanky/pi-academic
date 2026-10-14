import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, type TestContext } from "vitest";

import { parseProfileMd, serializeProfileMd } from "../lib/profile.js";
import lifecycle from "../lifecycle/index.js";
import { repoRoot } from "./helpers.js";

interface Notice {
  text: string;
  level: string | undefined;
}

interface FakeContext {
  cwd: string;
  hasUI: boolean;
  ui: { notify(text: string, level?: string): void };
}

type Handler = (
  event: { type: string; reason?: string },
  ctx: FakeContext,
) => Promise<void> | void;

interface Fake {
  handlers: Map<string, Handler>;
  notices: Notice[];
  fire(
    event: { type: string; reason?: string },
    cwd: string,
    hasUI?: boolean,
  ): Promise<void>;
}

function setup(options: { zod?: boolean; tools?: string[] }): Fake {
  const handlers = new Map<string, Handler>();
  const notices: Notice[] = [];

  const api: Partial<ExtensionAPI> & { zod?: object } = {
    getAllTools: () =>
      (options.tools ?? []).map((name) => ({
        name,
        description: "",
        parameters: {},
        sourceInfo: {
          path: "",
          source: "test",
          scope: "temporary",
          origin: "top-level",
        },
      })),
  };

  // The lifecycle extension only calls `on` and `getAllTools`.
  const record = (name: string, handler: Handler) => {
    handlers.set(name, handler);
  };

  Object.assign(api, { on: record });

  if (options.zod) api.zod = {};

  // SAFETY: `api` implements the members the lifecycle extension uses.
  lifecycle(api as ExtensionAPI);

  return {
    handlers,
    notices,
    async fire(event, cwd, hasUI = true) {
      const ctx: FakeContext = {
        cwd,
        hasUI,
        ui: { notify: (text, level) => notices.push({ text, level }) },
      };

      await handlers.get(event.type)?.(event, ctx);
    },
  };
}

function project(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), "aw-life-"));

  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  cpSync(
    join(repoRoot, "tests", "e2e", "fixture-project", ".academic-writer"),
    join(root, ".academic-writer"),
    { recursive: true },
  );

  return root;
}

test("only session_start is registered", () => {
  assert.deepEqual([...setup({}).handlers.keys()], ["session_start"]);
});

test("the dashboard shows on a start without a reason, on startup, and not on reload or without a UI", async (t) => {
  const root = project(t);
  const both = ["subagent", "web_search"];

  const none = setup({ tools: both });

  await none.fire({ type: "session_start" }, root);
  assert.equal(none.notices.length, 1);
  assert.ok(none.notices[0]?.text.includes("ACADEMIC WRITER"));

  const startup = setup({ tools: both });

  await startup.fire({ type: "session_start", reason: "startup" }, root);
  assert.equal(startup.notices.length, 1);

  const reload = setup({ tools: both });

  await reload.fire({ type: "session_start", reason: "reload" }, root);
  assert.equal(reload.notices.length, 0);

  const headless = setup({ tools: both });

  await headless.fire({ type: "session_start" }, root, false);
  assert.equal(headless.notices.length, 0);
});

test("on pi missing companions are named in a warning; present companions and omp give none", async (t) => {
  const root = project(t);

  const missing = setup({ tools: [] });

  await missing.fire({ type: "session_start" }, root);
  assert.equal(missing.notices.length, 2);
  assert.equal(missing.notices[1]?.level, "warning");
  assert.ok(missing.notices[1]?.text.includes("pi-subagents"));
  assert.ok(missing.notices[1]?.text.includes("pi-web-access"));

  const present = setup({ tools: ["subagent", "web_search"] });

  await present.fire({ type: "session_start" }, root);
  assert.equal(present.notices.length, 1);

  const omp = setup({ zod: true, tools: [] });

  await omp.fire({ type: "session_start" }, root);
  assert.equal(omp.notices.length, 1);
});

// Independent, minimal terminal-cell estimator for the alignment contract.
const WIDE =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6\u{1F300}-\u{1F64F}\u{1F900}-\u{1F9FF}\u{20000}-\u{3FFFD}]/u;

const ZERO_WIDTH = /[\p{M}\p{Cf}]/u;

function cells(line: string): number {
  let width = 0;

  for (const char of line) {
    if (ZERO_WIDTH.test(char)) continue;
    width += WIDE.test(char) ? 2 : 1;
  }

  return width;
}

test("dashboard rows keep the border aligned for Hebrew, CJK, and emoji content", async (t) => {
  const root = project(t);

  const profile = parseProfileMd(
    readFileSync(join(root, ".academic-writer", "profile.md"), "utf8"),
  );

  profile.fieldOfStudy = "הַמַּדָּע הַקָּרְנִי שֶׁל תוֹרָה שֶׁבְּעַל־פֶה וְהַמַּחְשָׁבָה 📚👨‍👩‍👧 学問";
  writeFileSync(
    join(root, ".academic-writer", "profile.md"),
    serializeProfileMd(profile),
  );

  const session = setup({ tools: ["subagent", "web_search"] });

  await session.fire({ type: "session_start" }, root);
  assert.equal(session.notices.length, 1);

  const text = session.notices[0]?.text ?? "";

  const rows = text
    .split("\n")
    .filter((line) => /^[║╔╠╚]/.test(line) && /[║╗╣╝]$/.test(line));

  assert.ok(rows.length > 5, "the dashboard box is present");
  assert.deepEqual(
    [...new Set(rows.map(cells))],
    [50],
    `every box row must be exactly the border width: ${rows.map((row) => `${cells(row)}:${row}`).join("\n")}`,
  );

  // Truncation must drop whole grapheme clusters: no lone ZWJ or split family
  // emoji may survive.
  const withoutFamily = text.replaceAll("👨‍👩‍👧", "");

  assert.ok(
    !/[\u200d\u{1F469}]/u.test(withoutFamily),
    "no cluster was split at the truncation boundary",
  );
});
