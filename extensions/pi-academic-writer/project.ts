import { execFile, execFileSync } from "node:child_process";
import {
  constants,
  accessSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
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

/**
 * Promisified `execFile` used for bounded external extraction commands.
 *
 * @remarks
 * Kept as a single module-level constant so callers do not duplicate package paths or option lists.
 */
const execFileAsync = promisify(execFile);
/**
 * File extensions accepted by local source ingestion.
 *
 * @remarks
 * Kept as a single module-level constant so callers do not duplicate package paths or option lists.
 */
const SUPPORTED_SOURCE_EXTENSIONS = new Set([".pdf", ".docx", ".md", ".txt"]);

/**
 * Deterministic article output paths derived from a researcher-provided subject.
 *
 * @remarks
 * Defines the serializable shape shared between extension tools, tests, and prompts.
 */
export interface ArticlePaths {
  slug: string;
  markdown: string;
  docx: string;
  json: string;
  sources: string;
  bibliography: string;
}

/**
 * Project article or corpus file metadata returned by listing tools.
 *
 * @remarks
 * Defines the serializable shape shared between extension tools, tests, and prompts.
 */
export interface ProjectFile {
  name: string;
  path: string;
  ext: string;
  mtimeMs: number;
}

/**
 * Newest-first file listing for an Academic Writer project directory.
 *
 * @remarks
 * Defines the serializable shape shared between extension tools, tests, and prompts.
 */
export interface ProjectFileList {
  kind: "articles" | "past_articles";
  dir: string;
  count: number;
  files: ProjectFile[];
}

/**
 * Plain-text extraction result for one source or article document.
 *
 * @remarks
 * Defines the serializable shape shared between extension tools, tests, and prompts.
 */
export interface ExtractedDocument {
  ok: boolean;
  path: string;
  text: string;
  error?: string;
}

/**
 * Source registry record generated from one project-local source file.
 *
 * @remarks
 * Defines the serializable shape shared between extension tools, tests, and prompts.
 */
export interface LocalSourceRecord {
  sourceId: string;
  citeKey: string;
  sourceType: "local-file";
  path: string;
  fileType: string;
  author: null;
  workTitle: string;
  year: string | null;
  extractionConfidence: {
    author: "low";
    workTitle: "medium";
    year: "medium" | "low";
  };
  extractionNotes: string;
}

/**
 * Result payload written by local folder source ingestion.
 *
 * @remarks
 * Defines the serializable shape shared between extension tools, tests, and prompts.
 */
export interface SourceIngestionResult {
  ok: boolean;
  sourceDirectory: string;
  sourcesPath: string;
  bibliographyPath: string;
  count: number;
  sources: LocalSourceRecord[];
  errors: Array<{ path: string; error: string }>;
}

/**
 * Article-local citation asset paths used for frozen snapshots.
 *
 * @remarks
 * Defines the serializable shape shared between extension tools, tests, and prompts.
 */
export interface CitationAssetPaths {
  sources: string;
  bibliography: string;
}

/**
 * Result payload for copying current citation caches beside an article.
 *
 * @remarks
 * Defines the serializable shape shared between extension tools, tests, and prompts.
 */
export interface CitationSnapshotResult extends CitationAssetPaths {
  ok: boolean;
  copied: string[];
  missing: string[];
}

/**
 * Deterministic DOCX JSON assembly result.
 *
 * @remarks
 * Defines the serializable shape shared between extension tools, tests, and prompts.
 */
export interface DocxAssemblyResult {
  ok: boolean;
  input: string;
  output: string;
  title: string;
  totalWords: number;
  sections: number;
  error?: string;
}

/**
 * Health payload extending status data with local command availability.
 *
 * @remarks
 * Defines the serializable shape shared between extension tools, tests, and prompts.
 */
export interface HealthStatus extends AcademicWriterStatus {
  commands: Record<string, boolean>;
  pandocVersion: string | null;
}

/**
 * Returns a project-relative path, falling back to the basename for the root itself.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param projectRoot - Absolute project root used to resolve project-relative files.
 * @param path - File path to read, write, or resolve.
 * @returns The typed result described by this helper contract.
 */
function toRelative(projectRoot: string, path: string): string {
  return relative(projectRoot, path) || basename(path);
}

/**
 * Resolves project-relative input paths while preserving absolute inputs.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param projectRoot - Absolute project root used to resolve project-relative files.
 * @param path - File path to read, write, or resolve.
 * @returns The typed result described by this helper contract.
 */
function resolveInputPath(projectRoot: string, path: string): string {
  return isAbsolute(path) ? path : resolve(projectRoot, path);
}

/**
 * Normalizes free-form subjects into stable filesystem-safe article slugs.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param value - Raw value to parse or normalize.
 * @returns The typed result described by this helper contract.
 */
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

/**
 * Builds a BibTeX-safe citekey prefix from source metadata.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param value - Raw value to parse or normalize.
 * @returns The typed result described by this helper contract.
 */
function citeKeyBase(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "source"
  ).slice(0, 48);
}

/**
 * Builds one deterministic article slug and output path set.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param subject - Researcher-provided article subject.
 * @returns The typed result described by this helper contract.
 */
export function articlePaths(subject: string): ArticlePaths {
  const slug = compactSlug(subject);
  return {
    slug,
    markdown: `articles/${slug}.md`,
    docx: `articles/${slug}.docx`,
    json: `.academic-writer/runs/${slug}.docx.json`,
    sources: `articles/${slug}.sources.json`,
    bibliography: `articles/${slug}.bibliography.bib`,
  };
}

/**
 * Derives article-local source and bibliography snapshot paths.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param article - Article markdown path, relative to the project root unless absolute.
 * @returns The typed result described by this helper contract.
 */
export function citationAssetPaths(article: string): CitationAssetPaths {
  const base = article.replace(/\.[^.\/]+$/, "");
  return {
    sources: `${base}.sources.json`,
    bibliography: `${base}.bibliography.bib`,
  };
}

/**
 * Lists project article or corpus files in newest-first order.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param projectRoot - Absolute project root used to resolve project-relative files.
 * @param kind - Project file bucket to list.
 * @param limit - Maximum number of files to return.
 * @returns The typed result described by this helper contract.
 */
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

/**
 * Runs a small Python extractor snippet and returns trimmed stdout.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param code - Python source snippet executed for extraction.
 * @param path - File path to read, write, or resolve.
 * @param signal - Optional abort signal forwarded to subprocesses.
 * @returns The typed result described by this helper contract.
 */
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

/**
 * Extracts DOCX text with Pandoc when Pandoc is installed.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param path - File path to read, write, or resolve.
 * @param signal - Optional abort signal forwarded to subprocesses.
 * @returns The typed result described by this helper contract.
 */
async function extractDocxWithPandoc(
  path: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!commandExists("pandoc")) return null;
  try {
    const { stdout } = await execFileAsync(
      "pandoc",
      ["-f", "docx+citations", "-t", "markdown", path],
      { signal },
    );
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Extracts plain text from markdown/text/PDF/DOCX using package dev deps when needed.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param projectRoot - Absolute project root used to resolve project-relative files.
 * @param inputPath - Input document path, relative to the project root unless absolute.
 * @param signal - Optional abort signal forwarded to subprocesses.
 * @returns The typed result described by this helper contract.
 */
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
      const pandocText = await extractDocxWithPandoc(path, signal);
      if (pandocText !== null)
        return { ok: true, path: relPath, text: pandocText };
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

/**
 * Finds the first non-heading content line for generated local source titles.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param text - Input text to process.
 * @returns The typed result described by this helper contract.
 */
function firstContentLine(text: string): string | null {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^#+\s*/, "").trim();
    if (line) return line.slice(0, 140);
  }
  return null;
}

/**
 * Extracts a plausible publication year from source text or paths.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param value - Raw value to parse or normalize.
 * @returns The typed result described by this helper contract.
 */
function extractYear(value: string): string | null {
  const match = /\b(1[5-9]\d{2}|20\d{2})\b/.exec(value);
  return match?.[1] ?? null;
}

/**
 * Escapes local-source metadata for a minimal BibTeX field value.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param value - Raw value to parse or normalize.
 * @returns The typed result described by this helper contract.
 */
function bibtexValue(value: string): string {
  return value.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Returns a unique citekey by appending numeric suffixes on collisions.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param base - Preferred citekey prefix before collision suffixes.
 * @param used - Set of citekeys already assigned during the current ingestion.
 * @returns The typed result described by this helper contract.
 */
function uniqueCiteKey(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Builds a local source registry record from extracted document text.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param projectRoot - Absolute project root used to resolve project-relative files.
 * @param document - Extracted local source document used to build a source record.
 * @param usedKeys - Mutable citekey set used to avoid duplicates.
 * @returns The typed result described by this helper contract.
 */
function sourceRecordFromDocument(
  projectRoot: string,
  document: ExtractedDocument,
  usedKeys: Set<string>,
): LocalSourceRecord {
  const title =
    firstContentLine(document.text) ??
    basename(document.path, extname(document.path));
  const year = extractYear(`${document.path}\n${document.text.slice(0, 4000)}`);
  const citeKey = uniqueCiteKey(
    citeKeyBase(`${title} ${year ?? ""}`),
    usedKeys,
  );
  return {
    sourceId: `local:${citeKey}`,
    citeKey,
    sourceType: "local-file",
    path: document.path,
    fileType: extname(document.path).toLowerCase().replace(/^\./, "") || "text",
    author: null,
    workTitle: title,
    year,
    extractionConfidence: {
      author: "low",
      workTitle: "medium",
      year: year ? "medium" : "low",
    },
    extractionNotes: `Generated from local project source ${toRelative(projectRoot, resolveInputPath(projectRoot, document.path))}; verify missing metadata before publication.`,
  };
}

/**
 * Serializes one local source registry record as a minimal BibTeX entry.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param record - Local source registry record to serialize.
 * @returns The typed result described by this helper contract.
 */
function sourceBibtex(record: LocalSourceRecord): string {
  const fields = [
    `  title = {${bibtexValue(record.workTitle)}}`,
    `  howpublished = {Local file: ${bibtexValue(record.path)}}`,
  ];
  if (record.year) fields.push(`  year = {${record.year}}`);
  return `@misc{${record.citeKey},\n${fields.join(",\n")}\n}\n`;
}

/**
 * Resolves explicit source paths or scans the default local sources folder.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param projectRoot - Absolute project root used to resolve project-relative files.
 * @param paths - Optional explicit local source paths to ingest.
 * @returns The typed result described by this helper contract.
 */
function sourceInputs(projectRoot: string, paths?: string[]): string[] {
  if (paths && paths.length > 0) return paths;
  const sourceDir = join(projectRoot, ".academic-writer", "sources");
  if (!existsSync(sourceDir)) return [];
  return readdirSync(sourceDir)
    .filter((entry) =>
      SUPPORTED_SOURCE_EXTENSIONS.has(extname(entry).toLowerCase()),
    )
    .sort()
    .map((entry) => join(".academic-writer", "sources", entry));
}

/**
 * Ingests local source files into `.academic-writer` source and bibliography caches.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param projectRoot - Absolute project root used to resolve project-relative files.
 * @param paths - Optional explicit local source paths to ingest.
 * @param signal - Optional abort signal forwarded to subprocesses.
 * @returns The typed result described by this helper contract.
 */
export async function ingestSources(
  projectRoot: string,
  paths?: string[],
  signal?: AbortSignal,
): Promise<SourceIngestionResult> {
  const sourceDirectory = ".academic-writer/sources";
  const sourcesPath = ".academic-writer/sources.json";
  const bibliographyPath = ".academic-writer/bibliography.bib";
  mkdirSync(join(projectRoot, sourceDirectory), { recursive: true });
  const usedKeys = new Set<string>();
  const sources: LocalSourceRecord[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  for (const input of sourceInputs(projectRoot, paths)) {
    const ext = extname(input).toLowerCase();
    if (!SUPPORTED_SOURCE_EXTENSIONS.has(ext)) {
      errors.push({
        path: input,
        error: `Unsupported file type: ${ext || "(none)"}`,
      });
      continue;
    }
    const extracted = await extractDocument(projectRoot, input, signal);
    if (!extracted.ok) {
      errors.push({
        path: extracted.path,
        error: extracted.error ?? "Extraction failed",
      });
      continue;
    }
    sources.push(sourceRecordFromDocument(projectRoot, extracted, usedKeys));
  }

  mkdirSync(join(projectRoot, ".academic-writer"), { recursive: true });
  writeFileSync(
    join(projectRoot, sourcesPath),
    `${JSON.stringify(sources, null, 2)}\n`,
    "utf-8",
  );
  writeFileSync(
    join(projectRoot, bibliographyPath),
    sources.map(sourceBibtex).join("\n"),
    "utf-8",
  );
  return {
    ok: errors.length === 0,
    sourceDirectory,
    sourcesPath,
    bibliographyPath,
    count: sources.length,
    sources,
    errors,
  };
}

/**
 * Copies current citation caches into article-local frozen citation assets.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param projectRoot - Absolute project root used to resolve project-relative files.
 * @param article - Article markdown path, relative to the project root unless absolute.
 * @returns The typed result described by this helper contract.
 */
export function snapshotCitationAssets(
  projectRoot: string,
  article: string,
): CitationSnapshotResult {
  const local = citationAssetPaths(article);
  const pairs = [
    [".academic-writer/sources.json", local.sources],
    [".academic-writer/bibliography.bib", local.bibliography],
  ] as const;
  const copied: string[] = [];
  const missing: string[] = [];
  mkdirSync(join(projectRoot, "articles"), { recursive: true });
  for (const [from, to] of pairs) {
    const source = join(projectRoot, from);
    if (!existsSync(source)) {
      missing.push(from);
      continue;
    }
    copyFileSync(source, join(projectRoot, to));
    copied.push(to);
  }
  return { ok: missing.length === 0, ...local, copied, missing };
}

/**
 * Counts word-like tokens for generated DOCX metadata.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param text - Input text to process.
 * @returns The typed result described by this helper contract.
 */
function countWords(text: string): number {
  const matches = text.trim().match(/[\p{L}\p{N}]+/gu);
  return matches?.length ?? 0;
}

/**
 * Parses article markdown into the JSON shape consumed by the DOCX generator.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param markdown - Value supplied by the caller.
 * @param targetLanguage - Value supplied by the caller.
 * @param titleOverride - Value supplied by the caller.
 * @returns The typed result described by this helper contract.
 */
function parseMarkdownArticle(
  markdown: string,
  targetLanguage?: string,
  titleOverride?: string,
): Record<string, unknown> {
  const lines = markdown.split(/\r?\n/);
  const titleLine = lines.find((line) => line.startsWith("# "));
  const title =
    titleOverride ?? titleLine?.replace(/^#\s+/, "").trim() ?? "Untitled";
  const thesisLine = lines.find((line) => /^\*[^*].+\*$/.test(line.trim()));
  const sections: Array<{ title: string; paragraphs: string[] }> = [];
  let current = { title: "Body", paragraphs: [] as string[] };
  let buffer: string[] = [];
  const flush = () => {
    const paragraph = buffer.join("\n").trim();
    if (
      paragraph &&
      !paragraph.startsWith("#") &&
      paragraph !== thesisLine?.trim()
    ) {
      current.paragraphs.push(paragraph);
    }
    buffer = [];
  };
  for (const line of lines) {
    if (line.startsWith("# ")) continue;
    if (line.startsWith("## ")) {
      flush();
      if (current.paragraphs.length > 0 || sections.length > 0)
        sections.push(current);
      current = { title: line.replace(/^##\s+/, "").trim(), paragraphs: [] };
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();
  if (current.paragraphs.length > 0 || sections.length === 0)
    sections.push(current);
  const isRtl = (targetLanguage ?? "Hebrew").toLowerCase().startsWith("he");
  return {
    title,
    thesis: thesisLine?.trim().replace(/^\*|\*$/g, "") ?? null,
    sections,
    format: { isRtl },
    totalWords: countWords(markdown),
  };
}

/**
 * Writes deterministic DOCX JSON for an article markdown file.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 */
export function assembleDocxJson(
  projectRoot: string,
  input: string,
  output: string,
  options: {
    title?: string;
    targetLanguage?: string;
    format?: Record<string, unknown>;
  },
): DocxAssemblyResult {
  try {
    const inputPath = resolveInputPath(projectRoot, input);
    const markdown = readFileSync(inputPath, "utf-8");
    const data = parseMarkdownArticle(
      markdown,
      options.targetLanguage,
      options.title,
    );
    data.format = {
      ...(data.format as Record<string, unknown>),
      ...(options.format ?? {}),
    };
    const outputPath = resolveInputPath(projectRoot, output);
    mkdirSync(resolve(outputPath, ".."), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
    return {
      ok: true,
      input,
      output,
      title: String(data.title),
      totalWords: Number(data.totalWords),
      sections: Array.isArray(data.sections) ? data.sections.length : 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      input,
      output,
      title: "",
      totalWords: 0,
      sections: 0,
      error: message,
    };
  }
}

/**
 * Returns whether an executable command is available on the current PATH.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param command - Executable command name to search for on PATH.
 * @returns The typed result described by this helper contract.
 */
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

/**
 * Builds deterministic local health data without probing network/MCP servers.
 *
 * @remarks
 * Provides a typed helper boundary for Academic Writer extension code.
 * @param projectRoot - Absolute project root used to resolve project-relative files.
 * @returns The typed result described by this helper contract.
 */
export function buildHealth(projectRoot: string): HealthStatus {
  return {
    ...buildStatus(projectRoot),
    commands: {
      pandoc: commandExists("pandoc"),
      xelatex: commandExists("xelatex"),
      tectonic: commandExists("tectonic"),
      zoteroMcp: commandExists("zotero-mcp"),
      notebooklm: commandExists("nlm"),
      notebooklmMcp: commandExists("notebooklm-mcp"),
      sefariaMcp: commandExists("sefaria-mcp"),
    },
    pandocVersion: (() => {
      if (!commandExists("pandoc")) return null;
      try {
        const out = execFileSync("pandoc", ["--version"], {
          encoding: "utf-8",
          timeout: 5_000,
        });
        const first = out.split("\n")[0] ?? "";
        const m = first.match(/pandoc\s+([\d.]+)/);
        return m?.[1] ?? null;
      } catch {
        return null;
      }
    })(),
  };
}
