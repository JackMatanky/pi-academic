import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { PACKAGE_ROOT } from "../lib/paths.js";
import { loadProfile } from "../lib/profile.js";
import { summarizeRuns, type RunSummary } from "../lib/runs.js";
import type { ToolConfig } from "../lib/types.js";

/**
 * File extensions counted as local project source documents.
 *
 * @remarks
 * Kept as a single module-level constant so callers do not duplicate package paths or option lists.
 */
const SOURCE_EXTENSIONS = new Set([".pdf", ".docx", ".md", ".txt"]);

/**
 * Existence metadata for project-local Academic Writer files.
 *
 * @remarks
 * Defines the serializable shape shared between extension tools, tests, and prompts.
 */
interface FileState {
  exists: boolean;
  path: string;
}

/**
 * Directory metadata for project-local files.
 *
 * @remarks
 * Defines the serializable shape shared between extension tools, tests, and prompts.
 */
interface DirectoryState extends FileState {
  count: number;
}

/**
 * Full status payload returned by `academic_writer_status`.
 *
 * @remarks
 * Defines the serializable shape shared between extension tools, tests, and prompts.
 */
export interface AcademicWriterStatus {
  ok: boolean;
  profile: FileState;
  voice: FileState;
  sources: FileState & { count: number };
  sourceDocuments: DirectoryState;
  bibliography: FileState;
  articles: DirectoryState;
  pastArticles: DirectoryState;
  runs: RunSummary;
  tools: Record<string, ToolConfig>;
  agents: string[];
}

/**
 * Reads optional project JSON without surfacing parse failures in status output.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param path - File path to read, write, or resolve.
 * @returns The typed result described by this helper contract.
 */
function readJson(path: string): unknown | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    return null;
  }
}

/**
 * Counts sources from either the current array shape or a wrapped object shape.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param value - Raw value to parse or normalize.
 * @returns The typed result described by this helper contract.
 */
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

/**
 * Builds a relative-path file existence record.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param projectRoot - Absolute project root used to resolve project-relative files.
 * @param relativePath - Value supplied by the caller.
 * @returns The typed result described by this helper contract.
 */
function fileState(projectRoot: string, relativePath: string): FileState {
  const path = join(projectRoot, relativePath);
  return { exists: existsSync(path), path: relativePath };
}

/**
 * Counts matching files in an optional project-local directory.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param projectRoot - Absolute project root used to resolve project-relative files.
 * @param relativePath - Value supplied by the caller.
 * @param matches - Predicate that selects files or directory entries to count.
 * @returns The typed result described by this helper contract.
 */
function directoryState(
  projectRoot: string,
  relativePath: string,
  matches: (entry: string) => boolean,
): DirectoryState {
  const path = join(projectRoot, relativePath);
  const count = existsSync(path) ? readdirSync(path).filter(matches).length : 0;
  return { exists: existsSync(path), path: relativePath, count };
}

/**
 * Builds the project-local status object shown by the status tool.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param projectRoot - Absolute project root used to resolve project-relative files.
 * @returns The typed result described by this helper contract.
 */
export function buildStatus(projectRoot: string): AcademicWriterStatus {
  const profile = fileState(projectRoot, ".academic-writer/profile.md");
  const voice = fileState(projectRoot, "AUTHOR_VOICE.md");
  const sourcesPath = join(projectRoot, ".academic-writer", "sources.json");
  const sources = {
    exists: existsSync(sourcesPath),
    count: countSources(readJson(sourcesPath)),
    path: ".academic-writer/sources.json",
  };
  const bibliography = fileState(
    projectRoot,
    ".academic-writer/bibliography.bib",
  );
  const agentsDir = join(PACKAGE_ROOT, "agents");
  const agents = readdirSync(agentsDir)
    .filter((entry) => entry.endsWith(".md"))
    .sort();
  const tools = loadProfile(projectRoot)?.tools ?? {};
  return {
    ok: profile.exists,
    profile,
    voice,
    sources,
    sourceDocuments: directoryState(
      projectRoot,
      ".academic-writer/sources",
      (entry) => SOURCE_EXTENSIONS.has(extname(entry).toLowerCase()),
    ),
    bibliography,
    articles: directoryState(projectRoot, "articles", (entry) =>
      entry.endsWith(".md"),
    ),
    pastArticles: directoryState(
      projectRoot,
      "past-articles",
      (entry) => !entry.startsWith("."),
    ),
    runs: summarizeRuns(projectRoot),
    tools,
    agents,
  };
}
