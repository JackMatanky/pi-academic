import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PACKAGE_ROOT } from "../lib/paths.js";
import { summarizeRuns, type RunSummary } from "../lib/runs.js";

/** Existence metadata for project-local Academic Writer files. */
interface FileState {
  exists: boolean;
  path: string;
}

/** Full status payload returned by `academic_writer_status`. */
export interface AcademicWriterStatus {
  ok: boolean;
  profile: FileState;
  voice: FileState;
  sources: FileState & { count: number };
  bibliography: FileState;
  runs: RunSummary;
  agents: string[];
}

/** Reads optional project JSON without surfacing parse failures in status output. */
function readJson(path: string): unknown | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    return null;
  }
}

/** Counts sources from either the current array shape or a wrapped legacy shape. */
function countSources(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "sources" in value
  ) {
    if (Array.isArray(value.sources)) return value.sources.length;
  }
  return 0;
}

/** Builds a relative-path file existence record. */
function fileState(projectRoot: string, relativePath: string): FileState {
  const path = join(projectRoot, relativePath);
  return { exists: existsSync(path), path: relativePath };
}

/** Builds the project-local status object shown by the status tool. */
export function buildStatus(projectRoot: string): AcademicWriterStatus {
  const profile = fileState(projectRoot, ".academic-helper/profile.md");
  const voice = fileState(projectRoot, "AUTHOR_VOICE.md");
  const sourcesPath = join(projectRoot, ".academic-helper", "sources.json");
  const sources = {
    exists: existsSync(sourcesPath),
    count: countSources(readJson(sourcesPath)),
    path: ".academic-helper/sources.json",
  };
  const bibliography = fileState(
    projectRoot,
    ".academic-helper/bibliography.bib",
  );
  const agentsDir = join(PACKAGE_ROOT, "agents");
  const agents = readdirSync(agentsDir)
    .filter((entry) => entry.endsWith(".md"))
    .sort();
  return {
    ok: profile.exists,
    profile,
    voice,
    sources,
    bibliography,
    runs: summarizeRuns(projectRoot),
    agents,
  };
}
