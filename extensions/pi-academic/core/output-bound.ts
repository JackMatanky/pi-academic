import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

import { resolveInside, writeFileAtomic } from "../../lib/fs-safe.js";

/**
 * Maximum byte size allowed for tool output before spilling to disk (50 KB).
 */
export const MAX_OUTPUT_BYTES = 50_000;

/**
 * Maximum line count allowed for tool output before spilling to disk (2,000
 * lines).
 */
export const MAX_OUTPUT_LINES = 2_000;

const SPILL_DIR = ".pi-academic/runs/tool-output";

const SPILL_MAX_AGE_MS = 86_400_000;

interface Head {
  head: string;
  shown: number;
}

/**
 * Counts lines the way `split("\n").length` would, without allocating an array.
 */
function countLines(text: string): number {
  let count = 1;

  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }

  return count;
}

/**
 * The first `MAX_OUTPUT_LINES` lines of `text` that fit in `MAX_OUTPUT_BYTES`
 * (each line counted with its newline), walking the string without allocating
 * an array of all lines. A first line over the byte cap is cut at a character
 * boundary.
 */
function headOf(text: string): Head {
  const kept: string[] = [];
  let bytes = 0;
  let shown = 0;
  let start = 0;

  while (shown < MAX_OUTPUT_LINES && start <= text.length) {
    let end = text.indexOf("\n", start);

    if (end === -1) end = text.length;

    const line = text.slice(start, end);
    const size = Buffer.byteLength(line, "utf8") + 1;

    if (bytes + size > MAX_OUTPUT_BYTES) {
      if (shown === 0) {
        kept.push(
          Buffer.from(line, "utf8")
            .subarray(0, MAX_OUTPUT_BYTES)
            .toString("utf8")
            .replace(/\uFFFD$/u, ""),
        );
        shown = 1;
      }

      break;
    }

    kept.push(line);
    bytes += size;
    shown += 1;

    if (end === text.length) break;

    start = end + 1;
  }

  return { head: kept.join("\n"), shown };
}

/**
 * Writes the full output under the project's run directory and drops spill
 * files older than a day. Returns the project-relative path, or null when the
 * project has no `.pi-academic/` (it is created only by setup) or the write
 * fails.
 */
function spill(
  projectRoot: string,
  toolName: string,
  text: string,
  now: number,
): string | null {
  try {
    if (!existsSync(resolveInside(projectRoot, ".pi-academic"))) return null;

    const dir = resolveInside(projectRoot, SPILL_DIR);

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
 * cut and, when the project has an `.pi-academic/` directory, saved in full so
 * the agent can page through it.
 *
 * @param projectRoot - Root directory of the project.
 * @param toolName - Name of the calling tool.
 * @param text - Raw tool output text.
 * @param now - Optional timestamp for spill file naming.
 *
 * @returns Bounded output string, with truncation notice if spilled.
 */
export function boundOutput(
  projectRoot: string,
  toolName: string,
  text: string,
  now: number = Date.now(),
): string {
  const totalBytes = Buffer.byteLength(text, "utf8");
  const totalLines = countLines(text);

  // Line counting walks the string: a fitting payload must not pay for a full
  // line array (a 1 MB single-line string would otherwise double in memory).
  if (totalBytes <= MAX_OUTPUT_BYTES && totalLines <= MAX_OUTPUT_LINES)
    return text;

  const { head, shown } = headOf(text);
  const shownBytes = Buffer.byteLength(head, "utf8");
  const saved = spill(projectRoot, toolName, text, now);

  const where = saved
    ? `Full output: ${saved}. Read it in line ranges.`
    : "The full output was not saved; request a narrower input.";

  return `${head}\n\n[output truncated: showing ${shown} of ${totalLines} lines, ${shownBytes} of ${totalBytes} bytes. ${where}]`;
}
