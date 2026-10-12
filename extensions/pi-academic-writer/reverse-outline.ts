import { readFileSync, realpathSync } from "node:fs";
import { extname, resolve } from "node:path";

import {
  errorMessage,
  isErrnoException,
  isInside,
  resolveInside,
} from "../lib/fs-safe.js";

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
  const lines = source.split(/\r?\n/);
  const headings: Array<{ level: number; text: string }> = [];
  const units: ReverseOutlineUnit[] = [];
  let paragraph: string[] = [];
  let paragraphStart = 0;
  let fence: string | null = null;

  const flush = (endLine: number): void => {
    if (paragraph.length === 0) return;

    const text = paragraph.join(newline);

    units.push({
      id: `unit-${units.length + 1}`,
      ordinal: units.length + 1,
      headingPath: headings.map((heading) => heading.text),
      startLine: paragraphStart,
      endLine,
      text,
      hasCitationMarker: /\[@[^\]]+\]/.test(text),
    });
    paragraph = [];
  };

  lines.forEach((line, index) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]?.[0];

    if (marker) {
      flush(index);

      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;

      return;
    }

    if (fence !== null) return;

    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);

    if (heading?.[1] && heading[2]) {
      flush(index);

      const level = heading[1].length;

      headings.length = level - 1;
      headings[level - 1] = { level, text: heading[2] };
    } else if (/^\s*$/.test(line)) {
      flush(index);
    } else {
      if (paragraph.length === 0) paragraphStart = index + 1;
      paragraph.push(line);
    }
  });

  flush(paragraphStart + paragraph.length - 1);

  return { status: "advisory", artifact: path, units };
}
