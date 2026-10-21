import { readFileSync, realpathSync } from "node:fs";
import { extname, resolve } from "node:path";

import {
  errorMessage,
  isErrnoException,
  isInside,
  resolveInside,
} from "../../lib/fs-safe.js";
import { parseMarkdownBlocks } from "../../lib/markdown.js";

/**
 * One heading or paragraph-sized block of an article.
 */
export interface ReverseOutlineUnit {
  id: string;
  ordinal: number;
  headingPath: string[];
  startLine: number;
  endLine: number;
  text: string;
  hasCitationMarker: boolean;
}

/**
 * An article segmented into exact paragraph units, or why it could not be.
 */
export type ReverseOutlineResult =
  | { status: "advisory"; artifact: string; units: ReverseOutlineUnit[] }
  | { status: "error"; artifact: string; reason: string; units: [] };

/**
 * Segments an article under `articles/` into paragraph units with their heading
 * path and line range. Read-only; fenced code is skipped.
 *
 * @param root - Root directory of the project.
 * @param article - Article file name or path relative to project.
 *
 * @returns Advisory reverse outline units or error result.
 */
export function reverseOutline(
  root: string,
  article: string,
): ReverseOutlineResult {
  const articles = resolve(root, "articles");
  const path = resolve(root, article);

  const outside = (): ReverseOutlineResult => ({
    status: "error",
    artifact: article,
    reason: "Article must be a Markdown file inside project articles/.",
    units: [],
  });

  if (!isInside(articles, path) || extname(path).toLowerCase() !== ".md")
    return outside();

  // Symlinks defeat the lexical check: the real file must stay inside the
  // real articles directory. A missing article keeps the read error below.
  try {
    resolveInside(root, article);

    if (!isInside(realpathSync(articles), realpathSync(path))) return outside();
  } catch (cause) {
    if (!(isErrnoException(cause) && cause.code === "ENOENT")) return outside();
  }

  let source: string;

  try {
    source = readFileSync(path, "utf8");
  } catch (cause) {
    return {
      status: "error",
      artifact: path,
      reason: errorMessage(cause),
      units: [],
    };
  }

  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const headings: Array<{ level: number; text: string }> = [];
  const units: ReverseOutlineUnit[] = [];

  for (const block of parseMarkdownBlocks(source)) {
    if (
      block.type === "frontmatter" ||
      block.type === "fence" ||
      block.type === "blank"
    )
      continue;

    if (block.type === "heading") {
      const level = block.level ?? 1;

      headings.length = level - 1;
      headings[level - 1] = { level, text: block.headingText ?? "" };
      continue;
    }

    const text = block.text.replaceAll("\n", newline);

    units.push({
      id: `unit-${units.length + 1}`,
      ordinal: units.length + 1,
      headingPath: headings.map((heading) => heading.text),
      startLine: block.startLine,
      endLine: block.endLine,
      text,
      hasCitationMarker: /\[@[^\]]+\]/.test(text),
    });
  }

  return { status: "advisory", artifact: path, units };
}
