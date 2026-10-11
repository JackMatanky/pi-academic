import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { errorMessage, writeFileAtomic } from "./fs-safe.js";
import type { ProfileData } from "./types.js";

/** Project-local directory containing Academic Writer runtime data. */
const PROFILE_DIR = ".academic-writer";

/** Project-relative markdown profile path. */
const PROFILE_RELATIVE_PATH = ".academic-writer/profile.md";

/** Old project-relative JSON profile path migrated on first load. */
const JSON_PROFILE_RELATIVE_PATH = ".academic-writer/profile.json";

/**
 * Returns the project-local `.academic-writer` directory path.
 *
 * @param projectDir - Absolute project directory used for project-local state.
 */
export function getProfileDirPath(projectDir: string): string {
  return join(projectDir, PROFILE_DIR);
}

/**
 * Returns the project-local Academic Writer profile markdown path.
 *
 * @param projectDir - Absolute project directory used for project-local state.
 */
export function getProfilePath(projectDir: string): string {
  return join(projectDir, PROFILE_RELATIVE_PATH);
}

/** Profile data plus extension fields preserved during markdown serialization. */
type ProfileFields = ProfileData & Record<string, unknown>;

/** Result payload for one JSON-to-markdown profile migration attempt. */
export interface ProfileMigrationResult {
  ok: boolean;
  migrated: boolean;
  jsonPath: string;
  profilePath: string;
  reason?: string;
  error?: string;
  profile?: ProfileData;
}

/** Scalar profile frontmatter fields serialized directly as YAML values. */
const SCALAR_KEYS = [
  "fieldOfStudy",
  "citationStyle",
  "targetLanguage",
  "updatedAt",
  "createdAt",
] as const;

/** Array profile frontmatter fields serialized as YAML lists. */
const LIST_KEYS = ["abstractLanguages", "analyzedArticles"] as const;

/** JSON profile sections serialized under stable markdown headings. */
const JSON_SECTIONS = [
  ["tools", "Tools"],
  ["outputFormatPreferences", "Output Format Preferences"],
  ["styleFingerprint", "Style Fingerprint"],
  ["articleStructure", "Article Structure"],
  ["sources", "Sources"],
] as const;

/** Normalized markdown heading lookup for JSON-backed profile sections. */
const JSON_SECTION_KEYS = Object.fromEntries(
  JSON_SECTIONS.map(([key, heading]) => [
    heading.toLowerCase().replace(/\s+/g, ""),
    key,
  ]),
) as Record<string, keyof ProfileData>;

/**
 * Parses the profile's deliberately small YAML-frontmatter subset.
 *
 * @param raw - Raw profile markdown content.
 * @param fields - Mutable parsed profile fields accumulator.
 */
function parseFrontmatter(raw: string, fields: ProfileFields): void {
  const block = /(?:^|\n)---\n([\s\S]*?)\n---/.exec(raw)?.[1];

  if (block === undefined) return;
  const lines = block.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const scalar = /^([\w-]+): (.+)$/.exec(line);

    if (scalar) {
      fields[scalar[1] ?? ""] = parseScalar((scalar[2] ?? "").trim());
      continue;
    }

    const listKey = /^([\w-]+):\s*$/.exec(line)?.[1];

    if (listKey) {
      const items: string[] = [];

      while ((lines[i + 1] ?? "").startsWith("  - ")) {
        i += 1;
        items.push((lines[i] ?? "").slice(4));
      }

      fields[listKey] = items;
    }
  }
}

/** Reads one frontmatter value: `null`, `[]`, a JSON-quoted string, or bare text. */
function parseScalar(value: string): unknown {
  if (value === "null") return null;

  if (value === "[]") return [];

  if (value.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(value);

      if (typeof parsed === "string") return parsed;
    } catch {
      // not valid JSON: keep the text as written
    }
  }

  return value;
}

/**
 * Stores a recognized JSON profile section under its canonical profile key.
 *
 * @param heading - Markdown heading naming a JSON-backed profile section.
 * @param parsed - Parsed JSON section value.
 * @param fields - Mutable parsed profile fields accumulator.
 */
function assignJsonSection(
  title: string,
  parsed: unknown,
  fields: ProfileFields,
): void {
  const key = JSON_SECTION_KEYS[title.toLowerCase().replace(/\s+/g, "")];

  if (key) {
    (fields as Record<string, unknown>)[key] = parsed;

    return;
  }

  const extra = fields.extraSections;
  fields.extraSections = {
    ...(typeof extra === "object" && extra !== null ? extra : {}),
    [title]: parsed,
  };
}

/**
 * Parses profile JSON sections headed by `## <Name>`.
 *
 * @param raw - Raw profile markdown content.
 * @param fields - Mutable parsed profile fields accumulator.
 */
function parseJsonSections(raw: string, fields: ProfileFields): void {
  const sectionRe = /^## ([^\n]+)\n+```json\n([\s\S]*?)\n```/gm;

  for (const match of raw.matchAll(sectionRe)) {
    const title = (match[1] ?? "").trim();

    try {
      assignJsonSection(title, JSON.parse(match[2] ?? "") as unknown, fields);
    } catch (error) {
      throw new Error(
        `Profile section "${title}" has invalid JSON: ${errorMessage(error)}`,
      );
    }
  }
}

/**
 * Parses a profile markdown document.
 *
 * @throws When a JSON section is malformed, so a corrupt profile is never mistaken for a missing one.
 */
export function parseProfileMd(raw: string): ProfileFields {
  const text = raw.replace(/\r\n?/g, "\n");
  const profile: ProfileFields = {};
  parseFrontmatter(text, profile);
  parseJsonSections(text, profile);

  return profile;
}

/**
 * Serializes the known Academic Writer profile fields back to markdown.
 *
 * @param profile - Parsed profile data used by the caller.
 */
export function serializeProfileMd(profile: ProfileFields): string {
  const lines = ["# Academic Writer Profile", "", "---"];

  const writeList = (key: string, value: unknown[]) => {
    if (value.length === 0) {
      lines.push(`${key}: []`);

      return;
    }

    lines.push(`${key}:`);

    for (const item of value) lines.push(`  - ${String(item)}`);
  };

  for (const key of SCALAR_KEYS) {
    const value = profile[key];

    if (value !== undefined && value !== null)
      lines.push(`${key}: ${formatScalar(String(value))}`);
  }

  for (const key of LIST_KEYS) {
    const value = profile[key];
    writeList(key, Array.isArray(value) ? value : []);
  }

  // Frontmatter keys this version does not know are carried through unchanged.
  for (const [key, value] of Object.entries(profile)) {
    if (RESERVED_KEYS.has(key) || value === undefined || value === null)
      continue;

    if (Array.isArray(value)) writeList(key, value);
    else if (typeof value !== "object")
      lines.push(`${key}: ${formatScalar(String(value))}`);
  }

  lines.push("---", "");

  const writeSection = (heading: string, value: unknown) =>
    lines.push(
      `## ${heading}`,
      "",
      "```json",
      JSON.stringify(value, null, 2),
      "```",
      "",
    );

  for (const [key, heading] of JSON_SECTIONS) {
    const value = profile[key];

    if (value !== undefined && value !== null) writeSection(heading, value);
  }

  const extra = profile.extraSections;

  const extraSections =
    typeof extra === "object" && extra !== null ? extra : {};

  for (const [heading, value] of Object.entries(extraSections))
    writeSection(heading, value);

  return lines.join("\n");
}

const RESERVED_KEYS = new Set<string>([
  ...SCALAR_KEYS,
  ...LIST_KEYS,
  ...JSON_SECTIONS.map(([key]) => key),
  "extraSections",
]);

/** Quotes scalars that would not survive the line-based parser unchanged. */
function formatScalar(text: string): string {
  return /[\r\n]|^\s|\s$|^"|^$|^(?:null|\[\])$/.test(text)
    ? JSON.stringify(text)
    : text;
}

/**
 * Migrates the old JSON profile location into the markdown profile format once.
 *
 * @param projectDir - Absolute project directory used for project-local state.
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
    writeFileAtomic(profilePath, serializeProfileMd(profile));

    return { ok: true, migrated: true, ...resultPaths, profile };
  } catch (error) {
    return {
      ok: false,
      migrated: false,
      ...resultPaths,
      error: errorMessage(error),
    };
  }
}

/**
 * Updates only recognized profile fields, preserving missing optional sections.
 *
 * @param projectDir - Absolute project directory used for project-local state.
 * @param patch - Profile fields to replace.
 */
export function updateProfile(
  projectDir: string,
  patch: Record<string, unknown>,
): ProfileData | null {
  const profilePath = getProfilePath(projectDir);

  if (!existsSync(profilePath)) return null;

  const fields: ProfileFields = parseProfileMd(
    readFileSync(profilePath, "utf-8"),
  );

  for (const [key, value] of Object.entries(patch)) {
    if (!EDITABLE_KEYS.has(key)) continue;
    assertPatchValue(key, value);
    fields[key] = value;
  }

  if (!("updatedAt" in patch)) fields.updatedAt = new Date().toISOString();
  writeFileAtomic(profilePath, serializeProfileMd(fields));

  return fields;
}

const EDITABLE_KEYS = new Set<string>([
  ...SCALAR_KEYS,
  ...LIST_KEYS,
  ...JSON_SECTIONS.map(([key]) => key),
]);

/** Rejects patch values the serializer could not round-trip. */
function assertPatchValue(key: string, value: unknown): void {
  const isObject = (v: unknown) =>
    typeof v === "object" && v !== null && !Array.isArray(v);

  if ((SCALAR_KEYS as readonly string[]).includes(key)) {
    if (typeof value !== "string" && value !== null)
      throw new Error(`Profile field ${key} must be a string or null`);
  } else if ((LIST_KEYS as readonly string[]).includes(key)) {
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string"))
      throw new Error(`Profile field ${key} must be an array of strings`);
  } else if (value !== null && !isObject(value)) {
    throw new Error(`Profile section ${key} must be an object or null`);
  }
}

/**
 * Loads the project profile if `.academic-writer/profile.md` exists.
 *
 * @param projectDir - Absolute project directory used for project-local state.
 */
export function loadProfile(projectDir: string): ProfileData | null {
  const profilePath = getProfilePath(projectDir);

  if (!existsSync(profilePath)) return null;

  return parseProfileMd(readFileSync(profilePath, "utf-8"));
}
