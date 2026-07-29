import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { appendFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getProfilePath, loadProfile } from "../lib/profile.js";
import { summarizeRuns } from "../lib/runs.js";
import type { ProfileData } from "../lib/types.js";

/**
 * Condenses run-state details for the session dashboard.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param projectDir - Absolute project directory used for project-local state.
 * @returns A compact run count and last-run label for dashboard rendering.
 */
function runSummary(projectDir: string): {
  active: number;
  last: string | null;
} {
  const runs = summarizeRuns(projectDir);
  return {
    active: runs.active.length,
    last: runs.last
      ? `${runs.last.status}: ${runs.last.title ?? runs.last.runId}`
      : null,
  };
}

/**
 * Lifecycle reasons that should display the session dashboard.
 *
 * @remarks
 * Kept as a single module-level constant so callers do not duplicate package paths or option lists.
 */
const DASHBOARD_REASONS = new Set(["startup", "new", "resume"]);

/**
 * Returns whether this lifecycle event should display the dashboard.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param reason - Lifecycle event reason emitted by Pi.
 * @returns The typed result described by this helper contract.
 */
function shouldShowDashboard(reason: string): boolean {
  return DASHBOARD_REASONS.has(reason);
}

/**
 * Matches generated Word documents in project article folders.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param file - Filename or directory entry to test.
 * @returns The typed result described by this helper contract.
 */
function isDocx(file: string): boolean {
  return file.endsWith(".docx");
}

/**
 * Matches past articles that can seed the voice-learning flow.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param file - Filename or directory entry to test.
 * @returns The typed result described by this helper contract.
 */
function isPastArticle(file: string): boolean {
  return file.endsWith(".pdf") || isDocx(file);
}

/**
 * Counts matching files in an optional project-relative directory.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param projectDir - Absolute project directory used for project-local state.
 * @param relativeDir - Project-relative directory to inspect.
 * @param matches - Predicate that selects files or directory entries to count.
 * @returns The typed result described by this helper contract.
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
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param profile - Parsed profile data used by the caller.
 * @returns The typed result described by this helper contract.
 */
function enabledToolNames(profile: ProfileData): string[] {
  return Object.entries(profile.tools ?? {})
    .filter(([, config]) => config.enabled)
    .map(([name]) => name);
}

/**
 * Counts past source articles that have not yet been voice-mined.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param projectDir - Absolute project directory used for project-local state.
 * @param analyzedCount - Number of past articles already recorded as analyzed.
 * @returns The typed result described by this helper contract.
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
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param projectDir - Absolute project directory used for project-local state.
 * @param profile - Parsed profile data used by the caller.
 * @returns The typed result described by this helper contract.
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
    lines.push("║  → Run /skill:academic-writer-voice to update style    ║");
  }

  lines.push("╠══════════════════════════════════════════════════╣");
  lines.push("║  /skill:academic-writer-write    — Write new article   ║");
  lines.push("║  /skill:academic-writer-ideate   — Brainstorm ideas    ║");
  lines.push("║  /skill:academic-writer-research — Investigate a topic ║");
  lines.push("║  /skill:academic-writer-health   — Check integrations  ║");
  lines.push("╚══════════════════════════════════════════════════╝");
  return lines;
}

/**
 * Registers Academic Writer lifecycle notifications and session logging.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param pi - Pi extension API used to register lifecycle hooks or tools.
 */
export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (event, ctx) => {
    if (!shouldShowDashboard(event.reason)) return;

    const projectDir = process.cwd();
    const profile = loadProfile(projectDir);
    if (!profile) return;

    ctx.ui.notify(buildDashboardLines(projectDir, profile).join("\n"), "info");
  });

  pi.on("agent_settled", async (event, ctx) => {
    const projectDir = process.cwd();

    // Hard gate: only notify in academic-writer projects.
    if (!existsSync(join(projectDir, ".academic-writer", "profile.md"))) {
      return;
    }

    // macOS only — silently no-op elsewhere.
    if (process.platform !== "darwin") {
      return;
    }

    // Use execFile (not exec) — args are passed as an array to osascript,
    // never interpreted by the shell. The script string is a static literal.
    const script =
      'display notification "Task complete" with title "Academic Writer" sound name "Glass"';
    execFile("osascript", ["-e", script], { timeout: 2000 }, () => {
      // Silent — never block on notification.
    });
  });

  pi.on("session_shutdown", async (event, ctx) => {
    // Only log real session termination — "reload"/"new"/"resume"/"fork" are
    // extension-runtime teardowns for the same logical session, not the
    // "SessionEnd" the original hook logged once per Claude Code session.
    if (event.reason !== "quit") {
      return;
    }

    const projectDir = process.cwd();
    if (!existsSync(getProfilePath(projectDir))) {
      return;
    }

    const logsDir = join(projectDir, ".academic-writer", "logs");
    if (!existsSync(logsDir)) {
      return;
    }

    try {
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0];
      const timeStr = now.toISOString().split("T")[1].split(".")[0];
      const logFile = join(logsDir, `${dateStr}.log`);

      const sessionId = ctx.sessionManager.getSessionId() ?? "unknown";

      const entry = [
        "",
        `--- Session End: ${timeStr} (${sessionId}) ---`,
        `Timestamp: ${now.toISOString()}`,
        "---",
        "",
      ].join("\n");

      appendFileSync(logFile, entry, "utf-8");
    } catch {
      // Silent failure — logging should never block the session
    }
  });
}
