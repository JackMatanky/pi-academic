import type { StyleDesign } from "../styling/design.js";
import type { ArticleData, ArticleFormat, Paragraph } from "./article.js";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { unzipSync } from "fflate";
import { Type, type Static } from "typebox";
import { parse as parseYaml } from "yaml";

import { resolveInside } from "../../lib/fs-safe.js";
import { parseMarkdownBlocks } from "../../lib/markdown.js";
import { loadProfile } from "../../lib/profile.js";
import { isValid, parseJsonText } from "../../lib/schema.js";
import {
  defaultReference,
  NOTE_REFS_FILTER,
  runPandoc,
} from "../core/pandoc.js";
import { cleanRtlText } from "../prose/typography.js";
import { countWords } from "../prose/word-count.js";
import { withScratchDir } from "../styling/document-style.js";
import { buildDocxReference } from "../styling/docx.js";
import { paragraphParts, parseArticle } from "./article.js";

const ArticleFrontmatterSchema = Type.Object(
  {
    title: Type.Optional(Type.String()),
    subtitle: Type.Optional(Type.String()),
    lang: Type.Optional(Type.String()),
    dir: Type.Optional(Type.String()),
    targetLanguage: Type.Optional(Type.String()),
  },
  { additionalProperties: true },
);

type ArticleFrontmatter = Static<typeof ArticleFrontmatterSchema>;

/**
 * Options passed to the DOCX generator.
 */
export interface GenerateDocxOptions {
  /**
   * A style package's DOCX reference; replaces the format-derived one
   */
  referenceDoc?: string | undefined;
  /**
   * Optional abort signal forwarded to Pandoc process
   */
  signal?: AbortSignal | undefined;
}

/**
 * Result of successfully generating a DOCX article.
 */
export interface GenerateDocxResult {
  /**
   * Indicates successful generation
   */
  ok: true;
  /**
   * Path to output DOCX document
   */
  output: string;
  /**
   * Total number of sections formatted
   */
  sections: number;
  /**
   * Total number of footnotes created
   */
  footnotes: number;
  /**
   * Estimated total word count
   */
  totalWords: number;
}

/**
 * Makes user text literal in Pandoc markdown: every ASCII punctuation mark is
 * backslash-escaped.
 *
 * @param text - Raw user text to escape.
 *
 * @returns Markdown-safe escaped text.
 */
export function escapeMarkdown(text: string): string {
  return escapeRaw(text).trim();
}

/**
 * Like escapeMarkdown but keeps the boundary spaces, for concatenating
 * segments.
 */
function escapeRaw(text: string): string {
  return text.replace(/\s+/g, " ").replace(/[!-/:-@[-`{-~]/g, "\\$&");
}

/**
 * Converts ArticleFormat settings into a minimal StyleDesign.
 *
 * @param format - Article formatting options.
 *
 * @returns Equivalent StyleDesign configuration.
 */
export function formatDesign(format: ArticleFormat = {}): StyleDesign {
  const font = format.font ?? "David";
  const body = format.bodySize ?? 11;
  const rtl = format.isRtl ?? true;
  const spacing = format.lineSpacing ?? 1.5;
  const margin = (format.margins ?? 1) * 25.4;
  const heading = format.headingSize ?? 13;
  const start = rtl ? "right" : "left";

  return {
    schemaVersion: 1,
    name: "article-format",
    page: {
      size: "Letter",
      orientation: "portrait",
      marginsMm: { top: margin, right: margin, bottom: margin, left: margin },
    },
    components: {
      title: {
        fontFamily: font,
        fontSizePt: format.titleSize ?? 16,
        bold: true,
        alignment: "center",
        spaceBeforePt: 0,
        spaceAfterPt: 6,
        lineSpacing: spacing,
      },
      subtitle: {
        fontFamily: font,
        fontSizePt: body,
        italic: true,
        bold: false,
        alignment: "center",
        spaceAfterPt: 12,
        lineSpacing: spacing,
      },
      abstractHeading: {
        fontFamily: font,
        fontSizePt: heading,
        bold: true,
        alignment: start,
        spaceBeforePt: 12,
        spaceAfterPt: 6,
        lineSpacing: spacing,
      },
      abstractBody: {
        fontFamily: font,
        fontSizePt: body,
        alignment: "justify",
        spaceAfterPt: 6,
        lineSpacing: spacing,
      },
      body: {
        fontFamily: font,
        fontSizePt: body,
        alignment: "justify",
        spaceBeforePt: 0,
        spaceAfterPt: 6,
        lineSpacing: spacing,
      },
      heading1: {
        fontFamily: font,
        fontSizePt: heading,
        bold: true,
        color: "#000000",
        alignment: start,
        spaceBeforePt: 12,
        spaceAfterPt: 6,
        lineSpacing: spacing,
      },
      footnoteText: {
        fontFamily: font,
        fontSizePt: Math.max(body - 2, 8),
        alignment: "justify",
        lineSpacing: 1,
      },
      footer: { alignment: "center" },
      pageNumber: { fontFamily: font, fontSizePt: body },
    },
  };
}

/**
 * Convert the paragraph into markdown, inserting each footnote right after the
 * first occurrence of its `after` marker at or past the previous one. Markers
 * that cannot be found are skipped, as before.
 */
function paragraphMarkdown(
  paragraph: Paragraph,
  rtl: boolean,
  definitions: string[],
): string {
  const clean = (text: string, trim = true) =>
    rtl || /[\u0590-\u05ff]/.test(text) ? cleanRtlText(text, trim) : text;

  const parts = paragraphParts(paragraph);
  const text = clean(parts.text);
  const notes = parts.footnotes;

  let cursor = 0;
  let out = "";

  for (const note of notes) {
    const marker = clean(note.after, false);
    const index = marker ? text.indexOf(marker, cursor) : -1;

    if (index < 0) {
      definitions.push(
        `[^${definitions.length + 1}]: ${escapeMarkdown(clean(note.text))}`,
      );
      out += `[^${definitions.length}]`;
      continue;
    }

    const end = index + marker.length;
    out += escapeRaw(text.slice(cursor, end));
    definitions.push(
      `[^${definitions.length + 1}]: ${escapeMarkdown(clean(note.text))}`,
    );
    out += `[^${definitions.length}]`;
    cursor = end;
  }

  return `${out}${escapeRaw(text.slice(cursor))}`.trim();
}

function div(style: string, text: string, dir?: "ltr"): string {
  const direction = dir ? ` dir="${dir}"` : "";

  return `::: {custom-style="${style}"${direction}}\n${escapeMarkdown(text)}\n:::`;
}

/**
 * An article rendered as Pandoc markdown, with its footnote count.
 */
export interface ArticleMarkdown {
  markdown: string;
  footnotes: number;
}

/**
 * Renders article structured data to Pandoc markdown with footnotes and
 * abstracts.
 *
 * @param data - Structured article content and sections.
 * @param rtl - Whether the output direction is right-to-left.
 *
 * @returns Rendered markdown text and footnote count.
 */
export function articleMarkdown(
  data: ArticleData,
  rtl: boolean,
): ArticleMarkdown {
  const clean = (text: string) => (rtl ? cleanRtlText(text) : text);
  const blocks: string[] = [];
  const definitions: string[] = [];
  const primary = data.abstract?.primary;

  if (primary) {
    blocks.push(
      div("AbstractTitle", rtl ? "תקציר" : "Abstract"),
      div("Abstract", clean(primary)),
    );
  }

  const secondary = data.abstract?.secondary;

  if (secondary) {
    // The secondary abstract runs in the opposite direction.
    const dir = rtl ? "ltr" : undefined;
    blocks.push(
      div("AbstractTitle", "Abstract", dir),
      div("Abstract", clean(secondary), dir),
    );
  }

  for (const section of data.sections) {
    if (section.title) blocks.push(`# ${escapeMarkdown(clean(section.title))}`);

    for (const paragraph of section.paragraphs) {
      const markdown = paragraphMarkdown(paragraph, rtl, definitions);

      if (markdown) blocks.push(markdown);
    }
  }

  blocks.push(...definitions);

  return {
    markdown: `${blocks.join("\n\n")}\n`,
    footnotes: definitions.length,
  };
}

function assertFootnoteCapable(path: string): void {
  const entries = unzipSync(readFileSync(path), {
    filter: (file) =>
      file.name === "word/footnotes.xml" ||
      file.name === "word/_rels/document.xml.rels",
  });

  if (
    !entries["word/footnotes.xml"] ||
    !entries["word/_rels/document.xml.rels"]
  ) {
    throw new Error(
      "Selected DOCX reference lacks required footnote parts; use a style package generated by Pi Academic or Pandoc's default reference.",
    );
  }
}

/**
 * Generates an Pi Academic DOCX with real footnotes from the article JSON,
 * using Pandoc.
 *
 * @param inputPath - Path to input article JSON.
 * @param outputPath - Path where output .docx should be written.
 * @param cwd - Working directory for path resolution.
 * @param options - Generation options including reference document.
 *
 * @returns Result summary with section and footnote counts.
 */
export async function generateDocx(
  inputPath: string,
  outputPath: string,
  cwd: string,
  options: GenerateDocxOptions = {},
): Promise<GenerateDocxResult> {
  const source = resolveInside(cwd, inputPath);
  const output = resolveInside(cwd, outputPath);
  mkdirSync(dirname(output), { recursive: true });

  if (source.endsWith(".md")) {
    const rawMarkdown = readFileSync(source, "utf8");
    const blocks = parseMarkdownBlocks(rawMarkdown);
    const frontmatterBlock = blocks.find((b) => b.type === "frontmatter");
    let frontmatter: ArticleFrontmatter = {};

    if (frontmatterBlock) {
      try {
        const yamlText = frontmatterBlock.text
          .replace(/^---\r?\n/, "")
          .replace(/\r?\n(?:---|\.\.\.)\s*$/, "");

        const parsed: unknown = parseYaml(yamlText);

        if (isValid(ArticleFrontmatterSchema, parsed)) {
          frontmatter = parsed;
        }
      } catch {
        frontmatter = {};
      }
    }

    const lang = frontmatter.lang;
    const dir = frontmatter.dir;
    const targetLanguage = frontmatter.targetLanguage?.toLowerCase() ?? "";
    const profile = loadProfile(cwd);
    const profileLang = profile?.targetLanguage?.toLowerCase() ?? "";
    const hasHebrewChars = /[\u0590-\u05ff]/.test(rawMarkdown);

    const isHebrew =
      Boolean(lang?.startsWith("he")) ||
      dir === "rtl" ||
      targetLanguage.includes("hebrew") ||
      targetLanguage.startsWith("he") ||
      profileLang.includes("hebrew") ||
      profileLang.startsWith("he") ||
      hasHebrewChars;

    const rtl = dir === "rtl" || isHebrew;

    let title = frontmatter.title;
    let subtitle = frontmatter.subtitle;
    let markdown = rawMarkdown;

    const firstHeadingIndex = blocks.findIndex(
      (b) => b.type === "heading" && b.level === 1,
    );

    const firstHeading =
      firstHeadingIndex >= 0 ? blocks[firstHeadingIndex] : undefined;

    if (!title && firstHeading?.headingText) {
      title = firstHeading.headingText;
      markdown = markdown.replace(firstHeading.text, "");

      if (!subtitle && firstHeadingIndex + 1 < blocks.length) {
        const nextBlock = blocks[firstHeadingIndex + 1];

        if (
          nextBlock?.type === "paragraph" &&
          (/^\*[^*\n]+\*$/.test(nextBlock.text.trim()) ||
            /^_[^_\n]+_$/.test(nextBlock.text.trim()))
        ) {
          subtitle = nextBlock.text.trim().slice(1, -1);
          markdown = markdown.replace(nextBlock.text, "");
        }
      }
    }

    if (rtl) {
      markdown = cleanRtlText(markdown, false);
    }

    const args = [
      "-f",
      "markdown-smart+footnotes+tex_math_dollars",
      NOTE_REFS_FILTER,
      "-o",
      output,
    ];

    if (!lang) {
      args.push("-M", `lang=${isHebrew ? "he-IL" : "en-US"}`);
    }

    if (!dir) {
      args.push("-M", `dir=${rtl ? "rtl" : "ltr"}`);
    }

    if (title && !frontmatter.title) {
      args.push("-M", `title=${rtl ? cleanRtlText(title) : title}`);
    }

    if (subtitle && !frontmatter.subtitle) {
      args.push("-M", `subtitle=${rtl ? cleanRtlText(subtitle) : subtitle}`);
    }

    const run = async (reference: string) => {
      await runPandoc([...args, `--reference-doc=${reference}`], {
        cwd,
        signal: options.signal,
        input: markdown,
      });
    };

    if (options.referenceDoc) {
      assertFootnoteCapable(options.referenceDoc);
      await run(options.referenceDoc);
    } else {
      await withScratchDir(cwd, "docx", async (scratch) => {
        const built = buildDocxReference(
          formatDesign({ isRtl: rtl }),
          await defaultReference("docx", { signal: options.signal }),
          new Map(),
        );

        const reference = resolve(scratch, "reference.docx");
        writeFileSync(reference, built.bytes);
        await run(reference);
      });
    }

    if (!existsSync(output))
      throw new Error(
        "Pandoc exited successfully but did not create the output file",
      );

    const footnoteMatches = markdown.match(/\[\^[^\]]+\]/g) ?? [];

    const uniqueFootnotes = new Set(
      footnoteMatches.map((m) => m.replace(/:\s*$/, "")),
    );

    const headingBlocks = blocks.filter((b) => b.type === "heading");

    return {
      ok: true,
      output: outputPath,
      sections: headingBlocks.length,
      footnotes: uniqueFootnotes.size,
      totalWords: countWords(markdown),
    };
  }

  const data = parseArticle(parseJsonText(readFileSync(source, "utf8")));
  const rtl = data.format?.isRtl ?? true;
  const { markdown, footnotes } = articleMarkdown(data, rtl);

  const args = [
    "-f",
    "markdown-smart",
    "-M",
    `lang=${rtl ? "he-IL" : "en-US"}`,
    "-M",
    `dir=${rtl ? "rtl" : "ltr"}`,
  ];

  if (data.title)
    args.push("-M", `title=${rtl ? cleanRtlText(data.title) : data.title}`);

  if (data.thesis)
    args.push(
      "-M",
      `subtitle=${rtl ? cleanRtlText(data.thesis) : data.thesis}`,
    );

  const run = async (reference: string) => {
    await runPandoc([...args, `--reference-doc=${reference}`, "-o", output], {
      cwd,
      signal: options.signal,
      input: markdown,
    });
  };

  if (options.referenceDoc) {
    assertFootnoteCapable(options.referenceDoc);
    await run(options.referenceDoc);
  } else {
    await withScratchDir(cwd, "docx", async (dir) => {
      const built = buildDocxReference(
        formatDesign(data.format),
        await defaultReference("docx", { signal: options.signal }),
        new Map(),
      );

      const reference = resolve(dir, "reference.docx");
      writeFileSync(reference, built.bytes);
      await run(reference);
    });
  }

  if (!existsSync(output))
    throw new Error(
      "Pandoc exited successfully but did not create the output file",
    );

  return {
    ok: true,
    output: outputPath,
    sections: data.sections.length,
    footnotes,
    totalWords: data.totalWords ?? 0,
  };
}
