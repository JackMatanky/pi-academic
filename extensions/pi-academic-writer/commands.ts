import { execFileSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

import { buildStatus, type AcademicWriterStatus } from "./status.js";

/**
 * Health payload extending status data with local command availability.
 */
export interface HealthStatus extends AcademicWriterStatus {
  commands: Record<string, boolean>;
  pandocVersion: string | null;
  rumdl: boolean;
}

/**
 * Returns whether an executable command is available on the current PATH.
 *
 * @param command - Executable command name to search for on PATH.
 *
 * @returns True if command is found and executable on PATH.
 */
export function commandExists(command: string): boolean {
  const suffixes =
    process.platform === "win32"
      ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";")
      : [""];

  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;

    for (const suffix of suffixes) {
      try {
        accessSync(join(dir, command + suffix), constants.X_OK);

        return true;
      } catch {
        // try next candidate
      }
    }
  }

  return false;
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
export function buildHealth(projectRoot: string): HealthStatus {
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
    pandocVersion: (() => {
      if (!commandExists("pandoc")) return null;

      try {
        const out = execFileSync("pandoc", ["--version"], {
          encoding: "utf-8",
          timeout: 5_000,
        });

        const first = out.split("\n")[0] ?? "";
        const m = first.match(/pandoc\s+([\d.]+)/);

        return m?.[1] ?? null;
      } catch {
        return null;
      }
    })(),
  };
}
