import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";

import { buildStatus, type AcademicWriterStatus } from "./status.js";

const execFileAsync = promisify(execFile);

/**
 * Health payload extending status data with local command availability.
 */
export interface HealthStatus extends AcademicWriterStatus {
  commands: Record<string, boolean>;
  pandocVersion: string | null;
  rumdl: boolean;
}

/**
 * Memoized PATH lookups, keyed by the current PATH string so a mutated PATH
 * (tests, shell profile changes) is re-scanned instead of served stale.
 */
const commandCache = new Map<string, Map<string, boolean>>();

function commandCacheForPath(): Map<string, boolean> {
  const path = process.env.PATH ?? "";
  let cache = commandCache.get(path);

  if (!cache) {
    cache = new Map();
    commandCache.set(path, cache);
  }

  return cache;
}

/**
 * Returns whether an executable command is available on the current PATH.
 * Results are memoized per PATH for the process lifetime.
 *
 * @param command - Executable command name to search for on PATH.
 *
 * @returns True if command is found and executable on PATH.
 */
export function commandExists(command: string): boolean {
  const cache = commandCacheForPath();
  const cached = cache.get(command);

  if (cached !== undefined) return cached;

  const suffixes =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];

  let found = false;

  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;

    for (const suffix of suffixes) {
      try {
        accessSync(join(dir, command + suffix), constants.X_OK);

        found = true;
        break;
      } catch {
        // try next candidate
      }
    }

    if (found) break;
  }

  commandCacheForPath().set(command, found);

  return found;
}

/**
 * Picks the installed PDF engine Pandoc should use when none is configured.
 *
 * @returns `xelatex` when installed, else `tectonic`, else undefined (Pandoc's
 *   own default).
 */
export function selectPdfEngine(): "xelatex" | "tectonic" | undefined {
  if (commandExists("xelatex")) return "xelatex";

  if (commandExists("tectonic")) return "tectonic";

  return undefined;
}

/**
 * Builds deterministic local health data without probing network/MCP servers.
 *
 * @param projectRoot - Absolute project root used to resolve project-relative
 *   files.
 *
 * @returns Comprehensive local health and command availability status.
 */
export async function buildHealth(projectRoot: string): Promise<HealthStatus> {
  let pandocVersion: string | null = null;

  if (commandExists("pandoc")) {
    try {
      const { stdout } = await execFileAsync("pandoc", ["--version"], {
        encoding: "utf-8",
        signal: AbortSignal.timeout(5_000),
      });

      const first = stdout.split("\n")[0] ?? "";
      const m = first.match(/pandoc\s+([\d.]+)/);

      pandocVersion = m?.[1] ?? null;
    } catch {
      pandocVersion = null;
    }
  }

  return {
    ...buildStatus(projectRoot),
    commands: {
      pandoc: commandExists("pandoc"),
      xelatex: commandExists("xelatex"),
      tectonic: commandExists("tectonic"),
      zoteroMcp: commandExists("zotero-mcp"),
      notebooklm: commandExists("nlm"),
      notebooklmMcp: commandExists("notebooklm-mcp"),
      sefariaMcp: commandExists("sefaria-mcp"),
    },
    rumdl: commandExists("rumdl"),
    pandocVersion,
  };
}
