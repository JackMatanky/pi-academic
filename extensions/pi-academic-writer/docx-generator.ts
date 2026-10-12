import type { ArticleData, ArticleFormat, Paragraph } from "./article.js";
import type { StyleDesign } from "./style-design.js";

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { unzipSync } from "fflate";

import { resolveInside } from "../lib/fs-safe.js";
import { parseJsonText } from "../lib/schema.js";
import { paragraphParts, parseArticle } from "./article.js";
import { withScratchDir } from "./document-style.js";
import { defaultReference, runPandoc } from "./pandoc.js";
import { buildDocxReference } from "./style-docx.js";

export interface GenerateDocxOptions {
  /**
   * A style package's DOCX reference; replaces the format-derived one.
   */
  referenceDoc?: string | undefined;
  signal?: AbortSignal | undefined;
}

export interface GenerateDocxResult {
  ok: true;
  output: string;
  sections: number;
  footnotes: number;
  totalWords: number;
}

/**
 * Typography fixes for Hebrew: spaced hyphen for em dashes, gereshayim for
 * paired straight quotes around Hebrew text, and no stray directional marks.
 * Orphan leading punctuation (a mark followed by whitespace) is dropped only
 * from paragraph text, never from match markers, so `.NET` is left alone.
 */
export function cleanRtlText(text: string, trimOrphan = true): string {
  let out = text
    .replace(/\s*\u2014\s*/g, " - ")
    .replace(/"([^"]{0,200})"/g, (quoted, inner: string) =>
      /[\u0590-\u05ff]/.test(inner) ? `\u05f4${inner}\u05f4` : quoted,
    )
    .replace(/\u200f+(?=[.,;:)\]"])/g, "")
    .replace(/(?<=[([])\u200e+/g, "")
    .replace(/[\u200e\u200f]{2,}/g, "");

  if (trimOrphan) out = out.replace(/^\s*[.,;:](?=\s)/, "").trim();

  return out;
}

/**
 * Make user text literal in Pandoc markdown: every ASCII punctuation mark is
 * backslash-escaped.
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
 * The styles the original generator produced, expressed as a style design.
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
    rtl ? cleanRtlText(text, trim) : text;

  const parts = paragraphParts(paragraph);
  const text = clean(parts.text);
  const notes = parts.footnotes;

  let cursor = 0;
  let out = "";

  for (const note of notes) {
    const marker = clean(note.after, false);
    const index = marker ? text.indexOf(marker, cursor) : -1;

    if (index < 0) continue;
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
      "Selected DOCX reference lacks required footnote parts; use a style package generated by Academic Writer or Pandoc's default reference.",
    );
  }
}

/**
 * Generate a DOCX with real footnotes from the article JSON, using Pandoc.
 */
export async function generateDocx(
  inputPath: string,
  outputPath: string,
  cwd: string,
  options: GenerateDocxOptions = {},
): Promise<GenerateDocxResult> {
  const source = resolveInside(cwd, inputPath);
  const output = resolveInside(cwd, outputPath);
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
