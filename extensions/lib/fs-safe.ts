import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

/** Returns the message of an unknown thrown value. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Returns whether `child` is `parent` or lies below it (lexical check). */
export function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);

  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
}

/**
 * Resolves a project-relative or absolute path and rejects anything outside the project.
 *
 * Symlinks are resolved through the nearest existing ancestor, so a link inside
 * the project that points outside it is rejected as well.
 *
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
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = dirname(existing);

      if (parent === existing) return target;
      existing = parent;
    }
  }
}

/** Writes a file through a temporary sibling and rename, so readers never see a partial file. */
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
 * Runs `fn` while holding an exclusive directory lock next to `path`.
 *
 * Serialises read-modify-write cycles across processes (parallel subagents).
 * A lock older than `staleMs` is assumed abandoned and taken over.
 */
export function withFileLock<T>(
  path: string,
  fn: () => T,
  { timeoutMs = 10_000, staleMs = 30_000 } = {},
): T {
  const lock = `${path}.lock`;
  mkdirSync(dirname(path), { recursive: true });
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;

      try {
        if (Date.now() - statSync(lock).mtimeMs > staleMs) {
          rmSync(lock, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue; // lock vanished between checks
      }

      if (Date.now() > deadline) throw new Error(`Timed out locking ${path}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }

  try {
    return fn();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
