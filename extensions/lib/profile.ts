import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProfileData } from "./types.js";

/**
 * Project-local directory containing Academic Writer runtime data.
 *
 * @remarks
 * Kept as a single module-level constant so callers do not duplicate package paths or option lists.
 */
const PROFILE_DIR = ".academic-writer";
/**
 * Project-relative markdown profile path.
 *
 * @remarks
 * Kept as a single module-level constant so callers do not duplicate package paths or option lists.
 */
const PROFILE_RELATIVE_PATH = ".academic-writer/profile.md";
/**
 * Old project-relative JSON profile path migrated on first load.
 *
 * @remarks
 * Kept as a single module-level constant so callers do not duplicate package paths or option lists.
 */
const JSON_PROFILE_RELATIVE_PATH = ".academic-writer/profile.json";

/**
 * Returns the project-local `.academic-writer` directory path.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param projectDir - Absolute project directory used for project-local state.
 * @returns The typed result described by this helper contract.
 */
export function getProfileDirPath(projectDir: string): string {
  return join(projectDir, PROFILE_DIR);
}

/**
 * Returns the project-local Academic Writer profile markdown path.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param projectDir - Absolute project directory used for project-local state.
 * @returns The typed result described by this helper contract.
 */
export function getProfilePath(projectDir: string): string {
  return join(projectDir, PROFILE_RELATIVE_PATH);
}

/**
 * Profile data plus extension fields preserved during markdown serialization.
 *
 * @remarks
 * Narrows a reusable structural type used by profile parsing and serialization.
 */
type ProfileFields = ProfileData & Record<string, unknown>;
/**
 * Result payload for one JSON-to-markdown profile migration attempt.
 *
 * @remarks
 * Defines the serializable shape shared between extension tools, tests, and prompts.
 */
export interface ProfileMigrationResult {
  ok: boolean;
  migrated: boolean;
  jsonPath: string;
  profilePath: string;
  reason?: string;
  error?: string;
  profile?: ProfileData;
}
/**
 * Scalar profile frontmatter fields serialized directly as YAML values.
 *
 * @remarks
 * Kept as a single module-level constant so callers do not duplicate package paths or option lists.
 */
const SCALAR_KEYS = [
  "fieldOfStudy",
  "citationStyle",
  "targetLanguage",
  "updatedAt",
  "createdAt",
] as const;
/**
 * Array profile frontmatter fields serialized as YAML lists.
 *
 * @remarks
 * Kept as a single module-level constant so callers do not duplicate package paths or option lists.
 */
const LIST_KEYS = ["abstractLanguages", "analyzedArticles"] as const;
/**
 * JSON profile sections serialized under stable markdown headings.
 *
 * @remarks
 * Kept as a single module-level constant so callers do not duplicate package paths or option lists.
 */
const JSON_SECTIONS = [
  ["tools", "Tools"],
  ["outputFormatPreferences", "Output Format Preferences"],
  ["styleFingerprint", "Style Fingerprint"],
  ["articleStructure", "Article Structure"],
  ["sources", "Sources"],
] as const;
/**
 * Normalized markdown heading lookup for JSON-backed profile sections.
 *
 * @remarks
 * Kept as a single module-level constant so callers do not duplicate package paths or option lists.
 */
const JSON_SECTION_KEYS = Object.fromEntries(
  JSON_SECTIONS.map(([key, heading]) => [
    heading.toLowerCase().replace(/\s+/g, ""),
    key,
  ]),
) as Record<string, keyof ProfileData>;

/**
 * Parses the profile's deliberately small YAML-frontmatter subset.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param raw - Raw profile markdown content.
 * @param fields - Mutable parsed profile fields accumulator.
 */
function parseFrontmatter(raw: string, fields: ProfileFields): void {
  const fmMatch = raw.match(/(?:^|\n)---\n([\s\S]*?)\n---/);
  if (!fmMatch) return;

  const fmLines = fmMatch[1].split("\n");
  let i = 0;
  while (i < fmLines.length) {
    const line = fmLines[i];
    const kvMatch = line.match(/^([\w-]+): (.+)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      const v = value.trim();
      if (v === "null") fields[key] = null;
      else if (v === "[]") fields[key] = [];
      else fields[key] = v;
      i++;
      continue;
    }

    if (/^[\w-]+:\s*$/.test(line)) {
      const key = line.split(":")[0];
      const items: string[] = [];
      i++;
      while (i < fmLines.length && fmLines[i].startsWith("  - ")) {
        items.push(fmLines[i].slice(4));
        i++;
      }
      fields[key] = items;
      continue;
    }

    i++;
  }
}

/**
 * Stores a recognized JSON profile section under its canonical profile key.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param heading - Markdown heading naming a JSON-backed profile section.
 * @param parsed - Parsed JSON section value.
 * @param fields - Mutable parsed profile fields accumulator.
 */
function assignJsonSection(
  heading: string,
  parsed: unknown,
  fields: ProfileFields,
): void {
  const key = JSON_SECTION_KEYS[heading];
  if (key) (fields as Record<string, unknown>)[key] = parsed;
}

/**
 * Parses profile JSON sections headed by `## <Name>`.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param raw - Raw profile markdown content.
 * @param fields - Mutable parsed profile fields accumulator.
 */
function parseJsonSections(raw: string, fields: ProfileFields): void {
  const sectionRe = /^## ([^\n]+)\n+```json\n([\s\S]*?)\n```/gm;
  let m: RegExpExecArray | null;
  while ((m = sectionRe.exec(raw)) !== null) {
    try {
      const heading = m[1].trim().toLowerCase().replace(/\s+/g, "");
      assignJsonSection(heading, JSON.parse(m[2]) as unknown, fields);
    } catch {
      // skip malformed JSON blocks
    }
  }
}

/**
 * Parses a profile markdown document, returning null only for unreadable parser failures.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param raw - Raw profile markdown content.
 * @returns The typed result described by this helper contract.
 */
export function parseProfileMd(raw: string): ProfileData | null {
  try {
    const profile: ProfileFields = {};
    parseFrontmatter(raw, profile);
    parseJsonSections(raw, profile);
    return profile;
  } catch {
    return null;
  }
}

/**
 * Serializes the known Academic Writer profile fields back to markdown.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param profile - Parsed profile data used by the caller.
 * @returns The typed result described by this helper contract.
 */
export function serializeProfileMd(profile: ProfileFields): string {
  const lines = ["# Academic Writer Profile", "", "---"];
  for (const key of SCALAR_KEYS) {
    const value = profile[key];
    if (value !== undefined && value !== null) lines.push(`${key}: ${value}`);
  }
  for (const key of LIST_KEYS) {
    const value = profile[key];
    if (!Array.isArray(value) || value.length === 0) {
      lines.push(`${key}: []`);
    } else {
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${String(item)}`);
    }
  }
  lines.push("---", "");
  for (const [key, heading] of JSON_SECTIONS) {
    const value = profile[key];
    if (value !== undefined && value !== null) {
      lines.push(
        `## ${heading}`,
        "",
        "```json",
        JSON.stringify(value, null, 2),
        "```",
        "",
      );
    }
  }
  return lines.join("\n");
}

/**
 * Migrates the old JSON profile location into the markdown profile format once.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param projectDir - Absolute project directory used for project-local state.
 * @returns The typed result described by this helper contract.
 */
export function migrateJsonProfile(projectDir: string): ProfileMigrationResult {
  const jsonPath = join(projectDir, JSON_PROFILE_RELATIVE_PATH);
  const profilePath = getProfilePath(projectDir);
  const resultPaths = {
    jsonPath: JSON_PROFILE_RELATIVE_PATH,
    profilePath: PROFILE_RELATIVE_PATH,
  };

  if (existsSync(profilePath)) {
    return {
      ok: true,
      migrated: false,
      ...resultPaths,
      reason: "profile already exists",
    };
  }
  if (!existsSync(jsonPath)) {
    return {
      ok: true,
      migrated: false,
      ...resultPaths,
      reason: "JSON profile not found",
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(jsonPath, "utf-8")) as unknown;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {
        ok: false,
        migrated: false,
        ...resultPaths,
        error: "JSON profile must be a JSON object",
      };
    }

    const profile = parsed as ProfileFields;
    mkdirSync(getProfileDirPath(projectDir), { recursive: true });
    writeFileSync(profilePath, serializeProfileMd(profile), "utf-8");
    return { ok: true, migrated: true, ...resultPaths, profile };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, migrated: false, ...resultPaths, error: message };
  }
}

/**
 * Updates only recognized profile fields, preserving missing optional sections.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param projectDir - Absolute project directory used for project-local state.
 * @param patch - Profile fields to replace.
 * @returns The typed result described by this helper contract.
 */
export function updateProfile(
  projectDir: string,
  patch: Record<string, unknown>,
): ProfileData | null {
  const profilePath = getProfilePath(projectDir);
  if (!existsSync(profilePath)) return null;
  const profile = parseProfileMd(readFileSync(profilePath, "utf-8"));
  if (!profile) return null;
  const editable = new Set<string>([
    ...SCALAR_KEYS,
    ...LIST_KEYS,
    ...JSON_SECTIONS.map(([key]) => key),
  ]);
  const fields = profile as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (editable.has(key)) fields[key] = value;
  }
  if (!("updatedAt" in patch)) fields.updatedAt = new Date().toISOString();
  writeFileSync(
    profilePath,
    serializeProfileMd(fields as ProfileFields),
    "utf-8",
  );
  return fields as ProfileData;
}

/**
 * Loads the project profile if `.academic-writer/profile.md` exists.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param projectDir - Absolute project directory used for project-local state.
 * @returns The typed result described by this helper contract.
 */
export function loadProfile(projectDir: string): ProfileData | null {
  const profilePath = getProfilePath(projectDir);
  if (!existsSync(profilePath)) return null;
  try {
    const raw = readFileSync(profilePath, "utf-8");
    return parseProfileMd(raw);
  } catch {
    return null;
  }
}
