import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { Type } from "typebox";

import { tryReadJsonFile } from "./schema.js";

/**
 * Project-relative directory containing persisted run-state JSON files.
 */
const RUNS_RELATIVE_DIR = ".academic-writer/runs";

/**
 * Run statuses considered active in dashboards and status tools.
 */
const ACTIVE_STATUSES = new Set(["planned", "running", "blocked"]);

/**
 * Project run metadata stored in `.academic-writer/runs/<run-id>.json`.
 */
export interface RunInfo {
  runId: string;
  status: string;
  title: string | null;
  updatedAt: string | null;
  path: string;
}

/**
 * Sorted run-state summary for dashboards and status tools.
 */
export interface RunSummary {
  dir: string;
  active: RunInfo[];
  last: RunInfo | null;
}

/**
 * The fields of a run-state file this package reads.
 */
const RunFileSchema = Type.Object({
  runId: Type.Optional(Type.String()),
  status: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
});

/**
 * Converts one run-state JSON file into a typed summary row. A malformed file
 * never breaks session startup: it is summarized with fallbacks.
 */
function readRun(
  path: string,
  relativePath: string,
  fallbackRunId: string,
): RunInfo & { mtimeMs: number } {
  const data = tryReadJsonFile(path, RunFileSchema);

  return {
    runId: data?.runId ?? fallbackRunId,
    status: data?.status ?? "unknown",
    title: data?.title ?? null,
    updatedAt: data?.updatedAt ?? null,
    path: relativePath,
    mtimeMs: statSync(path).mtimeMs,
  };
}

/**
 * Summarizes active and latest Academic Writer runs for a project.
 *
 * @param projectDir - Absolute project directory used for project-local state.
 */
export function summarizeRuns(projectDir: string): RunSummary {
  const runsDir = join(projectDir, RUNS_RELATIVE_DIR);

  if (!existsSync(runsDir))
    return { dir: RUNS_RELATIVE_DIR, active: [], last: null };

  try {
    const runs = readdirSync(runsDir)
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) =>
        readRun(
          join(runsDir, entry),
          `${RUNS_RELATIVE_DIR}/${entry}`,
          entry.replace(/\.json$/, ""),
        ),
      )
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    const compact: RunInfo[] = runs.map(({ mtimeMs: _mtimeMs, ...run }) => run);

    return {
      dir: RUNS_RELATIVE_DIR,
      active: compact.filter((run) => ACTIVE_STATUSES.has(run.status)),
      last: compact[0] ?? null,
    };
  } catch {
    return { dir: RUNS_RELATIVE_DIR, active: [], last: null };
  }
}
