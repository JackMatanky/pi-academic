import type { ToolConfig } from "../../lib/types.js";

import { existsSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

import { Type } from "typebox";

import { errorMessage } from "../../lib/fs-safe.js";
import { PACKAGE_ROOT } from "../../lib/paths.js";
import { loadProfile } from "../../lib/profile.js";
import { summarizeRuns, type RunSummary } from "../../lib/runs.js";
import { tryReadJsonFile } from "../../lib/schema.js";

/**
 * File extensions counted as local project source documents.
 */
const SOURCE_EXTENSIONS = new Set([".pdf", ".docx", ".md", ".txt"]);

/**
 * Existence metadata for project-local Pi Academic files.
 */
interface FileState {
  exists: boolean;
  path: string;
}

/**
 * Directory metadata for project-local files.
 */
interface DirectoryState extends FileState {
  count: number;
}

/**
 * Full status payload returned by `pi_academic_status`.
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
  /**
   * Set when profile.md exists but cannot be parsed.
   */
  profileError?: string;
  agents: string[];
}

/**
 * A source registry: a bare array, or an object wrapping a `sources` array.
 */
const SourceRegistrySchema = Type.Union([
  Type.Array(Type.Unknown()),
  Type.Object({ sources: Type.Array(Type.Unknown()) }),
]);

/**
 * Counts registered sources; an unreadable registry counts as none.
 */
function countSources(path: string): number {
  const registry = tryReadJsonFile(path, SourceRegistrySchema);

  if (registry === null) return 0;

  return Array.isArray(registry) ? registry.length : registry.sources.length;
}

/**
 * Builds a relative-path file existence record.
 *
 * @param projectRoot - Absolute project root used to resolve project-relative
 *   files.
 */
function fileState(projectRoot: string, relativePath: string): FileState {
  const path = join(projectRoot, relativePath);

  return { exists: existsSync(path), path: relativePath };
}

/**
 * Counts matching files in an optional project-local directory.
 *
 * @param projectRoot - Absolute project root used to resolve project-relative
 *   files.
 * @param matches - Predicate that selects files or directory entries to count.
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
 * @param projectRoot - Absolute project root used to resolve project-relative
 *   files.
 */
export function buildStatus(projectRoot: string): AcademicWriterStatus {
  const profile = fileState(projectRoot, ".pi-academic/profile.md");
  const voice = fileState(projectRoot, ".pi-academic/voice/profile.md");
  const sourcesPath = join(projectRoot, ".pi-academic", "sources.json");

  const sources = {
    exists: existsSync(sourcesPath),
    count: countSources(sourcesPath),
    path: ".pi-academic/sources.json",
  };

  const bibliography = fileState(projectRoot, ".pi-academic/bibliography.bib");

  const agentsDir = join(PACKAGE_ROOT, "agents");

  const agents = readdirSync(agentsDir)
    .filter((entry) => entry.endsWith(".md"))
    .sort();

  let tools: Record<string, ToolConfig> = {};
  let profileError: string | undefined;

  try {
    tools = loadProfile(projectRoot)?.tools ?? {};
  } catch (error) {
    profileError = errorMessage(error);
  }

  const status: AcademicWriterStatus = {
    ok: profile.exists,
    profile,
    voice,
    sources,
    sourceDocuments: directoryState(
      projectRoot,
      ".pi-academic/sources",
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

  if (profileError) status.profileError = profileError;

  return status;
}
