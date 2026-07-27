import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { Type } from "typebox";
import { PACKAGE_ROOT } from "../lib/paths.js";

const execFileAsync = promisify(execFile);

function textResult(text: string, details: Record<string, unknown> = {}) {
  return {
    content: [{ type: "text" as const, text }],
    details,
  };
}

function normalizeLanguage(language: unknown): "english" | "hebrew" {
  if (typeof language !== "string") return "hebrew";
  const normalized = language.trim().toLowerCase();
  return normalized.startsWith("en") || normalized === "english" ? "english" : "hebrew";
}

function resolveResourcePath(name: string, projectRoot: string, language?: unknown): string {
  switch (name) {
    case "thresholds": {
      const projectOverride = join(projectRoot, ".academic-helper", "thresholds.json");
      return existsSync(projectOverride) ? projectOverride : join(PACKAGE_ROOT, "thresholds.json");
    }
    case "words":
      return join(PACKAGE_ROOT, "words.md");
    case "scorecard":
      return join(PACKAGE_ROOT, "skills", "academic-writer-review", "references", "scorecard.json");
    case "style_fingerprint_rubric":
      return join(
        PACKAGE_ROOT,
        "skills",
        "academic-writer-write",
        "references",
        "style-fingerprint-rubric.md",
      );
    case "anti_ai_patterns": {
      const lang = normalizeLanguage(language);
      return join(PACKAGE_ROOT, "skills", "academic-writer-write", "references", `anti-ai-patterns-${lang}.md`);
    }
    default:
      throw new Error(
        `Unknown Academic Writer resource ${JSON.stringify(name)}. Supported resources: thresholds, words, scorecard, style_fingerprint_rubric, anti_ai_patterns.`,
      );
  }
}

function fixTypography(text: string): string {
  let fixed = text;
  fixed = fixed.replace(/[—\u2014]/g, " - ");
  fixed = fixed.replace(/"([^"]{0,200})"/g, "״$1״");
  fixed = fixed.replace(/\u200f+(?=[.,;:)\]\"])/gi, "");
  fixed = fixed.replace(/(?<=[(\[])\u200e+/gi, "");
  fixed = fixed.replace(/[\u200e\u200f]{2,}/gi, "");
  fixed = fixed.replace(/^\s*([.,;:])/, "").trim();
  return fixed;
}

export default function piAcademicWriter(pi: ExtensionAPI) {
  pi.registerTool({
    name: "academic_writer_read_resource",
    label: "Academic Writer Resource",
    description:
      "Read a packaged Academic Writer resource by stable name. thresholds resolves .academic-helper/thresholds.json first (the project override created by init/setup) and falls back to the packaged default. Use instead of shelling out to package-root paths.",
    parameters: Type.Object({
      name: Type.String({
        description:
          "Resource name: thresholds, words, scorecard, style_fingerprint_rubric, or anti_ai_patterns.",
      }),
      language: Type.Optional(
        Type.String({ description: "Language for anti_ai_patterns; english selects English, anything else selects Hebrew." }),
      ),
      includePath: Type.Optional(Type.Boolean({ description: "Include the package file path in the result for deliberate package edits." })),
    }),
    execute: async (_id, params, _signal, _onUpdate, ctx) => {
      const name = typeof params.name === "string" ? params.name : "";
      const path = resolveResourcePath(name, ctx.cwd, params.language);
      if (!existsSync(path)) {
        return textResult(`Academic Writer resource not found: ${name}`, { ok: false, name, path });
      }
      const content = readFileSync(path, "utf-8");
      const body = params.includePath ? `RESOURCE_PATH: ${path}\n---\n${content}` : content;
      const source = name === "thresholds" && path !== join(PACKAGE_ROOT, "thresholds.json") ? "project" : "package";
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
    name: "academic_writer_resolve_csl",
    label: "Academic Writer Resolve CSL",
    description:
      "Resolve a bundled alias, CSL repository id, cached style, or custom .csl path to a local CSL file for Pandoc.",
    parameters: Type.Object({
      style: Type.String({ minLength: 1, description: "CSL alias/id/path, e.g. apa, mla, chicago, nature, or .academic-helper/csl/custom.csl." }),
      download: Type.Optional(Type.Boolean({ description: "Download missing repository style ids into .academic-helper/csl/." })),
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
        const { stdout } = await execFileAsync("python3", args, { cwd: ctx.cwd, signal });
        const path = stdout.trim();
        return textResult(path, { ok: true, path });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return textResult(`CSL resolution failed: ${message}`, { ok: false, error: message });
      }
    },
  });

  pi.registerTool({
    name: "academic_writer_generate_docx",
    label: "Academic Writer Generate DOCX",
    description: "Generate an Academic Writer .docx from the article JSON payload using the packaged DOCX generator.",
    parameters: Type.Object({
      input: Type.String({ minLength: 1, description: "Path to the article JSON input file; relative paths resolve from the project root." }),
      output: Type.String({ minLength: 1, description: "Output .docx path; relative paths resolve from the project root." }),
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
        const { stdout, stderr } = await execFileAsync("python3", args, { cwd: ctx.cwd, signal });
        const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
        return textResult(output || `Generated ${params.output}`, { ok: true, output: params.output });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return textResult(`DOCX generation failed: ${message}`, { ok: false, error: message });
      }
    },
  });

  pi.registerTool({
    name: "academic_writer_fix_typography",
    label: "Academic Writer Fix Typography",
    description: "Apply deterministic Hebrew/academic typography cleanup to a paragraph without reading package paths.",
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
