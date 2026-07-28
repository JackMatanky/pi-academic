import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProfileData } from "./types.js";

const PROFILE_DIR = ".academic-helper";
const PROFILE_RELATIVE_PATH = ".academic-helper/profile.md";

export function getProfileDirPath(projectDir: string): string {
  return join(projectDir, PROFILE_DIR);
}

export function getProfilePath(projectDir: string): string {
  return join(projectDir, PROFILE_RELATIVE_PATH);
}

type ProfileFields = ProfileData & Record<string, unknown>;
const JSON_SECTION_KEYS: Record<string, string> = {
  tools: "tools",
  stylefingerprint: "styleFingerprint",
  sources: "sources",
  articlestructure: "articleStructure",
  outputformatpreferences: "outputFormatPreferences",
};


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

function assignJsonSection(heading: string, parsed: unknown, fields: ProfileFields): void {
  const key = JSON_SECTION_KEYS[heading];
  if (key) fields[key] = parsed;
}

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

function parseProfileMd(raw: string): ProfileData | null {
  try {
    const profile: ProfileFields = {};
    parseFrontmatter(raw, profile);
    parseJsonSections(raw, profile);
    return profile;
  } catch {
    return null;
  }
}

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
