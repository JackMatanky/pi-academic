import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { Type } from "typebox";
import { PACKAGE_ROOT } from "../lib/paths.js";
import { resolveResourcePath } from "./resources.js";
import { buildStatus } from "./status.js";

const execFileAsync = promisify(execFile);

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

/** Registers package-aware Academic Writer tools for Pi. */
export default function piAcademicWriter(pi: ExtensionAPI) {
  pi.registerTool({
    name: "academic_writer_read_resource",
    label: "Academic Writer Resource",
    description:
      "Read a packaged Academic Writer resource by stable name. thresholds resolves .academic-helper/thresholds.json first (the project override created by init/setup) and falls back to the packaged default. Use instead of shelling out to package-root paths.",
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
        `Active runs: ${activeRuns}`,
        `Last run: ${lastRun}`,
      ].join("\n");
      return textResult(text, status);
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
          "CSL alias/id/path, e.g. apa, mla, chicago, nature, or .academic-helper/csl/custom.csl.",
      }),
      download: Type.Optional(
        Type.Boolean({
          description:
            "Download missing repository style ids into .academic-helper/csl/.",
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
      const args = [
        join(PACKAGE_ROOT, "scripts", "audit-citations.py"),
        String(params.article),
        "--citation-style",
        String(params.citationStyle),
        "--project-root",
        ctx.cwd,
      ];
      try {
        const { stdout } = await execFileAsync("python3", args, {
          cwd: ctx.cwd,
          signal,
        });
        const parsed = JSON.parse(stdout) as unknown;
        const details =
          parsed !== null &&
          typeof parsed === "object" &&
          !Array.isArray(parsed)
            ? parsed
            : {
                ok: false,
                error: "audit-citations.py returned a non-object result",
              };
        const ok = "ok" in details && details.ok === true;
        const keys =
          "citationKeys" in details && Array.isArray(details.citationKeys)
            ? details.citationKeys.length
            : 0;
        const missingSources =
          "missingFromSources" in details &&
          Array.isArray(details.missingFromSources)
            ? details.missingFromSources.length
            : 0;
        const missingBibliography =
          "missingFromBibliography" in details &&
          Array.isArray(details.missingFromBibliography)
            ? details.missingFromBibliography.length
            : 0;
        const warnings =
          "warnings" in details && Array.isArray(details.warnings)
            ? details.warnings.length
            : 0;
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
