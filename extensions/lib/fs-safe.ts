import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * Returns the message of a thrown value.
 *
 * @param cause - Unknown thrown value or Error instance.
 *
 * @returns Extracted error message or stringified representation.
 */
export function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Returns whether a thrown value is a Node system error carrying a `code`.
 *
 * @param cause - Unknown thrown value to check.
 *
 * @returns True if `cause` is an Error with a string `code` property.
 */
export function isErrnoException(
  cause: unknown,
): cause is NodeJS.ErrnoException {
  return cause instanceof Error && "code" in cause;
}

/**
 * Returns whether `child` is `parent` or lies below it (lexical check).
 *
 * @param parent - Directory expected to contain `child`.
 * @param child - Path to test for containment.
 *
 * @returns True if `child` is identical to or within `parent`.
 */
export function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);

  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
}

/**
 * Resolves a project-relative or absolute path and rejects anything outside the
 * project.
 *
 * Symlinks are resolved through the nearest existing ancestor, so a link inside
 * the project that points outside it is rejected as well.
 *
 * @param projectRoot - Absolute project root path.
 * @param path - Project-relative or absolute candidate path.
 *
 * @returns Verified absolute path strictly within `projectRoot`.
 * @throws When the resolved path escapes `projectRoot`.
 */
export function resolveInside(projectRoot: string, path: string): string {
  const root = resolve(projectRoot);
  const target = resolve(root, path);

  if (!isInside(root, target)) {
    throw new Error(`Path must stay inside the project: ${path}`);
  }

  let existing = target;

  for (;;) {
    try {
      const real = realpathSync(existing);

      if (!isInside(realpathSync(root), real)) {
        throw new Error(`Path must stay inside the project: ${path}`);
      }

      return target;
    } catch (error) {
      if (!isErrnoException(error) || error.code !== "ENOENT") throw error;
      const parent = dirname(existing);

      if (parent === existing) return target;
      existing = parent;
    }
  }
}

/**
 * Writes a file through a temporary sibling and rename, so readers never see a
 * partial file.
 *
 * @param path - Destination file path.
 * @param content - String or binary payload to persist.
 * @throws When writing or atomic rename fails.
 */
export function writeFileAtomic(
  path: string,
  content: string | Uint8Array,
): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;

  try {
    writeFileSync(temporary, content);
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

/**
 * Returns whether a process is running, via the signal-0 liveness probe.
 * `EPERM` means the process exists but cannot be signalled, which still counts
 * as alive.
 *
 * @param pid - Operating-system process id to probe.
 */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return isErrnoException(error) && error.code === "EPERM";
  }
}

/**
 * Atomic stale-lock takeover: rename the abandoned directory aside, record our
 * ownership in its place, then remove the rename. A competing owner re-created
 * the lock or its meta file defeats the rename and keeps the lock. A recorded
 * owner whose process is still running is never stolen from, even when its
 * mtime looks old.
 */
function takeStaleLock(lock: string, owner: string): boolean {
  try {
    const recorded = readFileSync(join(lock, "owner"), "utf8");
    const pid = Number.parseInt(recorded.split("-")[0] ?? "", 10);

    if (Number.isInteger(pid) && pid > 0 && processAlive(pid)) return false;
  } catch {
    // No readable owner file: fall through to the mtime-based takeover.
  }

  const claim = `${lock}.${process.pid}.${randomUUID().slice(0, 8)}.stale`;

  try {
    renameSync(lock, claim);
  } catch {
    return false; // someone else moved it first
  }

  try {
    mkdirSync(lock);
    writeFileSync(join(lock, "owner"), owner);

    return true;
  } finally {
    rmSync(claim, { recursive: true, force: true });
  }
}

/**
 * Arrival-order waiters per lock path; chained promises, not a poll loop.
 */
const lockQueues = new Map<string, Promise<void>>();

/**
 * Runs `fn` while holding an exclusive directory lock next to `path`.
 *
 * Serialises read-modify-write cycles across processes (parallel subagents).
 * Concurrent callers in one process queue fairly on the same promise chain
 * instead of polling each other. A lock older than `staleMs` is assumed
 * abandoned and taken over; ownership is confirmed through a meta file so an
 * active owner is never evicted by a stale-takeover race.
 *
 * @param path - Path to file being protected by the lock.
 * @param fn - Synchronous or asynchronous action to execute under the lock.
 * @param options - Lock configuration options.
 *
 * @returns Result value returned by `fn`.
 * @throws When lock acquisition times out or is aborted.
 */
export async function withFileLock<T>(
  path: string,
  fn: () => T | Promise<T>,
  {
    timeoutMs = 10_000,
    staleMs = 30_000,
    signal,
  }: {
    timeoutMs?: number | undefined;
    staleMs?: number | undefined;
    signal?: AbortSignal | undefined;
  } = {},
): Promise<T> {
  const lock = `${path}.lock`;
  mkdirSync(dirname(path), { recursive: true });
  const owner = `${process.pid}-${randomUUID()}`;

  // One promise chain per lock path: waiters acquire in arrival order, so
  // same-process callers do not race each other through the filesystem.
  const previous = lockQueues.get(lock) ?? Promise.resolve();
  const { promise: acquired, resolve: release } = Promise.withResolvers<void>();

  const nextQueue = previous.catch(() => {}).then(() => acquired);
  nextQueue.finally(() => {
    if (lockQueues.get(lock) === nextQueue) lockQueues.delete(lock);
  });
  lockQueues.set(lock, nextQueue);

  const deadline = Date.now() + timeoutMs;

  if (signal?.aborted) {
    release();
    throw signal.reason ?? new Error("Lock acquisition aborted");
  }

  const remaining = deadline - Date.now();

  if (remaining <= 0) {
    release();
    throw new Error(`Timed out locking ${path}`);
  }

  const { promise: queueRace, reject: rejectQueue } =
    Promise.withResolvers<never>();

  const queueTimer = setTimeout(() => {
    rejectQueue(new Error(`Timed out locking ${path}`));
  }, remaining);

  const onQueueAbort = () => {
    clearTimeout(queueTimer);
    rejectQueue(signal?.reason ?? new Error("Lock acquisition aborted"));
  };

  signal?.addEventListener("abort", onQueueAbort, { once: true });

  try {
    await Promise.race([previous.catch(() => {}), queueRace]);
  } catch (queueError) {
    release();
    throw queueError;
  } finally {
    clearTimeout(queueTimer);
    signal?.removeEventListener("abort", onQueueAbort);
  }

  if (signal?.aborted) {
    release();
    throw signal.reason ?? new Error("Lock acquisition aborted");
  }

  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if (!isErrnoException(error) || error.code !== "EEXIST") {
        // The queue entry must not keep later callers waiting forever.
        release();
        throw error;
      }

      try {
        if (
          Date.now() - statSync(lock).mtimeMs > staleMs &&
          takeStaleLock(lock, owner)
        ) {
          break;
        }
      } catch {
        continue; // lock vanished between checks
      }

      if (signal?.aborted) {
        release();
        throw signal.reason ?? new Error("Lock acquisition aborted");
      }

      if (Date.now() > deadline) {
        release();
        throw new Error(`Timed out locking ${path}`);
      }

      // One-shot timer; kept ref'd so a process waiting on another process's
      // lock cannot exit with an unsettled await.
      const {
        promise: waitPromise,
        resolve: resolveWait,
        reject: rejectWait,
      } = Promise.withResolvers<void>();

      const onAbort = () => {
        clearTimeout(timer);
        rejectWait(signal?.reason ?? new Error("Lock acquisition aborted"));
      };

      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolveWait();
      }, 25);

      signal?.addEventListener("abort", onAbort, { once: true });

      try {
        await waitPromise;
      } catch (waitErr) {
        release();
        throw waitErr;
      }
    }
  }

  writeFileSync(join(lock, "owner"), owner);

  // Keeps the lock mtime fresh so a long fn() is never judged stale and
  // stolen by a waiting process; unref'd so it never holds the event loop.
  const heartbeat = setInterval(() => {
    try {
      utimesSync(lock, new Date(), new Date());
    } catch {
      // Lock vanished; ownership check in the finally block below handles it.
    }
  }, 5_000);

  heartbeat.unref();

  try {
    return await fn();
  } finally {
    clearInterval(heartbeat);

    try {
      if (readFileSync(join(lock, "owner"), "utf8") === owner) {
        rmSync(lock, { recursive: true, force: true });
      }
    } catch {
      // Stolen lock or lock directory vanished; do not delete another owner's lock directory.
    }

    release();
  }
}
