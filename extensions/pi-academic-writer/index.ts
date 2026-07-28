import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { Type } from "typebox";
import { PACKAGE_ROOT } from "../lib/paths.js";
import {
  loadProfile,
  migrateJsonProfile,
  updateProfile,
} from "../lib/profile.js";
import { resolveResourcePath } from "./resources.js";
import {
  articlePaths,
  buildHealth,
  extractDocument,
  listProjectFiles,
} from "./project.js";
import { buildStatus } from "./status.js";

const execFileAsync = promisify(execFile);
const EXPORT_FORMATS = new Set([
  "docx",
  "html",
  "odt",
  "latex",
  "tex",
  "epub",
  "pdf",
]);

/** Formats a plain-text MCP tool response with structured details. */
function textResult(text: string, details: object = {}) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

/** Applies deterministic Hebrew/academic typography cleanup to one paragraph. */
function fixTypography(text: string): string {
  let fixed = text;
  fixed = fixed.replace(/[-\u2014]/g, " - ");
  fixed = fixed.replace(/"([^"]{0,200})"/g, "״$1״");
  fixed = fixed.replace(/\u200f+(?=[.,;:)\]\"])/gi, "");
  fixed = fixed.replace(/(?<=[(\[])\u200e+/gi, "");
  fixed = fixed.replace(/[\u200e\u200f]{2,}/gi, "");
  fixed = fixed.replace(/^\s*([.,;:])/, "").trim();
  return fixed;
}

function jsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function detailCount(details: object, key: string): number {
  return key in details && Array.isArray(details[key as keyof typeof details])
    ? (details[key as keyof typeof details] as unknown[]).length
    : 0;
}

async function runCitationAudit(
  article: string,
  citationStyle: string,
  projectRoot: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const args = [
    join(PACKAGE_ROOT, "scripts", "audit-citations.py"),
    article,
    "--citation-style",
    citationStyle,
    "--project-root",
    projectRoot,
  ];
  const { stdout } = await execFileAsync("python3", args, {
    cwd: projectRoot,
    signal,
  });
  const parsed = JSON.parse(stdout) as unknown;
  return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : { ok: false, error: "audit-citations.py returned a non-object result" };
}

function exportOutputPath(article: string, format: string): string {
  const normalized = format === "latex" ? "tex" : format;
  return `${article.replace(/\.[^.\/]+$/, "")}.${normalized}`;
}

/** Registers package-aware Academic Writer tools for Pi. */
export default function piAcademicWriter(pi: ExtensionAPI) {
  pi.registerTool({
    name: "academic_writer_read_resource",
    label: "Academic Writer Resource",
    description:
      "Read a packaged Academic Writer resource by stable name. thresholds resolves .academic-writer/thresholds.json first (the project override created by init/setup) and falls back to the packaged default. Use instead of shelling out to package-root paths.",
    parameters: Type.Object({
      name: Type.String({
        description:
          "Resource name: thresholds, words, scorecard, style_fingerprint_rubric, anti_ai_patterns, voice_profile_load, run_state_contract, citation_export_contract, or citation_review_gate.",
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
    execute: async (_id, params, _signal, _onUpdate, ctx) => {
      const name = typeof params.name === "string" ? params.name : "";
      const path = resolveResourcePath(name, ctx.cwd, params.language);
      if (!existsSync(path)) {
        return textResult(`Academic Writer resource not found: ${name}`, {
          ok: false,
          name,
          path,
        });
      }
      const content = readFileSync(path, "utf-8");
      const body = params.includePath
        ? `RESOURCE_PATH: ${path}\n---\n${content}`
        : content;
      const source =
        name === "thresholds" && path !== join(PACKAGE_ROOT, "thresholds.json")
          ? "project"
          : "package";
      return textResult(body, { ok: true, name, path, source });
    },
  });

  pi.registerTool({
    name: "academic_writer_list_agents",
    label: "Academic Writer Agents",
    description: "List packaged Academic Writer agent definition files.",
    parameters: Type.Object({}),
    execute: async () => {
      const agentsDir = join(PACKAGE_ROOT, "agents");
      const agents = readdirSync(agentsDir)
        .filter((entry) => entry.endsWith(".md"))
        .sort();
      return textResult(agents.join("\n"), { ok: true, agents });
    },
  });

  pi.registerTool({
    name: "academic_writer_status",
    label: "Academic Writer Status",
    description:
      "Report project-local Academic Writer setup state, source/bibliography availability, run state, and packaged agents.",
    parameters: Type.Object({}),
    execute: async (_id, _params, _signal, _onUpdate, ctx) => {
      const status = buildStatus(ctx.cwd);
      const activeRuns = status.runs.active.length;
      const sourceCount = status.sources.count;
      const lastRun = status.runs.last
        ? `${status.runs.last.status}: ${status.runs.last.title ?? status.runs.last.runId}`
        : "none";
      const text = [
        `Academic Writer status: ${status.ok ? "profile found" : "profile missing"}`,
        `Sources: ${sourceCount}`,
        `Articles: ${status.articles.count}`,
        `Past articles: ${status.pastArticles.count}`,
        `Active runs: ${activeRuns}`,
        `Last run: ${lastRun}`,
      ].join("\n");
      return textResult(text, status);
    },
  });

  pi.registerTool({
    name: "academic_writer_health",
    label: "Academic Writer Health",
    description:
      "Return deterministic local health data: profile/source/run state, packaged agents, and local command availability. Live MCP probes still belong in the health skill.",
    parameters: Type.Object({}),
    execute: async (_id, _params, _signal, _onUpdate, ctx) => {
      const health = buildHealth(ctx.cwd);
      const text = [
        `Profile: ${health.profile.exists ? "found" : "missing"}`,
        `Sources: ${health.sources.count}`,
        `Runs active: ${health.runs.active.length}`,
        `Pandoc: ${health.commands.pandoc ? "installed" : "missing"}`,
        `PDF engine: ${health.commands.xelatex || health.commands.tectonic ? "installed" : "missing"}`,
      ].join("\n");
      return textResult(text, health);
    },
  });

  pi.registerTool({
    name: "academic_writer_migrate_profile",
    label: "Academic Writer Migrate Profile",
    description:
      "One-time migration from .academic-writer/profile.json to .academic-writer/profile.md. Use during init/setup preflight before checking for an existing profile.",
    parameters: Type.Object({}),
    execute: async (_id, _params, _signal, _onUpdate, ctx) => {
      const migration = migrateJsonProfile(ctx.cwd);
      if (!migration.ok) {
        return textResult(
          `Profile migration failed: ${migration.error}`,
          migration,
        );
      }
      const text = migration.migrated
        ? "Migrated JSON Academic Writer profile"
        : `Profile migration skipped: ${migration.reason}`;
      return textResult(text, migration);
    },
  });

  pi.registerTool({
    name: "academic_writer_get_profile",
    label: "Academic Writer Get Profile",
    description:
      "Read and parse .academic-writer/profile.md into deterministic JSON for skills and agents. Use instead of regex or Python profile parsing.",
    parameters: Type.Object({}),
    execute: async (_id, _params, _signal, _onUpdate, ctx) => {
      const profile = loadProfile(ctx.cwd);
      if (!profile) {
        return textResult("Academic Writer profile missing", {
          ok: false,
          path: ".academic-writer/profile.md",
        });
      }
      return textResult(JSON.stringify(profile, null, 2), {
        ok: true,
        path: ".academic-writer/profile.md",
        profile,
      });
    },
  });

  pi.registerTool({
    name: "academic_writer_update_profile",
    label: "Academic Writer Update Profile",
    description:
      "Patch recognized .academic-writer/profile.md fields using a JSON object string. Preserves the existing markdown profile shape and updates updatedAt when omitted.",
    parameters: Type.Object({
      fieldsJson: Type.String({
        minLength: 2,
        description:
          'JSON object of profile fields to replace, e.g. {"tools":{...}} or {"fieldOfStudy":"..."}.',
      }),
    }),
    execute: async (_id, params, _signal, _onUpdate, ctx) => {
      const patch = jsonObject(String(params.fieldsJson ?? ""));
      if (!patch) {
        return textResult(
          "Profile update failed: fieldsJson must be a JSON object",
          {
            ok: false,
          },
        );
      }
      const profile = updateProfile(ctx.cwd, patch);
      if (!profile) {
        return textResult(
          "Profile update failed: profile missing or unreadable",
          {
            ok: false,
            path: ".academic-writer/profile.md",
          },
        );
      }
      return textResult("Profile updated", {
        ok: true,
        path: ".academic-writer/profile.md",
        profile,
      });
    },
  });

  pi.registerTool({
    name: "academic_writer_article_paths",
    label: "Academic Writer Article Paths",
    description:
      "Build deterministic article slug, markdown, DOCX, and intermediate JSON paths from a subject. Supports non-English titles.",
    parameters: Type.Object({
      subject: Type.String({
        minLength: 1,
        description: "Article subject/title.",
      }),
    }),
    execute: async (_id, params) => {
      const paths = articlePaths(String(params.subject ?? ""));
      return textResult(JSON.stringify(paths, null, 2), { ok: true, ...paths });
    },
  });

  pi.registerTool({
    name: "academic_writer_list_project_files",
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
    execute: async (_id, params, _signal, _onUpdate, ctx) => {
      const kind =
        params.kind === "past_articles" ? "past_articles" : "articles";
      const result = listProjectFiles(
        ctx.cwd,
        kind,
        typeof params.limit === "number" ? params.limit : 50,
      );
      const text = result.files.map((file) => file.path).join("\n") || "(none)";
      return textResult(text, { ok: true, ...result });
    },
  });

  pi.registerTool({
    name: "academic_writer_extract_document",
    label: "Academic Writer Extract Document",
    description:
      "Extract deterministic plain text from markdown, text, PDF, or DOCX files. Use instead of inline python/docx/pdfplumber shell snippets.",
    parameters: Type.Object({
      path: Type.String({ minLength: 1, description: "Document path." }),
    }),
    execute: async (_id, params, signal, _onUpdate, ctx) => {
      const result = await extractDocument(
        ctx.cwd,
        String(params.path),
        signal,
      );
      return textResult(
        result.ok ? result.text : `Document extraction failed: ${result.error}`,
        {
          ...result,
          length: result.text.length,
        },
      );
    },
  });

  pi.registerTool({
    name: "academic_writer_resolve_csl",
    label: "Academic Writer Resolve CSL",
    description:
      "Resolve a bundled alias, CSL repository id, cached style, or custom .csl path to a local CSL file for Pandoc.",
    parameters: Type.Object({
      style: Type.String({
        minLength: 1,
        description:
          "CSL alias/id/path, e.g. apa, mla, chicago, nature, or .academic-writer/csl/custom.csl.",
      }),
      download: Type.Optional(
        Type.Boolean({
          description:
            "Download missing repository style ids into .academic-writer/csl/.",
        }),
      ),
    }),
    execute: async (_id, params, signal, _onUpdate, ctx) => {
      const args = [
        join(PACKAGE_ROOT, "scripts", "resolve-csl.py"),
        String(params.style),
        "--package-root",
        PACKAGE_ROOT,
        "--project-root",
        ctx.cwd,
      ];
      if (params.download) args.push("--download");
      try {
        const { stdout } = await execFileAsync("python3", args, {
          cwd: ctx.cwd,
          signal,
        });
        const path = stdout.trim();
        return textResult(path, { ok: true, path });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return textResult(`CSL resolution failed: ${message}`, {
          ok: false,
          error: message,
        });
      }
    },
  });

  pi.registerTool({
    name: "academic_writer_audit_citations",
    label: "Academic Writer Citation Audit",
    description:
      "Deterministically verify citation syntax and citeproc keys before DOCX/export/review. Semantic claim verification still belongs to the auditor agent.",
    parameters: Type.Object({
      article: Type.String({
        minLength: 1,
        description:
          "Path to the article markdown file; relative paths resolve from the project root.",
      }),
      citationStyle: Type.String({
        minLength: 1,
        description:
          "inline-parenthetical for literal citation mode; any other value means citeproc mode.",
      }),
    }),
    execute: async (_id, params, signal, _onUpdate, ctx) => {
      try {
        const details = await runCitationAudit(
          String(params.article),
          String(params.citationStyle),
          ctx.cwd,
          signal,
        );
        const ok = details.ok === true;
        const keys = detailCount(details, "citationKeys");
        const missingSources = detailCount(details, "missingFromSources");
        const missingBibliography = detailCount(
          details,
          "missingFromBibliography",
        );
        const warnings = detailCount(details, "warnings");
        const summary = ok
          ? `Citation audit passed: ${keys} cite key(s), ${warnings} warning(s).`
          : `Citation audit failed: ${missingSources} missing source key(s), ${missingBibliography} missing bibliography key(s).`;
        return textResult(summary, details);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return textResult(`Citation audit failed: ${message}`, {
          ok: false,
          error: message,
        });
      }
    },
  });

  pi.registerTool({
    name: "academic_writer_export_article",
    label: "Academic Writer Export Article",
    description:
      "Run the mechanical citation audit, then export an audited markdown article to DOCX or other requested formats with Pandoc. Continues other formats when one fails.",
    parameters: Type.Object({
      article: Type.String({
        minLength: 1,
        description: "Markdown article path.",
      }),
      citationStyle: Type.String({
        minLength: 1,
        description:
          "Profile citationStyle; inline-parenthetical means literal mode.",
      }),
      formats: Type.Array(Type.String({ minLength: 2 }), {
        description: "Formats: docx, html, odt, latex/tex, epub, pdf.",
      }),
      csl: Type.Optional(
        Type.String({
          minLength: 1,
          description:
            "Resolved CSL file path for citeproc exports. If omitted, Pandoc uses its default style.",
        }),
      ),
      bibliography: Type.Optional(
        Type.String({
          minLength: 1,
          description:
            "Bibliography file for citeproc exports. Defaults to .academic-writer/bibliography.bib.",
        }),
      ),
      pdfEngine: Type.Optional(
        Type.String({
          description: "Optional PDF engine: xelatex or tectonic.",
        }),
      ),
    }),
    execute: async (_id, params, signal, _onUpdate, ctx) => {
      const article = String(params.article);
      const citationStyle = String(params.citationStyle);
      const formats = Array.isArray(params.formats)
        ? params.formats
            .map((format) => String(format).toLowerCase())
            .filter((format) => EXPORT_FORMATS.has(format))
        : [];
      if (formats.length === 0) {
        return textResult("Export failed: no supported formats requested", {
          ok: false,
          supported: [...EXPORT_FORMATS].sort(),
        });
      }
      try {
        const audit = await runCitationAudit(
          article,
          citationStyle,
          ctx.cwd,
          signal,
        );
        if (audit.ok !== true) {
          return textResult("Export stopped: citation audit failed", {
            ok: false,
            audit,
          });
        }
        const results: Array<{
          format: string;
          output: string;
          ok: boolean;
          error?: string;
        }> = [];
        const citeproc = citationStyle !== "inline-parenthetical";
        for (const format of formats) {
          const output = exportOutputPath(article, format);
          const args = [article];
          if (citeproc) {
            args.push("--citeproc", "--fail-if-warnings");
            args.push(
              `--bibliography=${typeof params.bibliography === "string" ? params.bibliography : ".academic-writer/bibliography.bib"}`,
            );
            if (typeof params.csl === "string")
              args.push(`--csl=${params.csl}`);
          }
          if (format === "pdf" && typeof params.pdfEngine === "string") {
            args.push(`--pdf-engine=${params.pdfEngine}`);
          }
          args.push("-o", output);
          try {
            await execFileAsync("pandoc", args, { cwd: ctx.cwd, signal });
            results.push({ format, output, ok: true });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            results.push({ format, output, ok: false, error: message });
          }
        }
        const ok = results.every((result) => result.ok);
        const text = results
          .map((result) =>
            result.ok
              ? `${result.format}: wrote ${result.output}`
              : `${result.format}: failed - ${result.error}`,
          )
          .join("\n");
        return textResult(text, { ok, audit, results });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return textResult(`Export failed: ${message}`, {
          ok: false,
          error: message,
        });
      }
    },
  });

  pi.registerTool({
    name: "academic_writer_generate_docx",
    label: "Academic Writer Generate DOCX",
    description:
      "Generate an Academic Writer .docx from the article JSON payload using the packaged DOCX generator.",
    parameters: Type.Object({
      input: Type.String({
        minLength: 1,
        description:
          "Path to the article JSON input file; relative paths resolve from the project root.",
      }),
      output: Type.String({
        minLength: 1,
        description:
          "Output .docx path; relative paths resolve from the project root.",
      }),
    }),
    execute: async (_id, params, signal, _onUpdate, ctx) => {
      const args = [
        join(PACKAGE_ROOT, "scripts", "generate-docx.py"),
        "--input",
        String(params.input),
        "--output",
        String(params.output),
      ];
      try {
        const { stdout, stderr } = await execFileAsync("python3", args, {
          cwd: ctx.cwd,
          signal,
        });
        const output = [stdout.trim(), stderr.trim()]
          .filter(Boolean)
          .join("\n");
        return textResult(output || `Generated ${params.output}`, {
          ok: true,
          output: params.output,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return textResult(`DOCX generation failed: ${message}`, {
          ok: false,
          error: message,
        });
      }
    },
  });

  pi.registerTool({
    name: "academic_writer_fix_typography",
    label: "Academic Writer Fix Typography",
    description:
      "Apply deterministic Hebrew/academic typography cleanup to a paragraph without reading package paths.",
    parameters: Type.Object({
      text: Type.String({ description: "Paragraph text to clean." }),
    }),
    execute: async (_id, params) => {
      const original = String(params.text ?? "");
      const fixed = fixTypography(original);
      return textResult(fixed, { ok: true, changed: fixed !== original });
    },
  });
}
