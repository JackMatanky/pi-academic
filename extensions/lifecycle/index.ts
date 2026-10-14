import type { ProfileData } from "../lib/types.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { errorMessage } from "../lib/fs-safe.js";
import { detectHarness } from "../lib/harness.js";
import { loadProfile } from "../lib/profile.js";
import { summarizeRuns } from "../lib/runs.js";

/**
 * Condenses run-state details for the session dashboard.
 *
 * @param projectDir - Absolute project directory used for project-local state.
 *
 * @returns A compact run count and last-run label for dashboard rendering.
 */
function runSummary(projectDir: string): RunLine {
  const runs = summarizeRuns(projectDir);

  return {
    active: runs.active.length,
    last: runs.last
      ? `${runs.last.status}: ${runs.last.title ?? runs.last.runId}`
      : null,
  };
}

/**
 * Dashboard-ready run counts.
 */
interface RunLine {
  active: number;
  last: string | null;
}

/**
 * Lifecycle reasons that should display the session dashboard.
 */
const DASHBOARD_REASONS = new Set(["startup", "new", "resume"]);

/**
 * Returns whether this lifecycle event should display the dashboard. oh-my-pi's
 * `session_start` payload has no `reason`; pi's has one.
 *
 * @param reason - Lifecycle event reason emitted by pi, if any.
 */
function shouldShowDashboard(reason: string | undefined): boolean {
  return reason === undefined || DASHBOARD_REASONS.has(reason);
}

/**
 * Matches generated Word documents in project article folders.
 *
 * @param file - Filename or directory entry to test.
 */
function isDocx(file: string): boolean {
  return file.endsWith(".docx");
}

/**
 * Matches past articles that can seed the voice-learning flow.
 *
 * @param file - Filename or directory entry to test.
 */
function isPastArticle(file: string): boolean {
  return file.endsWith(".pdf") || isDocx(file);
}

/**
 * Counts matching files in an optional project-relative directory.
 *
 * @param projectDir - Absolute project directory used for project-local state.
 * @param relativeDir - Project-relative directory to inspect.
 * @param matches - Predicate that selects files or directory entries to count.
 */
function countFiles(
  projectDir: string,
  relativeDir: string,
  matches: (file: string) => boolean,
): number {
  const dir = join(projectDir, relativeDir);

  if (!existsSync(dir)) return 0;

  try {
    return readdirSync(dir).filter(matches).length;
  } catch {
    return 0;
  }
}

/**
 * Lists enabled integrations from the parsed profile.
 *
 * @param profile - Parsed profile data used by the caller.
 */
function enabledToolNames(profile: ProfileData): string[] {
  return Object.entries(profile.tools ?? {})
    .filter(([, config]) => config.enabled)
    .map(([name]) => name);
}

/**
 * Counts past source articles that have not yet been voice-mined.
 *
 * @param projectDir - Absolute project directory used for project-local state.
 * @param analyzedCount - Number of past articles already recorded as analyzed.
 */
function unanalyzedPastArticleCount(
  projectDir: string,
  analyzedCount: number,
): number {
  const total = countFiles(projectDir, "past-articles", isPastArticle);

  return Math.max(0, total - analyzedCount);
}

/**
 * East Asian wide, fullwidth, and emoji-presentation characters, which occupy
 * two terminal cells.
 */
const WIDE_CHAR =
  /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6\u{1F300}-\u{1F64F}\u{1F900}-\u{1F9FF}\u{20000}-\u{3FFFD}]/u;

const COMBINING_CHAR = /\p{M}/u;

/**
 * Truncates `text` to at most `width` terminal cells at code-point boundaries
 * (never mid-grapheme, never mid-surrogate) and pads with spaces to exactly
 * `width` cells, so box borders stay aligned for any script.
 *
 * @param text - Row content between the borders.
 * @param width - Terminal cells available.
 */
function fitCell(text: string, width: number): string {
  let out = "";
  let used = 0;

  for (const char of text) {
    const charWidth = COMBINING_CHAR.test(char)
      ? 0
      : WIDE_CHAR.test(char)
        ? 2
        : 1;

    if (used + charWidth > width) break;

    out += char;
    used += charWidth;
  }

  return out + " ".repeat(width - used);
}

/**
 * Interior width, in terminal cells, between the dashboard's `║` borders.
 */
const DASHBOARD_INNER = 48;

/**
 * Builds the fixed-width session-start dashboard shown to researchers.
 *
 * @param projectDir - Absolute project directory used for project-local state.
 * @param profile - Parsed profile data used for the caller.
 */
function buildDashboardLines(
  projectDir: string,
  profile: ProfileData,
): string[] {
  const border = (left: string, right: string): string =>
    `${left}${"═".repeat(DASHBOARD_INNER)}${right}`;

  const row = (text: string): string => `║${fitCell(text, DASHBOARD_INNER)}║`;

  const lines: string[] = [
    "",
    border("╔", "╗"),
    row("         ACADEMIC WRITER — SESSION START"),
    border("╠", "╣"),
    row(`  Field: ${profile.fieldOfStudy ?? "Not set"}`),
    row(`  Language: ${profile.targetLanguage ?? "Not set"}`),
    row(`  Citation: ${profile.citationStyle ?? "Not set"}`),
    row(`  Fingerprint: ${profile.styleFingerprint ? "Loaded" : "Missing"}`),
    row(`  Articles: ${String(countFiles(projectDir, "articles", isDocx))}`),
    row(`  Sources indexed: ${String(profile.sources?.length ?? 0)}`),
  ];

  const tools = enabledToolNames(profile);

  lines.push(row(`  Tools: ${tools.length > 0 ? tools.join(", ") : "None"}`));

  if (profile.tools?.zotero?.enabled && profile.tools.zotero.collection) {
    const scope =
      profile.tools.zotero.collection.name ??
      profile.tools.zotero.collection.key ??
      "configured";

    lines.push(row(`  Zotero collection: ${scope}`));
  }

  if (profile.tools?.notebooklm?.enabled && profile.tools.notebooklm.notebook) {
    const scope =
      profile.tools.notebooklm.notebook.name ??
      profile.tools.notebooklm.notebook.id ??
      "configured";

    lines.push(row(`  NotebookLM: ${scope}`));
  }

  const runs = runSummary(projectDir);

  lines.push(row(`  Active runs: ${String(runs.active)}`));

  if (runs.last) lines.push(row(`  Last run: ${runs.last}`));

  if (existsSync(join(projectDir, ".academic-writer", "research-brief.md")))
    lines.push(row("  Research brief: Available"));

  const unanalyzed = unanalyzedPastArticleCount(
    projectDir,
    profile.analyzedArticles?.length ?? 0,
  );

  if (unanalyzed > 0) {
    lines.push(row(`  New past articles: ${String(unanalyzed)}`));
    lines.push(row("  → Run /skill:academic-voice to update style"));
  }

  lines.push(border("╠", "╣"));
  lines.push(row("  /skill:academic-write          — Write / frame"));
  lines.push(row("  /skill:academic-edit           — Edit articles"));
  lines.push(row("  /skill:academic-research       — Research topic"));
  lines.push(row("  /skill:academic-health         — Check project"));
  lines.push(border("╚", "╝"));

  return lines;
}

/**
 * Packages pi does not load by itself; their absence breaks dispatch and web
 * research. `mcp` is not checked: its proxy tool may be absent when only direct
 * tools are configured.
 */
const COMPANIONS = [
  ["subagent", "pi-subagents"],
  ["web_search", "pi-web-access"],
] as const;

/**
 * Registers the Academic Writer session dashboard (and, on pi, a warning about
 * missing companion packages).
 *
 * @param pi - Pi extension API used to register lifecycle hooks or tools.
 */
export default function (pi: ExtensionAPI) {
  const harness = detectHarness(pi);

  pi.on("session_start", async (event: { reason?: string }, ctx) => {
    // hasUI is false for headless, print and subagent sessions on both harnesses.
    if (!ctx.hasUI || !shouldShowDashboard(event.reason)) return;

    const projectDir = ctx.cwd;
    let profile: ProfileData | null;

    try {
      profile = loadProfile(projectDir);
    } catch (error) {
      ctx.ui.notify(
        `Academic Writer profile is unreadable: ${errorMessage(error)}`,
        "warning",
      );

      return;
    }

    if (!profile) return;

    ctx.ui.notify(buildDashboardLines(projectDir, profile).join("\n"), "info");

    if (harness !== "pi") return;

    const present = new Set(pi.getAllTools().map((tool) => tool.name));

    const missing = COMPANIONS.flatMap(([tool, pkg]) =>
      present.has(tool) ? [] : [pkg],
    );

    if (missing.length > 0) {
      ctx.ui.notify(
        `Missing companion package(s): ${missing.join(", ")}. Install with: ${missing.map((pkg) => `pi install npm:${pkg}`).join("; ")}`,
        "warning",
      );
    }
  });
}
