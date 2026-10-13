import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, type TestContext } from "vitest";

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
