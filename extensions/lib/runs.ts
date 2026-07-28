import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RUNS_RELATIVE_DIR = ".academic-helper/runs";
const ACTIVE_STATUSES = new Set(["planned", "running", "blocked"]);

export interface RunInfo {
  runId: string;
  status: string;
  title: string | null;
  updatedAt: string | null;
  path: string;
}

export interface RunSummary {
  dir: string;
  active: RunInfo[];
  last: RunInfo | null;
}

function readJson(path: string): unknown | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    return null;
  }
}

function readRun(path: string, relativePath: string, fallbackRunId: string): RunInfo & { mtimeMs: number } {
  const data = readJson(path);
  const isRun = data !== null && typeof data === "object" && !Array.isArray(data);
  return {
    runId: isRun && "runId" in data && typeof data.runId === "string" ? data.runId : fallbackRunId,
    status: isRun && "status" in data && typeof data.status === "string" ? data.status : "unknown",
    title: isRun && "title" in data && typeof data.title === "string" ? data.title : null,
    updatedAt: isRun && "updatedAt" in data && typeof data.updatedAt === "string" ? data.updatedAt : null,
    path: relativePath,
    mtimeMs: statSync(path).mtimeMs,
  };
}

export function summarizeRuns(projectDir: string): RunSummary {
  const runsDir = join(projectDir, RUNS_RELATIVE_DIR);
  if (!existsSync(runsDir)) return { dir: RUNS_RELATIVE_DIR, active: [], last: null };

  try {
    const runs = readdirSync(runsDir)
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => readRun(
        join(runsDir, entry),
        `${RUNS_RELATIVE_DIR}/${entry}`,
        entry.replace(/\.json$/, ""),
      ))
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
