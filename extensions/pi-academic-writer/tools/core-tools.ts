import type { Harness } from "../../lib/harness.js";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { Type } from "typebox";

import { PACKAGE_ROOT } from "../../lib/paths.js";
import { buildHealth } from "../commands.js";
import { candidateMcpToolNames } from "../mcp-names.js";
import { articlePaths, listProjectFiles } from "../project-files.js";
import { resolveResourcePath } from "../resources.js";
import { buildStatus } from "../status.js";
import { fail, registerTool } from "../tool-kit.js";

/**
 * Resource, status, health, path and MCP-name lookup tools.
 */
export function registerCoreTools(pi: ExtensionAPI, harness: Harness): void {
  registerTool(pi, {
    name: "academic_writer_read_resource",
    effect: "read",
    core: true,
    label: "Academic Writer Resource",
    description:
      "Read a packaged Academic Writer resource by stable name. thresholds resolves .academic-writer/thresholds.json first (the project override created by init/setup) and falls back to the packaged default. Use instead of shelling out to package-root paths.",
    parameters: Type.Object({
      name: Type.String({
        description:
          "Resource name: thresholds, words, scorecard, style_fingerprint_rubric, anti_ai_patterns, voice_profile_load, voice_profile_template, run_state_contract, citation_export_contract, or citation_review_gate.",
      }),
      language: Type.Optional(
        Type.String({
          description:
            "Language for anti_ai_patterns; english selects English, anything else selects Hebrew.",
        }),
      ),
      includePath: Type.Optional(
        Type.Boolean({
          description:
            "Include the package file path in the result for deliberate package edits.",
        }),
      ),
    }),
    run: ({ name, language, includePath }, { cwd }) => {
      const path = resolveResourcePath(name, cwd, language);

      if (!existsSync(path)) {
        return fail(`Academic Writer resource not found: ${name}`, {
          ok: false,
          name,
          path,
        });
      }

      const content = readFileSync(path, "utf-8");

      const source =
        name === "thresholds" && path !== join(PACKAGE_ROOT, "thresholds.json")
          ? "project"
          : "package";

      return {
        text: includePath ? `RESOURCE_PATH: ${path}\n---\n${content}` : content,
        details: { ok: true, name, path, source },
      };
    },
  });

  registerTool(pi, {
    name: "academic_writer_list_agents",
    effect: "read",
    label: "Academic Writer Agents",
    description: "List packaged Academic Writer agent definition files.",
    parameters: Type.Object({}),
    run: () => {
      const agents = readdirSync(join(PACKAGE_ROOT, "agents"))
        .filter((entry) => entry.endsWith(".md"))
        .sort();

      return { text: agents.join("\n"), details: { ok: true, agents } };
    },
  });

  registerTool(pi, {
    name: "academic_writer_status",
    effect: "read",
    core: true,
    label: "Academic Writer Status",
    description:
      "Report project-local Academic Writer setup state, source/bibliography availability, run state, and packaged agents. Includes the active harness (pi or omp).",
    parameters: Type.Object({}),
    run: (_params, { cwd }) => {
      const status = buildStatus(cwd);

      const lastRun = status.runs.last
        ? `${status.runs.last.status}: ${status.runs.last.title ?? status.runs.last.runId}`
        : "none";

      const zotero = status.tools.zotero;
      const notebooklm = status.tools.notebooklm;

      const zoteroScope = zotero?.enabled
        ? (zotero.collection?.name ?? zotero.collection?.key ?? "all library")
        : "disabled";

      const notebookScope = notebooklm?.enabled
        ? (notebooklm.notebook?.name ??
          notebooklm.notebook?.id ??
          "all notebooks")
        : "disabled";

      const text = [
        `Academic Writer status: ${status.ok ? "profile found" : "profile missing"}`,
        ...(status.profileError
          ? [`Profile unreadable: ${status.profileError}`]
          : []),
        `Sources: ${status.sources.count}`,
        `Local source files: ${status.sourceDocuments.count}`,
        `Articles: ${status.articles.count}`,
        `Past articles: ${status.pastArticles.count}`,
        `Active runs: ${status.runs.active.length}`,
        `Last run: ${lastRun}`,
        `Zotero scope: ${zoteroScope}`,
        `NotebookLM scope: ${notebookScope}`,
        `Sefaria: ${status.tools.sefaria?.enabled ? "enabled" : "disabled"}`,
      ].join("\n");

      return {
        text: `Harness: ${harness}\n${text}`,
        details: { ...status, harness },
      };
    },
  });

  registerTool(pi, {
    name: "academic_writer_health",
    effect: "read",
    label: "Academic Writer Health",
    description:
      "Return deterministic local health data: profile/source/run state, packaged agents, and local command availability. Live MCP probes still belong in the health skill.",
    parameters: Type.Object({}),
    run: (_params, { cwd }) => {
      const health = buildHealth(cwd);

      const text = [
        `Profile: ${health.profile.exists ? "found" : "missing"}`,
        `Sources: ${health.sources.count}`,
        `Local source files: ${health.sourceDocuments.count}`,
        `Runs active: ${health.runs.active.length}`,
        `Pandoc: ${health.commands.pandoc ? "installed" : "missing"}`,
        `PDF engine: ${health.commands.xelatex || health.commands.tectonic ? "installed" : "missing"}`,
        `Sefaria MCP: ${health.commands.sefariaMcp ? "installed" : "not detected"}`,
      ].join("\n");

      return {
        text: `Harness: ${harness}\n${text}`,
        details: { ...health, harness },
      };
    },
  });

  registerTool(pi, {
    name: "academic_writer_article_paths",
    effect: "read",
    core: true,
    label: "Academic Writer Article Paths",
    description:
      "Build deterministic article slug, markdown, DOCX, and intermediate JSON paths from a subject. Supports non-English titles.",
    parameters: Type.Object({
      subject: Type.String({
        minLength: 1,
        description: "Article subject/title.",
      }),
    }),
    run: ({ subject }) => {
      const paths = articlePaths(subject);

      return {
        text: JSON.stringify(paths, null, 2),
        details: { ok: true, ...paths },
      };
    },
  });

  registerTool(pi, {
    name: "academic_writer_list_project_files",
    effect: "read",
    label: "Academic Writer Project Files",
    description:
      "List project articles or past-article corpus files deterministically in newest-first order. Use instead of ls/find/head/wc in skills.",
    parameters: Type.Object({
      kind: Type.String({
        description:
          "articles for articles/*.md, or past_articles for past-articles/.",
      }),
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 200 })),
    }),
    run: ({ kind, limit }, { cwd }) => {
      const result = listProjectFiles(
        cwd,
        kind === "past_articles" ? "past_articles" : "articles",
        limit ?? 50,
      );

      return {
        text: result.files.map((file) => file.path).join("\n") || "(none)",
        details: { ok: true, ...result },
      };
    },
  });

  registerTool(pi, {
    name: "academic_writer_resolve_mcp_tool",
    effect: "read",
    label: "Academic Writer Resolve MCP Tool",
    description:
      "Resolve the live callable name for a bare MCP tool (e.g. zotero_get_item_fulltext, notebook_list, get_text) across harnesses. Call once per logical tool name per agent run, cache the returned live_name, and call that tool with the arguments documented for the logical name elsewhere in this skill/agent. Returns live_name: null when no matching tool is connected.",
    parameters: Type.Object({
      logical_name: Type.String({
        minLength: 1,
        description:
          "Bare MCP tool name as documented in this package's skills/agents, e.g. zotero_get_item_fulltext.",
      }),
    }),
    // A missing connection is an answer, not a failure: callers branch on
    // live_name.
    run: ({ logical_name: logicalName }) => {
      const live = new Set(
        harness === "omp"
          ? pi.getAllTools().map((tool) => tool.name)
          : pi.getActiveTools(),
      );

      const resolved = live.has(logicalName)
        ? logicalName
        : candidateMcpToolNames(logicalName).find((name) => live.has(name));

      return resolved
        ? { text: resolved, details: { ok: true, live_name: resolved } }
        : {
            text: `No connected tool resolves "${logicalName}". Check MCP server configuration.`,
            details: { ok: false, live_name: null },
          };
    },
  });
}
