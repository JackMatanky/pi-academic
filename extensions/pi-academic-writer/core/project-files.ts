import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";

import { resolveInside, writeFileAtomic } from "../../lib/fs-safe.js";

/**
 * Deterministic article output paths derived from a researcher-provided
 * subject.
 */
export interface ArticlePaths {
  slug: string;
  markdown: string;
  docx: string;
  json: string;
  sources: string;
  bibliography: string;
  outlineJson: string;
  outlineMarkdown: string;
  notesSnapshot: string;
}

/**
 * Project article or corpus file metadata returned by listing tools.
 */
export interface ProjectFile {
  name: string;
  path: string;
  ext: string;
  mtimeMs: number;
}

/**
 * Newest-first file listing for an Academic Writer project directory.
 */
export interface ProjectFileList {
  kind: "articles" | "past_articles";
  dir: string;
  count: number;
  files: ProjectFile[];
}

/**
 * Article-local citation asset paths used for frozen snapshots.
 */
export interface CitationAssetPaths {
  sources: string;
  bibliography: string;
}

/**
 * Returns a project-relative path, falling back to the basename for the root
 * itself.
 *
 * @param projectRoot - Absolute project root used to resolve project-relative
 *   files.
 * @param path - File path to read, write, or resolve.
 */
export function toRelative(projectRoot: string, path: string): string {
  return relative(projectRoot, path) || basename(path);
}

/**
 * Normalizes free-form subjects into stable filesystem-safe article slugs.
 *
 * @param value - Raw value to parse or normalize.
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
 * Builds one deterministic article slug and output path set.
 *
 * @param subject - Researcher-provided article subject.
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
    outlineJson: "articles/" + slug + ".outline.json",
    outlineMarkdown: "articles/" + slug + ".outline.md",
    notesSnapshot: "articles/" + slug + ".notes.json",
  };
}

/**
 * Derives article-local source and bibliography snapshot paths.
 *
 * @param article - Article markdown path, relative to the project root unless
 *   absolute.
 */
export function citationAssetPaths(article: string): CitationAssetPaths {
  const base = article.replace(/\.[^./]+$/, "");

  return {
    sources: `${base}.sources.json`,
    bibliography: `${base}.bibliography.bib`,
  };
}

/**
 * Lists project article or corpus files in newest-first order.
 *
 * @param projectRoot - Absolute project root used to resolve project-relative
 *   files.
 * @param kind - Project file bucket to list.
 * @param limit - Maximum number of files to return.
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
 * Result of writing a project text file.
 */
export interface ProjectTextWrite {
  ok: true;
  path: string;
}

/**
 * Writes UTF-8 text to a project-relative path, creating parent directories as
 * needed.
 *
 * @param projectRoot - Absolute project root used to resolve project-relative
 *   files.
 * @param relativePath - Project-relative output path.
 * @param content - Text content to write.
 */
export function writeProjectTextFile(
  projectRoot: string,
  relativePath: string,
  content: string,
): ProjectTextWrite {
  writeFileAtomic(resolveInside(projectRoot, relativePath), content);

  return { ok: true, path: relativePath };
}
