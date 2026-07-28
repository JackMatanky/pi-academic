import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProfileData } from "./types.js";

const PROFILE_DIR = ".academic-writer";
const PROFILE_RELATIVE_PATH = ".academic-writer/profile.md";
const JSON_PROFILE_RELATIVE_PATH = ".academic-writer/profile.json";

/** Returns the project-local `.academic-writer` directory path. */
export function getProfileDirPath(projectDir: string): string {
  return join(projectDir, PROFILE_DIR);
}

/** Returns the project-local Academic Writer profile markdown path. */
export function getProfilePath(projectDir: string): string {
  return join(projectDir, PROFILE_RELATIVE_PATH);
}

type ProfileFields = ProfileData & Record<string, unknown>;
export interface ProfileMigrationResult {
  ok: boolean;
  migrated: boolean;
  jsonPath: string;
  profilePath: string;
  reason?: string;
  error?: string;
  profile?: ProfileData;
}
const SCALAR_KEYS = [
  "fieldOfStudy",
  "citationStyle",
  "targetLanguage",
  "updatedAt",
  "createdAt",
] as const;
const LIST_KEYS = ["abstractLanguages", "analyzedArticles"] as const;
const JSON_SECTIONS = [
  ["tools", "Tools"],
  ["outputFormatPreferences", "Output Format Preferences"],
  ["styleFingerprint", "Style Fingerprint"],
  ["articleStructure", "Article Structure"],
  ["sources", "Sources"],
] as const;
const JSON_SECTION_KEYS = Object.fromEntries(
  JSON_SECTIONS.map(([key, heading]) => [
    heading.toLowerCase().replace(/\s+/g, ""),
    key,
  ]),
) as Record<string, keyof ProfileData>;

/** Parses the profile's deliberately small YAML-frontmatter subset. */
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

/** Stores a recognized JSON profile section under its canonical profile key. */
function assignJsonSection(
  heading: string,
  parsed: unknown,
  fields: ProfileFields,
): void {
  const key = JSON_SECTION_KEYS[heading];
  if (key) (fields as Record<string, unknown>)[key] = parsed;
}

/** Parses profile JSON sections headed by `## <Name>`. */
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

/** Parses a profile markdown document, returning null only for unreadable parser failures. */
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

/** Serializes the known Academic Writer profile fields back to markdown. */
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

/** Migrates the old JSON profile location into the markdown profile format once. */
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

/** Updates only recognized profile fields, preserving missing optional sections. */
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

/** Loads the project profile if `.academic-writer/profile.md` exists. */
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
