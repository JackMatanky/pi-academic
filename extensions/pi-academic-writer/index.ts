import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { Type } from "typebox";
import { PACKAGE_ROOT } from "../lib/paths.js";

const execFileAsync = promisify(execFile);

function textResult(text: string, details: object = {}) {
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
    case "voice_profile_load":
      return join(PACKAGE_ROOT, "skills", "academic-writer-write", "references", "voice-profile-load.md");
    case "run_state_contract":
      return join(PACKAGE_ROOT, "skills", "academic-writer-write", "references", "run-state-contract.md");
    case "citation_export_contract":
      return join(PACKAGE_ROOT, "skills", "academic-writer-write", "references", "citation-export-contract.md");
    case "citation_review_gate":
      return join(PACKAGE_ROOT, "skills", "academic-writer-review", "references", "citation-review-gate.md");
    default:
      throw new Error(
        `Unknown Academic Writer resource ${JSON.stringify(name)}. Supported resources: thresholds, words, scorecard, style_fingerprint_rubric, anti_ai_patterns, voice_profile_load, run_state_contract, citation_export_contract, citation_review_gate.`,
      );
  }
}

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

interface FileState {
  exists: boolean;
  path: string;
}

interface RunInfo {
  runId: string;
  status: string;
  title: string | null;
  updatedAt: string | null;
  path: string;
}

interface RunSummary {
  dir: string;
  active: RunInfo[];
  last: RunInfo | null;
}

interface AcademicWriterStatus {
  ok: boolean;
  profile: FileState;
  voice: FileState;
  sources: FileState & { count: number };
  bibliography: FileState;
  runs: RunSummary;
  agents: string[];
}


function readJson(path: string): unknown | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as unknown;
  } catch {
    return null;
  }
}

function countSources(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === "object" && !Array.isArray(value) && "sources" in value) {
    if (Array.isArray(value.sources)) return value.sources.length;
  }
  return 0;
}

function fileState(projectRoot: string, relativePath: string): FileState {
  const path = join(projectRoot, relativePath);
  return { exists: existsSync(path), path: relativePath };
}

function summarizeRuns(projectRoot: string): RunSummary {
  const relativeDir = ".academic-helper/runs";
  const runsDir = join(projectRoot, relativeDir);
  if (!existsSync(runsDir)) return { dir: relativeDir, active: [], last: null };
  const runs = readdirSync(runsDir)
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => {
      const path = join(runsDir, entry);
      const data = readJson(path);
      const isRun = data !== null && typeof data === "object" && !Array.isArray(data);
      const status = isRun && "status" in data && typeof data.status === "string" ? data.status : "unknown";
      const runId = isRun && "runId" in data && typeof data.runId === "string" ? data.runId : entry.replace(/\.json$/, "");
      const title = isRun && "title" in data && typeof data.title === "string" ? data.title : null;
      const updatedAt = isRun && "updatedAt" in data && typeof data.updatedAt === "string" ? data.updatedAt : null;
      return {
        runId,
        status,
        title,
        updatedAt,
        path: `${relativeDir}/${entry}`,
        mtimeMs: statSync(path).mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const compact: RunInfo[] = runs.map(({ mtimeMs: _mtimeMs, ...run }) => run);
  return {
    dir: relativeDir,
    active: compact.filter((run) => ["planned", "running", "blocked"].includes(run.status)),
    last: compact[0] ?? null,
  };
}

function buildStatus(projectRoot: string): AcademicWriterStatus {
  const profile = fileState(projectRoot, ".academic-helper/profile.md");
  const voice = fileState(projectRoot, "AUTHOR_VOICE.md");
  const sourcesPath = join(projectRoot, ".academic-helper", "sources.json");
  const sources = {
    exists: existsSync(sourcesPath),
    count: countSources(readJson(sourcesPath)),
    path: ".academic-helper/sources.json",
  };
  const bibliography = fileState(projectRoot, ".academic-helper/bibliography.bib");
  const agentsDir = join(PACKAGE_ROOT, "agents");
  const agents = readdirSync(agentsDir)
    .filter((entry) => entry.endsWith(".md"))
    .sort();
  return {
    ok: Boolean(profile.exists),
    profile,
    voice,
    sources,
    bibliography,
    runs: summarizeRuns(projectRoot),
    agents,
  };
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
          "Resource name: thresholds, words, scorecard, style_fingerprint_rubric, anti_ai_patterns, voice_profile_load, run_state_contract, citation_export_contract, or citation_review_gate.",
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
    name: "academic_writer_status",
    label: "Academic Writer Status",
    description: "Report project-local Academic Writer setup state, source/bibliography availability, run state, and packaged agents.",
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
    name: "academic_writer_audit_citations",
    label: "Academic Writer Citation Audit",
    description:
      "Deterministically verify citation syntax and citeproc keys before DOCX/export/review. Semantic claim verification still belongs to the auditor agent.",
    parameters: Type.Object({
      article: Type.String({
        minLength: 1,
        description: "Path to the article markdown file; relative paths resolve from the project root.",
      }),
      citationStyle: Type.String({
        minLength: 1,
        description: "inline-parenthetical for literal citation mode; any other value means citeproc mode.",
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
        const { stdout } = await execFileAsync("python3", args, { cwd: ctx.cwd, signal });
        const parsed = JSON.parse(stdout) as unknown;
        const details = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed
          : { ok: false, error: "audit-citations.py returned a non-object result" };
        const ok = "ok" in details && details.ok === true;
        const keys = "citationKeys" in details && Array.isArray(details.citationKeys) ? details.citationKeys.length : 0;
        const missingSources = "missingFromSources" in details && Array.isArray(details.missingFromSources) ? details.missingFromSources.length : 0;
        const missingBibliography = "missingFromBibliography" in details && Array.isArray(details.missingFromBibliography) ? details.missingFromBibliography.length : 0;
        const warnings = "warnings" in details && Array.isArray(details.warnings) ? details.warnings.length : 0;
        const summary = ok
          ? `Citation audit passed: ${keys} cite key(s), ${warnings} warning(s).`
          : `Citation audit failed: ${missingSources} missing source key(s), ${missingBibliography} missing bibliography key(s).`;
        return textResult(summary, details);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return textResult(`Citation audit failed: ${message}`, { ok: false, error: message });
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
