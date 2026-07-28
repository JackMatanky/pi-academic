import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadProfile, getProfilePath } from "../lib/profile.js";
import { existsSync, readdirSync, appendFileSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";

function readRun(path: string): { runId?: unknown; title?: unknown; status?: unknown; updatedAt?: unknown } {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as { runId?: unknown; title?: unknown; status?: unknown; updatedAt?: unknown })
      : {};
  } catch {
    return {};
  }
}

function runSummary(projectDir: string): { active: number; last: string | null } {
  const runsDir = join(projectDir, ".academic-helper", "runs");
  if (!existsSync(runsDir)) return { active: 0, last: null };
  try {
    const runs = readdirSync(runsDir)
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => {
        const path = join(runsDir, entry);
        const data = readRun(path);
        const status = typeof data.status === "string" ? data.status : "unknown";
        const runId = typeof data.runId === "string" ? data.runId : entry.replace(/\.json$/, "");
        const title = typeof data.title === "string" ? data.title : runId;
        return { status, title, mtimeMs: statSync(path).mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    const active = runs.filter((run) => ["planned", "running", "blocked"].includes(run.status)).length;
    const lastRun = runs[0];
    return {
      active,
      last: lastRun ? `${lastRun.status}: ${lastRun.title}` : null,
    };
  } catch {
    return { active: 0, last: null };
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (event, ctx) => {
    if (
      event.reason !== "startup" &&
      event.reason !== "new" &&
      event.reason !== "resume"
    ) {
      return;
    }

    const projectDir = process.cwd();
    const profile = loadProfile(projectDir);

    if (!profile) {
      return;
    }

    const lines: string[] = [];
    lines.push("");
    lines.push("╔══════════════════════════════════════════════════╗");
    lines.push("║         ACADEMIC WRITER — SESSION START          ║");
    lines.push("╠══════════════════════════════════════════════════╣");

    // Profile status
    lines.push(`║  Field: ${(profile.fieldOfStudy ?? "Not set").padEnd(38)}║`);
    lines.push(
      `║  Language: ${(profile.targetLanguage ?? "Not set").padEnd(36)}║`,
    );
    lines.push(
      `║  Citation: ${(profile.citationStyle ?? "Not set").padEnd(36)}║`,
    );
    lines.push(
      `║  Fingerprint: ${(profile.styleFingerprint ? "Loaded" : "Missing").padEnd(33)}║`,
    );

    // Articles count
    const articlesDir = join(projectDir, "articles");
    let articleCount = 0;
    if (existsSync(articlesDir)) {
      try {
        const files = readdirSync(articlesDir);
        articleCount = files.filter((f) => f.endsWith(".docx")).length;
      } catch {
        // ignore
      }
    }
    lines.push(`║  Articles: ${String(articleCount).padEnd(36)}║`);

    // Source count
    const sourceCount = profile.sources?.length ?? 0;
    lines.push(`║  Sources indexed: ${String(sourceCount).padEnd(29)}║`);

    // Tools status
    const tools = profile.tools ?? {};
    const enabledTools: string[] = [];
    for (const [name, config] of Object.entries(tools)) {
      if (
        config &&
        typeof config === "object" &&
        "enabled" in config &&
        config.enabled
      ) {
        enabledTools.push(name);
      }
    }
    lines.push(
      `║  Tools: ${(enabledTools.length > 0 ? enabledTools.join(", ") : "None").substring(0, 38).padEnd(38)}║`,
    );

    // Run state
    const runs = runSummary(projectDir);
    lines.push(`║  Active runs: ${String(runs.active).padEnd(32)}║`);
    if (runs.last) {
      lines.push(`║  Last run: ${runs.last.substring(0, 36).padEnd(36)}║`);
    }

    // Research brief
    const briefPath = join(projectDir, ".academic-helper", "research-brief.md");
    if (existsSync(briefPath)) {
      lines.push(`║  Research brief: Available                       ║`);
    }

    // Past articles for learning
    const pastDir = join(projectDir, "past-articles");
    if (existsSync(pastDir)) {
      try {
        const pastFiles = readdirSync(pastDir);
        const analyzed = profile.analyzedArticles?.length ?? 0;
        const total = pastFiles.filter(
          (f) => f.endsWith(".pdf") || f.endsWith(".docx"),
        ).length;
        const unanalyzed = total - analyzed;
        if (unanalyzed > 0) {
          lines.push(`║  New past articles: ${String(unanalyzed).padEnd(27)}║`);
          lines.push(
            `║  → Run /skill:academic-writer-voice to update style    ║`,
          );
        }
      } catch {
        // ignore
      }
    }

    lines.push("╠══════════════════════════════════════════════════╣");
    lines.push("║  /skill:academic-writer-write    — Write new article   ║");
    lines.push("║  /skill:academic-writer-ideate   — Brainstorm ideas    ║");
    lines.push("║  /skill:academic-writer-research — Investigate a topic ║");
    lines.push("║  /skill:academic-writer-health   — Check integrations  ║");
    lines.push("╚══════════════════════════════════════════════════╝");

    ctx.ui.notify(lines.join("\n"), "info");
  });

  pi.on("agent_settled", async (event, ctx) => {
    const projectDir = process.cwd();

    // Hard gate: only notify in academic-writer projects.
    if (!existsSync(join(projectDir, ".academic-helper", "profile.md"))) {
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

    const logsDir = join(projectDir, ".academic-helper", "logs");
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
