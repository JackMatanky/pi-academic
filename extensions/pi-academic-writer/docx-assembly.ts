import { readFileSync } from "node:fs";
import {
  errorMessage,
  resolveInside,
  writeFileAtomic,
} from "../lib/fs-safe.js";
import { fenceAfter } from "../lib/markdown.js";

type Paragraph =
  | string
  | { text: string; footnotes: Array<{ after: string; text: string }> };

/** Deterministic DOCX JSON assembly result. */
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
 * Counts word-like tokens for generated DOCX metadata.
 *
 * @param text - Input text to process.
 */
function countWords(text: string): number {
  const matches = text.trim().match(/[\p{L}\p{N}]+/gu);

  return matches?.length ?? 0;
}

/** Parses article markdown into the JSON shape consumed by the DOCX generator. */
function parseMarkdownArticle(
  markdown: string,
  targetLanguage?: string,
  titleOverride?: string,
): Record<string, unknown> {
  const definitions = new Map<string, string>();
  const body: string[] = [];
  const source = markdown.split(/\r?\n/);
  let fence: string | null = null;

  for (let i = 0; i < source.length; i++) {
    const line = source[i] ?? "";
    const inCode = fence !== null;
    fence = fenceAfter(line, fence);

    const definition =
      inCode || fence !== null ? null : /^\[\^([^\]]+)\]:\s*(.*)$/.exec(line);

    if (!definition) {
      body.push(line);
      continue;
    }

    const parts = [definition[2] ?? ""];

    while (/^(?: {4}|\t)\S/.test(source[i + 1] ?? "")) {
      i += 1;
      parts.push((source[i] ?? "").trim());
    }

    definitions.set(definition[1] ?? "", parts.join(" ").trim());
  }

  let title: string | undefined;
  let thesis: string | null = null;
  const sections: Array<{ title: string; paragraphs: Paragraph[] }> = [];

  let current: { title: string; paragraphs: Paragraph[] } = {
    title: "Body",
    paragraphs: [],
  };

  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join("\n").trim();
    buffer = [];

    if (!text) return;

    // The italic thesis line is only recognised between the title and the first section.
    if (
      thesis === null &&
      sections.length === 0 &&
      current.paragraphs.length === 0 &&
      /^\*[^*\n]+\*$/.test(text)
    ) {
      thesis = text.slice(1, -1);

      return;
    }

    current.paragraphs.push(withFootnotes(text, definitions));
  };

  fence = null;

  for (const line of body) {
    const inCode = fence !== null;
    fence = fenceAfter(line, fence);

    const heading =
      inCode || fence !== null ? null : /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);

    if (heading) {
      flush();
      const text = heading[2] ?? "";

      if (heading[1] === "#" && title === undefined) {
        title = text;
        continue;
      }

      // The DOCX schema has one section level, so deeper headings become sections too.
      if (current.paragraphs.length > 0 || sections.length > 0)
        sections.push(current);
      current = { title: text, paragraphs: [] };
    } else if (line.trim() === "" && fence === null) {
      flush();
    } else {
      buffer.push(line);
    }
  }

  flush();

  if (current.paragraphs.length > 0 || sections.length === 0)
    sections.push(current);
  const isRtl = (targetLanguage ?? "Hebrew").toLowerCase().startsWith("he");

  return {
    title: titleOverride ?? title ?? "Untitled",
    thesis,
    sections,
    format: { isRtl },
    totalWords: countWords(markdown),
  };
}

/**
 * Converts `[^id]` references into the `{text, footnotes:[{after, text}]}` paragraph shape.
 *
 * Each footnote anchors on the text since the previous reference, so the generator's
 * forward search always finds it. Unknown references stay literal.
 */
function withFootnotes(
  text: string,
  definitions: Map<string, string>,
): Paragraph {
  if (/^ {0,3}(?:`{3,}|~{3,})/.test(text)) return text;
  const notes: Array<{ after: string; text: string }> = [];
  let plain = "";
  let last = 0;
  let segmentStart = 0;

  for (const match of text.matchAll(/\[\^([^\]]+)\]/g)) {
    const note = definitions.get(match[1] ?? "");
    plain += text.slice(last, match.index);
    last = match.index + match[0].length;

    if (note === undefined) {
      plain += match[0];
      continue;
    }

    const segment = plain.slice(segmentStart);
    const previous = notes[notes.length - 1];

    if (segment === "" && previous) previous.text += ` ${note}`;
    else notes.push({ after: segment, text: note });
    segmentStart = plain.length;
  }

  plain += text.slice(last);

  return notes.length > 0 ? { text: plain, footnotes: notes } : plain;
}

/**
 * Writes deterministic DOCX JSON for an article markdown file.
 *
 * Both paths must stay inside the project.
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
    const markdown = readFileSync(resolveInside(projectRoot, input), "utf-8");

    const data = parseMarkdownArticle(
      markdown,
      options.targetLanguage,
      options.title,
    );

    data.format = {
      ...(data.format as Record<string, unknown>),
      ...options.format,
    };
    writeFileAtomic(
      resolveInside(projectRoot, output),
      `${JSON.stringify(data, null, 2)}\n`,
    );

    return {
      ok: true,
      input,
      output,
      title: String(data.title),
      totalWords: Number(data.totalWords),
      sections: Array.isArray(data.sections) ? data.sections.length : 0,
    };
  } catch (error) {
    return {
      ok: false,
      input,
      output,
      title: "",
      totalWords: 0,
      sections: 0,
      error: errorMessage(error),
    };
  }
}
