import { readFileSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";

type Unit = {
  id: string;
  ordinal: number;
  headingPath: string[];
  startLine: number;
  endLine: number;
  text: string;
  hasCitationMarker: boolean;
};

export function reverseOutline(
  root: string,
  article: string,
): Record<string, unknown> {
  const path = resolve(root, article);
  const articles = resolve(root, "articles");
  const rel = relative(articles, path);
  if (
    isAbsolute(rel) ||
    rel.startsWith("..") ||
    extname(path).toLowerCase() !== ".md"
  )
    return {
      status: "error",
      artifact: article,
      reason: "Article must be a Markdown file inside project articles/.",
      units: [],
    };
  let source: string;
  let newline: string;
  try {
    source = readFileSync(path, "utf8");
    newline = source.includes("\r\n") ? "\r\n" : "\n";
  } catch (error) {
    return {
      status: "error",
      artifact: path,
      reason: error instanceof Error ? error.message : String(error),
      units: [],
    };
  }
  const lines = source.split(/\r?\n/);
  const headings: Array<{ level: number; text: string }> = [];
  const units: Unit[] = [];
  let paragraph: string[] = [];
  let paragraphStart = 0;
  let fence: string | null = null;
  const flush = (endLine: number): void => {
    if (paragraph.length) {
      const text = paragraph.join(newline);
      units.push({
        id: `unit-${units.length + 1}`,
        ordinal: units.length + 1,
        headingPath: headings.map((h) => h.text),
        startLine: paragraphStart,
        endLine,
        text,
        hasCitationMarker: /\[@[^\]]+\]/.test(text),
      });
      paragraph = [];
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      flush(i);
      const marker = fenceMatch[1]![0]!;
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      flush(i);
      const level = heading[1]!.length;
      headings.length = level - 1;
      headings[level - 1] = { level, text: heading[2]! };
    } else if (/^\s*$/.test(line)) flush(i);
    else {
      if (!paragraph.length) paragraphStart = i + 1;
      paragraph.push(line);
    }
  }
  flush(paragraphStart + paragraph.length - 1);
  return { status: "advisory", artifact: path, units };
}
