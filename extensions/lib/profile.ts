import type { JsonObject, JsonValue } from "./schema.js";
import type { ProfileData } from "./types.js";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Type } from "typebox";

import { errorMessage, writeFileAtomic } from "./fs-safe.js";
import {
  isValid,
  JsonObjectSchema,
  JsonValueSchema,
  parseJsonText,
  parseWith,
} from "./schema.js";
import { ProfileDataSchema } from "./types.js";

const PROFILE_DIR = ".academic-writer";

const PROFILE_RELATIVE_PATH = ".academic-writer/profile.md";

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

/**
 * A frontmatter value: a line of text or a list of lines.
 */
export type FrontmatterValue = string | string[];

const FrontmatterValueSchema = Type.Union([
  Type.String(),
  Type.Array(Type.String()),
]);

const StringSchema = Type.String();

/**
 * A profile: the fields this package reads, plus the frontmatter keys and JSON
 * sections it does not know, which are carried through unchanged.
 */
export interface Profile extends ProfileData {
  extraFrontmatter?: Record<string, FrontmatterValue>;
  extraSections?: Record<string, JsonValue>;
}

/**
 * Result payload for one JSON-to-markdown profile migration attempt.
 */
export interface ProfileMigrationResult {
  ok: boolean;
  migrated: boolean;
  jsonPath: string;
  profilePath: string;
  reason?: string;
  error?: string;
  profile?: Profile;
}

/**
 * Scalar profile fields written as `key: value` frontmatter lines.
 */
const SCALAR_KEYS = [
  "fieldOfStudy",
  "citationStyle",
  "targetLanguage",
  "updatedAt",
  "createdAt",
] as const;

/**
 * List profile fields written as frontmatter lists.
 */
const LIST_KEYS = ["abstractLanguages", "analyzedArticles"] as const;

/**
 * JSON profile sections and the headings they are written under.
 */
const JSON_SECTIONS = [
  ["tools", "Tools"],
  ["outputFormatPreferences", "Output Format Preferences"],
  ["styleFingerprint", "Style Fingerprint"],
  ["articleStructure", "Article Structure"],
  ["sources", "Sources"],
] as const;

const FRONTMATTER_KEYS: readonly string[] = [...SCALAR_KEYS, ...LIST_KEYS];

const SECTION_KEYS: readonly string[] = JSON_SECTIONS.map(([key]) => key);

const EDITABLE_KEYS: readonly string[] = [...FRONTMATTER_KEYS, ...SECTION_KEYS];

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, "");
}

const sectionKeyByTitle = new Map<string, string>(
  JSON_SECTIONS.map(([key, heading]) => [normalizeTitle(heading), key]),
);

/**
 * The raw pieces of a profile before they are validated.
 */
interface ProfileParts {
  /**
   * Values of the keys this package knows, still unvalidated.
   */
  known: JsonObject;
  extraFrontmatter: Record<string, FrontmatterValue>;
  extraSections: Record<string, JsonValue>;
}

/**
 * Reads one frontmatter value: `null`, `[]`, a JSON-quoted string, or text.
 */
function parseScalar(value: string): FrontmatterValue | null {
  if (value === "null") return null;

  if (value === "[]") return [];

  if (value.startsWith('"')) {
    try {
      const parsed = parseJsonText(value);

      if (isValid(StringSchema, parsed)) return parsed;
    } catch {
      // not valid JSON: keep the text as written
    }
  }

  return value;
}

/**
 * Parses the profile's deliberately small YAML-frontmatter subset.
 */
function parseFrontmatter(text: string): Map<string, FrontmatterValue | null> {
  const values = new Map<string, FrontmatterValue | null>();
  const block = /(?:^|\n)---\n([\s\S]*?)\n---/.exec(text)?.[1];

  if (block === undefined) return values;

  const lines = block.split("\n");

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    const scalar = /^([\w-]+): (.+)$/.exec(line);

    if (scalar?.[1]) {
      values.set(scalar[1], parseScalar((scalar[2] ?? "").trim()));
      continue;
    }

    const listKey = /^([\w-]+):\s*$/.exec(line)?.[1];

    if (!listKey) continue;

    const items: string[] = [];

    while ((lines[index + 1] ?? "").startsWith("  - ")) {
      index += 1;
      items.push((lines[index] ?? "").slice(4));
    }

    values.set(listKey, items);
  }

  return values;
}

/**
 * Splits profile markdown into frontmatter and JSON sections.
 *
 * @throws When a JSON section is malformed, so a corrupt profile is never
 *   mistaken for a missing one.
 */
function splitProfileText(raw: string): ProfileParts {
  const text = raw.replace(/\r\n?/g, "\n");

  const parts: ProfileParts = {
    known: {},
    extraFrontmatter: {},
    extraSections: {},
  };

  for (const [key, value] of parseFrontmatter(text)) {
    if (value === null) continue;

    if (FRONTMATTER_KEYS.includes(key)) parts.known[key] = value;
    else parts.extraFrontmatter[key] = value;
  }

  const sections = text.matchAll(/^## ([^\n]+)\n+```json\n([\s\S]*?)\n```/gm);

  for (const match of sections) {
    const title = (match[1] ?? "").trim();

    try {
      const value = parseWith(
        JsonValueSchema,
        parseJsonText(match[2] ?? ""),
        title,
      );

      const key = sectionKeyByTitle.get(normalizeTitle(title));

      if (key) parts.known[key] = value;
      else parts.extraSections[title] = value;
    } catch (cause) {
      throw new Error(
        `Profile section "${title}" has invalid JSON: ${errorMessage(cause)}`,
      );
    }
  }

  return parts;
}

/**
 * Splits an old-format JSON profile object the same way: unknown keys that fit
 * a frontmatter line stay there, the rest become JSON sections.
 */
function splitProfileObject(object: JsonObject): ProfileParts {
  const parts: ProfileParts = {
    known: {},
    extraFrontmatter: {},
    extraSections: {},
  };

  for (const [key, value] of Object.entries(object)) {
    if (EDITABLE_KEYS.includes(key)) parts.known[key] = value;
    else if (isValid(FrontmatterValueSchema, value))
      parts.extraFrontmatter[key] = value;
    else parts.extraSections[key] = value;
  }

  return parts;
}

/**
 * Validates the known fields and attaches the unknown ones.
 */
function assembleProfile(parts: ProfileParts): Profile {
  const profile: Profile = parseWith(ProfileDataSchema, parts.known, "profile");

  if (Object.keys(parts.extraFrontmatter).length > 0)
    profile.extraFrontmatter = parts.extraFrontmatter;

  if (Object.keys(parts.extraSections).length > 0)
    profile.extraSections = parts.extraSections;

  return profile;
}

/**
 * Parses a profile markdown document.
 *
 * @throws When a JSON section is malformed or a field has the wrong type.
 */
export function parseProfileMd(raw: string): Profile {
  return assembleProfile(splitProfileText(raw));
}

/**
 * Quotes scalars that would not survive the line-based parser unchanged.
 */
function formatScalar(text: string): string {
  return /[\r\n]|^\s|\s$|^"|^$|^(?:null|\[\])$/.test(text)
    ? JSON.stringify(text)
    : text;
}

/**
 * Serializes a profile back to markdown.
 */
export function serializeProfileMd(profile: Profile): string {
  const lines = ["# Academic Writer Profile", "", "---"];

  const writeList = (key: string, items: string[]) => {
    if (items.length === 0) {
      lines.push(`${key}: []`);

      return;
    }

    lines.push(`${key}:`);

    for (const item of items) lines.push(`  - ${item}`);
  };

  for (const key of SCALAR_KEYS) {
    const value = profile[key];

    if (value !== undefined) lines.push(`${key}: ${formatScalar(value)}`);
  }

  for (const key of LIST_KEYS) writeList(key, profile[key] ?? []);

  for (const [key, value] of Object.entries(profile.extraFrontmatter ?? {})) {
    if (isValid(StringSchema, value))
      lines.push(`${key}: ${formatScalar(value)}`);
    else writeList(key, value);
  }

  lines.push("---", "");

  const writeSection = (heading: string, value: JsonValue) =>
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

    if (value !== undefined) writeSection(heading, value);
  }

  for (const [heading, value] of Object.entries(profile.extraSections ?? {}))
    writeSection(heading, value);

  return lines.join("\n");
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
    const parsed = parseJsonText(readFileSync(jsonPath, "utf-8"));

    if (!isValid(JsonObjectSchema, parsed)) {
      return {
        ok: false,
        migrated: false,
        ...resultPaths,
        error: "JSON profile must be a JSON object",
      };
    }

    const profile = assembleProfile(splitProfileObject(parsed));

    writeFileAtomic(profilePath, serializeProfileMd(profile));

    return { ok: true, migrated: true, ...resultPaths, profile };
  } catch (cause) {
    return {
      ok: false,
      migrated: false,
      ...resultPaths,
      error: errorMessage(cause),
    };
  }
}

/**
 * Updates only recognized profile fields, preserving everything else. A `null`
 * value removes a field.
 *
 * @param projectDir - Absolute project directory used for project-local state.
 * @param patch - Profile fields to replace.
 *
 * @returns The updated profile, or null when there is no profile.
 * @throws When the patched profile would not be valid.
 */
export function updateProfile(
  projectDir: string,
  patch: JsonObject,
): Profile | null {
  const profilePath = getProfilePath(projectDir);

  if (!existsSync(profilePath)) return null;

  const parts = splitProfileText(readFileSync(profilePath, "utf-8"));

  for (const key of EDITABLE_KEYS) {
    const value = patch[key];

    if (value === undefined) continue;

    if (value === null) delete parts.known[key];
    else parts.known[key] = value;
  }

  if (patch.updatedAt === undefined)
    parts.known.updatedAt = new Date().toISOString();

  const profile = assembleProfile(parts);

  writeFileAtomic(profilePath, serializeProfileMd(profile));

  return profile;
}

/**
 * Loads the project profile if `.academic-writer/profile.md` exists.
 *
 * @param projectDir - Absolute project directory used for project-local state.
 * @throws When the profile exists but cannot be parsed.
 */
export function loadProfile(projectDir: string): Profile | null {
  const profilePath = getProfilePath(projectDir);

  if (!existsSync(profilePath)) return null;

  return parseProfileMd(readFileSync(profilePath, "utf-8"));
}
