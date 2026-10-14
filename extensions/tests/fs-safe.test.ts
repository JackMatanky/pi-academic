import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, type TestContext } from "vitest";

import { withFileLock } from "../lib/fs-safe.js";

function scratch(t: TestContext): string {
  const root = mkdtempSync(join(tmpdir(), "fs-safe-"));

  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));

  return root;
}

const staleTime = () => new Date(Date.now() - 60_000);

function plantLock(target: string, owner: string): string {
  const lock = `${target}.lock`;

  mkdirSync(lock);
  writeFileSync(join(lock, "owner"), owner);
  utimesSync(lock, staleTime(), staleTime());

  return lock;
}

test("a stale-looking lock whose owner process is alive is never stolen", async (t) => {
  const root = scratch(t);
  const target = join(root, "state.json");

  // A live process that is not this test process.
  const holder = spawn(process.execPath, ["-e", "setInterval(() => {}, 1e3)"], {
    stdio: "ignore",
  });

  t.onTestFinished(() => {
    holder.kill();
  });

  const lock = plantLock(target, `${holder.pid}-live-owner`);

  await assert.rejects(
    withFileLock(target, () => "stolen", { staleMs: 50, timeoutMs: 400 }),
    /Timed out locking/,
  );
  assert.equal(
    readFileSync(join(lock, "owner"), "utf8"),
    `${holder.pid}-live-owner`,
    "the live owner's lock must remain untouched",
  );
});

test("a stale lock with a dead owner is taken over", async (t) => {
  const root = scratch(t);
  const target = join(root, "state.json");

  const dead = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  const exited = Promise.withResolvers<void>();

  dead.on("exit", exited.resolve);
  await exited.promise;

  plantLock(target, `${dead.pid}-dead-owner`);

  const outcome = await withFileLock(target, () => "taken", {
    staleMs: 50,
    timeoutMs: 2_000,
  });

  assert.equal(outcome, "taken");
});

// Real platform-clock overlap: exclusion is only meaningful when critical
// sections genuinely overlap, which fake timers cannot express.
test("withFileLock serialises concurrent callers in one process", async (t) => {
  const root = scratch(t);
  const target = join(root, "state.json");
  let inside = 0;
  let maxInside = 0;

  await Promise.all(
    Array.from({ length: 5 }, () =>
      withFileLock(target, async () => {
        inside += 1;
        maxInside = Math.max(maxInside, inside);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inside -= 1;
      }),
    ),
  );

  assert.equal(maxInside, 1);
});

test("withFileLock rejects before starting when the signal is already aborted", async (t) => {
  const root = scratch(t);
  const target = join(root, "state.json");

  await assert.rejects(
    withFileLock(target, () => "x", {
      signal: AbortSignal.abort(new Error("stop")),
    }),
    /stop/,
  );
});
