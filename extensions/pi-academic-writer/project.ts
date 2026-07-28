import { execFile } from "node:child_process";
import {
  constants,
  accessSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import {
  basename,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { promisify } from "node:util";
import { buildStatus, type AcademicWriterStatus } from "./status.js";

const execFileAsync = promisify(execFile);

export interface ArticlePaths {
  slug: string;
  markdown: string;
  docx: string;
  json: string;
}

export interface ProjectFile {
  name: string;
  path: string;
  ext: string;
  mtimeMs: number;
}

export interface ProjectFileList {
  kind: "articles" | "past_articles";
  dir: string;
  count: number;
  files: ProjectFile[];
}

export interface ExtractedDocument {
  ok: boolean;
  path: string;
  text: string;
  error?: string;
}

export interface HealthStatus extends AcademicWriterStatus {
  commands: Record<string, boolean>;
}

function toRelative(projectRoot: string, path: string): string {
  return relative(projectRoot, path) || basename(path);
}

function resolveInputPath(projectRoot: string, path: string): string {
  return isAbsolute(path) ? path : resolve(projectRoot, path);
}

function compactSlug(value: string): string {
  const slug = value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "article";
}

/** Builds one deterministic article slug and output path set. */
export function articlePaths(subject: string): ArticlePaths {
  const slug = compactSlug(subject);
  return {
    slug,
    markdown: `articles/${slug}.md`,
    docx: `articles/${slug}.docx`,
    json: `.academic-helper/runs/${slug}.docx.json`,
  };
}

/** Lists project article or corpus files in newest-first order. */
export function listProjectFiles(
  projectRoot: string,
  kind: "articles" | "past_articles",
  limit: number,
): ProjectFileList {
  const dir = kind === "articles" ? "articles" : "past-articles";
  const absDir = join(projectRoot, dir);
  if (!existsSync(absDir)) return { kind, dir, count: 0, files: [] };

  const files = readdirSync(absDir)
    .filter((name) => !name.startsWith("."))
    .map((name) => {
      const path = join(absDir, name);
      return { name, path, stat: statSync(path) };
    })
    .filter(({ name, stat }) =>
      stat.isFile() && kind === "articles"
        ? name.endsWith(".md")
        : stat.isFile(),
    )
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    .map(({ name, path, stat }) => ({
      name,
      path: toRelative(projectRoot, path),
      ext: extname(name).toLowerCase(),
      mtimeMs: stat.mtimeMs,
    }));

  return { kind, dir, count: files.length, files: files.slice(0, limit) };
}

async function extractWithPython(
  code: string,
  path: string,
  signal?: AbortSignal,
): Promise<string> {
  const { stdout } = await execFileAsync("python3", ["-c", code, path], {
    signal,
  });
  return stdout.trim();
}

/** Extracts plain text from markdown/text/PDF/DOCX using package dev deps when needed. */
export async function extractDocument(
  projectRoot: string,
  inputPath: string,
  signal?: AbortSignal,
): Promise<ExtractedDocument> {
  const path = resolveInputPath(projectRoot, inputPath);
  const relPath = isAbsolute(inputPath)
    ? inputPath
    : toRelative(projectRoot, path);
  const ext = extname(path).toLowerCase();
  try {
    if (ext === ".md" || ext === ".txt") {
      return { ok: true, path: relPath, text: readFileSync(path, "utf-8") };
    }
    if (ext === ".docx") {
      const text = await extractWithPython(
        "import sys, docx; d=docx.Document(sys.argv[1]); print('\\n\\n'.join(p.text for p in d.paragraphs))",
        path,
        signal,
      );
      return { ok: true, path: relPath, text };
    }
    if (ext === ".pdf") {
      const text = await extractWithPython(
        "import sys, pdfplumber; pdf=pdfplumber.open(sys.argv[1]); print('\\n\\n'.join(t for t in (p.extract_text() for p in pdf.pages) if t))",
        path,
        signal,
      );
      return { ok: true, path: relPath, text };
    }
    return {
      ok: false,
      path: relPath,
      text: "",
      error: `Unsupported file type: ${ext || "(none)"}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, path: relPath, text: "", error: message };
  }
}

function commandExists(command: string): boolean {
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (!dir) continue;
    try {
      accessSync(join(dir, command), constants.X_OK);
      return true;
    } catch {
      // try next PATH entry
    }
  }
  return false;
}

/** Builds deterministic local health data without probing network/MCP servers. */
export function buildHealth(projectRoot: string): HealthStatus {
  return {
    ...buildStatus(projectRoot),
    commands: {
      pandoc: commandExists("pandoc"),
      xelatex: commandExists("xelatex"),
      tectonic: commandExists("tectonic"),
      zoteroMcp: commandExists("zotero-mcp"),
      notebooklm: commandExists("nlm"),
    },
  };
}
