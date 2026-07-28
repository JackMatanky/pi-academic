import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProfileData } from "./types.js";

const PROFILE_DIR = ".academic-helper";
const PROFILE_RELATIVE_PATH = ".academic-helper/profile.md";

/** Returns the project-local `.academic-helper` directory path. */
export function getProfileDirPath(projectDir: string): string {
  return join(projectDir, PROFILE_DIR);
}

/** Returns the project-local Academic Writer profile markdown path. */
export function getProfilePath(projectDir: string): string {
  return join(projectDir, PROFILE_RELATIVE_PATH);
}

type ProfileFields = ProfileData & Record<string, unknown>;
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
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
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

/** Loads the project profile if `.academic-helper/profile.md` exists. */
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
