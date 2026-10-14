import type { MarkdownBlock } from "../../lib/markdown.js";
import type { ArticleData, ArticleFormat, Paragraph } from "./article.js";

import { readFileSync } from "node:fs";

import {
  errorMessage,
  resolveInside,
  writeFileAtomic,
} from "../../lib/fs-safe.js";
import { parseMarkdownBlocks } from "../../lib/markdown.js";
import { cleanRtlText } from "../prose/typography.js";
import { countWords } from "../prose/word-count.js";

/**
 * A section of an assembled article; assembly always titles its sections.
 */
interface Section {
  title: string;
  paragraphs: Paragraph[];
}

/**
 * Overrides for an assembled article.
 */
export interface AssemblyOptions {
  title?: string | undefined;
  targetLanguage?: string | undefined;
  format?: ArticleFormat | undefined;
}

/**
 * Deterministic DOCX JSON assembly result.
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
 * Parses article markdown into the JSON shape consumed by the DOCX generator.
 */
function parseMarkdownArticle(
  markdown: string,
  targetLanguage?: string,
  titleOverride?: string,
): ArticleData & { title: string; sections: Section[] } {
  const isRtl = /hebrew|עברית/i.test(targetLanguage ?? "");
  const definitions = new Map<string, string>();
  const body: MarkdownBlock[] = [];

  // Footnote definitions are lifted out of paragraph blocks; the remaining
  // lines stay in the body.
  for (const block of parseMarkdownBlocks(markdown)) {
    if (block.type !== "paragraph") {
      if (block.type !== "frontmatter") body.push(block);
      continue;
    }

    const lines = block.text.split("\n");
    const kept: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const definition = /^\[\^([^\]]+)\]:\s*(.*)$/.exec(lines[i] ?? "");

      if (!definition) {
        kept.push(lines[i] ?? "");
        continue;
      }

      const parts = [definition[2] ?? ""];

      while (/^(?: {4}|\t)\S/.test(lines[i + 1] ?? "")) {
        i += 1;
        parts.push((lines[i] ?? "").trim());
      }

      definitions.set(definition[1] ?? "", parts.join(" ").trim());
    }

    body.push({ ...block, text: kept.join("\n") });
  }

  let title: string | undefined;
  let thesis: string | null = null;
  const sections: Section[] = [];

  let current: Section = {
    title: "Body",
    paragraphs: [],
  };

  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join("\n").trim();
    buffer = [];

    if (!text) return;

    // The italic thesis line is only recognised between the title and the first
    // section.
    if (
      thesis === null &&
      sections.length === 0 &&
      current.paragraphs.length === 0 &&
      /^\*[^*\n]+\*$/.test(text)
    ) {
      thesis = text.slice(1, -1);

      return;
    }

    current.paragraphs.push(withFootnotes(text, definitions, isRtl));
  };

  for (const block of body) {
    if (block.type === "blank") {
      flush();
      continue;
    }

    if (block.type === "fence") {
      buffer.push(block.text);
      continue;
    }

    if (block.type === "heading") {
      flush();
      const text = block.headingText ?? "";

      if (block.level === 1 && title === undefined) {
        title = text;
        continue;
      }

      // The DOCX schema has one section level, so deeper headings become
      // sections too.
      if (current.paragraphs.length > 0 || sections.length > 0)
        sections.push(current);
      current = { title: text, paragraphs: [] };
    } else {
      buffer.push(block.text);
    }
  }

  flush();

  if (current.paragraphs.length > 0 || sections.length === 0)
    sections.push(current);

  return {
    title: titleOverride ?? title ?? "Untitled",
    thesis,
    sections,
    format: { isRtl },
    totalWords: countWords(markdown),
  };
}

/**
 * Converts `[^id]` references into the `{text, footnotes:[{after, text}]}`
 * paragraph shape.
 *
 * Each footnote anchors on the text since the previous reference, so the
 * generator's forward search always finds it. Unknown references stay literal.
 */
function withFootnotes(
  text: string,
  definitions: Map<string, string>,
  isRtl = false,
): Paragraph {
  if (/^ {0,3}(?:`{3,}|~{3,})/.test(text)) return text;
  const shouldClean = isRtl || /[\u0590-\u05ff]/.test(text);
  const input = shouldClean ? cleanRtlText(text, false) : text;
  const notes: Array<{ after: string; text: string }> = [];
  let plain = "";
  let last = 0;
  let segmentStart = 0;

  for (const match of input.matchAll(/\[\^([^\]]+)\]/g)) {
    const note = definitions.get(match[1] ?? "");
    plain += input.slice(last, match.index);
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

  plain += input.slice(last);

  return notes.length > 0 ? { text: plain, footnotes: notes } : plain;
}

/**
 * Writes deterministic DOCX JSON for an article markdown file.
 *
 * Both paths must stay inside the project.
 *
 * @param projectRoot - Root directory of the project.
 * @param input - Relative or absolute path to source Markdown file.
 * @param output - Destination path for assembled JSON.
 * @param options - Assembly options such as target language and title.
 *
 * @returns Assembly result indicating success, word count, and output path.
 */
export function assembleDocxJson(
  projectRoot: string,
  input: string,
  output: string,
  options: AssemblyOptions,
): DocxAssemblyResult {
  try {
    const markdown = readFileSync(resolveInside(projectRoot, input), "utf-8");

    const data = parseMarkdownArticle(
      markdown,
      options.targetLanguage,
      options.title,
    );

    const article = { ...data, format: { ...data.format, ...options.format } };

    writeFileAtomic(
      resolveInside(projectRoot, output),
      `${JSON.stringify(article, null, 2)}\n`,
    );

    return {
      ok: true,
      input,
      output,
      title: data.title,
      totalWords: data.totalWords ?? 0,
      sections: data.sections.length,
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
