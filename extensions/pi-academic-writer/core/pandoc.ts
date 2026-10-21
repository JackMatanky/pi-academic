import { spawn } from "node:child_process";
import { join } from "node:path";

import { PACKAGE_ROOT } from "../../lib/paths.js";

/**
 * Pandoc argument that resolves note cross-references (`note [](#fn-id)`). Pass
 * it after `--citeproc`: filters and citeproc run in command-line order, and
 * the numbers are final only once citeproc has added its notes.
 */
export const NOTE_REFS_FILTER = `--lua-filter=${join(PACKAGE_ROOT, "extensions", "pandoc", "note-refs.lua")}`;

/**
 * Options for spawning the Pandoc executable.
 */
export interface PandocOptions {
  cwd?: string | undefined;
  signal?: AbortSignal | undefined;
  /**
   * Piped to Pandoc's standard input.
   */
  input?: string | undefined;
}

/**
 * Runs Pandoc and resolves with its raw standard output.
 *
 * @param args - Command-line arguments forwarded to Pandoc.
 * @param options - Spawning and standard-input options.
 *
 * @returns Buffer containing stdout from Pandoc.
 * @throws When Pandoc exits with a non-zero code.
 */
export function runPandoc(
  args: readonly string[],
  options: PandocOptions = {},
): Promise<Buffer> {
  const { promise, resolve, reject } = Promise.withResolvers<Buffer>();

  const child = spawn("pandoc", args, {
    cwd: options.cwd,
    signal: options.signal,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const out: Buffer[] = [];
  const err: Buffer[] = [];
  child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
  child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
  child.on("error", reject);
  child.on("close", (code) => {
    if (code === 0) {
      resolve(Buffer.concat(out));
    } else if (options.signal?.aborted) {
      reject(options.signal.reason ?? new Error("Pandoc process was aborted"));
    } else {
      const detail = Buffer.concat(err).toString("utf8").trim();
      reject(new Error(`pandoc exited with code ${code}: ${detail}`));
    }
  });
  child.stdin.on("error", () => undefined);
  child.stdin.end(options.input ?? "");

  return promise;
}

/**
 * Extracts Pandoc's built-in reference document for DOCX or ODT.
 *
 * @param kind - Format type ("docx" or "odt").
 * @param options - Spawning options.
 *
 * @returns Buffer containing the default reference document.
 */
export function defaultReference(
  kind: "docx" | "odt",
  options: PandocOptions = {},
): Promise<Buffer> {
  return runPandoc(["--print-default-data-file", `reference.${kind}`], options);
}
