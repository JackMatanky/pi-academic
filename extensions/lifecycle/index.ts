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
 * Builds the fixed-width session-start dashboard shown to researchers.
 *
 * @param projectDir - Absolute project directory used for project-local state.
 * @param profile - Parsed profile data used by the caller.
 */
function buildDashboardLines(
  projectDir: string,
  profile: ProfileData,
): string[] {
  const lines: string[] = [
    "",
    "╔══════════════════════════════════════════════════╗",
    "║         ACADEMIC WRITER — SESSION START          ║",
    "╠══════════════════════════════════════════════════╣",
    `║  Field: ${(profile.fieldOfStudy ?? "Not set").padEnd(38)}║`,
    `║  Language: ${(profile.targetLanguage ?? "Not set").padEnd(36)}║`,
    `║  Citation: ${(profile.citationStyle ?? "Not set").padEnd(36)}║`,
    `║  Fingerprint: ${(profile.styleFingerprint ? "Loaded" : "Missing").padEnd(33)}║`,
    `║  Articles: ${String(countFiles(projectDir, "articles", isDocx)).padEnd(36)}║`,
    `║  Sources indexed: ${String(profile.sources?.length ?? 0).padEnd(29)}║`,
  ];

  const tools = enabledToolNames(profile);
  lines.push(
    `║  Tools: ${(tools.length > 0 ? tools.join(", ") : "None").substring(0, 38).padEnd(38)}║`,
  );

  if (profile.tools?.zotero?.enabled && profile.tools.zotero.collection) {
    const scope =
      profile.tools.zotero.collection.name ??
      profile.tools.zotero.collection.key ??
      "configured";

    lines.push(`║  Zotero collection: ${scope.substring(0, 29).padEnd(29)}║`);
  }

  if (profile.tools?.notebooklm?.enabled && profile.tools.notebooklm.notebook) {
    const scope =
      profile.tools.notebooklm.notebook.name ??
      profile.tools.notebooklm.notebook.id ??
      "configured";

    lines.push(`║  NotebookLM: ${scope.substring(0, 36).padEnd(36)}║`);
  }

  const runs = runSummary(projectDir);
  lines.push(`║  Active runs: ${String(runs.active).padEnd(32)}║`);

  if (runs.last)
    lines.push(`║  Last run: ${runs.last.substring(0, 36).padEnd(36)}║`);

  if (existsSync(join(projectDir, ".academic-writer", "research-brief.md"))) {
    lines.push("║  Research brief: Available                       ║");
  }

  const unanalyzed = unanalyzedPastArticleCount(
    projectDir,
    profile.analyzedArticles?.length ?? 0,
  );

  if (unanalyzed > 0) {
    lines.push(`║  New past articles: ${String(unanalyzed).padEnd(27)}║`);
    lines.push("║  → Run /skill:academic-voice to update style    ║");
  }

  lines.push("╠══════════════════════════════════════════════════╣");
  lines.push("║  /skill:academic-write          — Write / frame  ║");
  lines.push("║  /skill:academic-edit           — Edit articles  ║");
  lines.push("║  /skill:academic-research       — Research topic ║");
  lines.push("║  /skill:academic-health         — Check project  ║");
  lines.push("╚══════════════════════════════════════════════════╝");

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
