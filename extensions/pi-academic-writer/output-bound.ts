import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import { writeFileAtomic } from "../lib/fs-safe.js";

export const MAX_OUTPUT_BYTES = 50_000;

export const MAX_OUTPUT_LINES = 2_000;

const SPILL_DIR = ".academic-writer/runs/tool-output";

const SPILL_MAX_AGE_MS = 86_400_000;

interface Head {
  head: string;
  shown: number;
}

/**
 * The first `MAX_OUTPUT_LINES` lines of `lines` that fit in `MAX_OUTPUT_BYTES`
 * (each line counted with its newline). A first line over the byte cap is cut
 * at a character boundary.
 */
function headOf(lines: string[]): Head {
  const kept: string[] = [];
  let bytes = 0;

  for (const line of lines.slice(0, MAX_OUTPUT_LINES)) {
    const size = Buffer.byteLength(line, "utf8") + 1;

    if (bytes + size > MAX_OUTPUT_BYTES) {
      if (kept.length === 0) {
        const cut = Buffer.from(line, "utf8")
          .subarray(0, MAX_OUTPUT_BYTES)
          .toString("utf8")
          .replace(/\uFFFD$/u, "");

        kept.push(cut);
      }

      break;
    }

    kept.push(line);
    bytes += size;
  }

  return { head: kept.join("\n"), shown: kept.length };
}

/**
 * Writes the full output under the project's run directory and drops spill
 * files older than a day. Returns the project-relative path, or null when the
 * project has no `.academic-writer/` (it is created only by setup) or the write
 * fails.
 */
function spill(
  projectRoot: string,
  toolName: string,
  text: string,
  now: number,
): string | null {
  if (!existsSync(join(projectRoot, ".academic-writer"))) return null;

  const dir = join(projectRoot, SPILL_DIR);

  try {
    mkdirSync(dir, { recursive: true });

    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);

      if (now - statSync(path).mtimeMs > SPILL_MAX_AGE_MS)
        rmSync(path, { force: true });
    }

    const name = `${toolName}-${now}.txt`;

    writeFileAtomic(join(dir, name), text);

    return `${SPILL_DIR}/${name}`;
  } catch {
    // The truncation notice tells the agent the output was not saved.
    return null;
  }
}

/**
 * Keeps tool output within what a model can read in one go. Longer output is
 * cut and, when the project has an `.academic-writer/` directory, saved in full
 * so the agent can page through it.
 */
export function boundOutput(
  projectRoot: string,
  toolName: string,
  text: string,
  now: number = Date.now(),
): string {
  const lines = text.split("\n");
  const totalBytes = Buffer.byteLength(text, "utf8");

  if (lines.length <= MAX_OUTPUT_LINES && totalBytes <= MAX_OUTPUT_BYTES)
    return text;

  const { head, shown } = headOf(lines);
  const shownBytes = Buffer.byteLength(head, "utf8");
  const saved = spill(projectRoot, toolName, text, now);

  const where = saved
    ? `Full output: ${saved}. Read it in line ranges.`
    : "The full output was not saved; request a narrower input.";

  return `${head}\n\n[output truncated: showing ${shown} of ${lines.length} lines, ${shownBytes} of ${totalBytes} bytes. ${where}]`;
}
