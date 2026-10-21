import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

import { DOMParser } from "@xmldom/xmldom";
import { unzipSync } from "fflate";

import { resolveInside, writeFileAtomic } from "../../lib/fs-safe.js";
import { PACKAGE_ROOT } from "../../lib/paths.js";
import { linkNoteRefs } from "../citations/note-refs.js";
import { runPandoc } from "../core/pandoc.js";
import { articlePaths, toRelative } from "../core/project-files.js";
import { separateFootnotes } from "../prose/word-count.js";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/**
 * How Pandoc treats tracked changes in the Word file.
 */
export type TrackChanges = "accept" | "reject" | "all";

/**
 * Options for {@link importDocx}.
 */
export interface ImportDocxOptions {
  /**
   * Project-relative `.md` destination; defaults to `articles/<slug>.md`.
   */
  output?: string | undefined;
  /**
   * Replace an existing destination file.
   */
  overwrite?: boolean | undefined;
  trackChanges?: TrackChanges | undefined;
  /**
   * Drop Word highlighting, keeping the highlighted text.
   */
  stripHighlights?: boolean | undefined;
  signal?: AbortSignal | undefined;
}

/**
 * Result of a DOCX import.
 */
export interface ImportDocxResult {
  /**
   * Project-relative path of the written markdown.
   */
  output: string;
  /**
   * Project-relative media directory, present only when images were extracted.
   */
  media: string | null;
  /**
   * Footnote definitions in the written markdown.
   */
  footnotes: number;
  /**
   * Real footnotes and endnotes in the Word file.
   */
  sourceNotes: number;
  /**
   * Metadata fields written to the YAML block at the top of the markdown.
   */
  metadata: string[];
  /**
   * Literal note cross-references ("note 19 above") converted to links.
   */
  noteRefs: number;
  warnings: string[];
}

/**
 * Counts footnotes and endnotes in a DOCX, skipping Word's separator parts.
 */
function countSourceNotes(docxPath: string): number {
  const parts = unzipSync(readFileSync(docxPath), {
    filter: (file) =>
      file.name === "word/footnotes.xml" || file.name === "word/endnotes.xml",
  });

  let count = 0;

  for (const [name, bytes] of Object.entries(parts)) {
    const tag = name.endsWith("footnotes.xml") ? "footnote" : "endnote";

    const doc = new DOMParser().parseFromString(
      Buffer.from(bytes).toString("utf8"),
      "text/xml",
    );

    const notes = doc.getElementsByTagNameNS(WORD_NS, tag);

    for (let i = 0; i < notes.length; i++) {
      if (!notes.item(i)?.getAttributeNS(WORD_NS, "type")) count += 1;
    }
  }

  return count;
}

interface LanguageFields {
  lang?: string;
  dir?: string;
}

interface MetadataBlock {
  text: string;
  keys: string[];
}

/**
 * Scripts whose languages run right to left.
 */
const RTL_LANGUAGES = new Set(["he", "ar", "fa", "ur", "yi", "ps", "sd", "ug"]);

/**
 * The language and direction to record for the article. Word's default proofing
 * language is often English even for a Hebrew manuscript, so the script of the
 * text decides when they disagree.
 */
function documentLanguage(docxPath: string, body: string): LanguageFields {
  const hebrew = (body.match(/[\u0590-\u05ff]/g) ?? []).length;
  const latin = (body.match(/[A-Za-z]/g) ?? []).length;

  const styles = unzipSync(readFileSync(docxPath), {
    filter: (file) => file.name === "word/styles.xml",
  })["word/styles.xml"];

  const declared = styles
    ? /<w:docDefaults>[\s\S]*?<w:lang\s[^>]*?w:val="([^"]+)"/.exec(
        Buffer.from(styles).toString("utf8"),
      )?.[1]
    : undefined;

  const declaredRtl = RTL_LANGUAGES.has(
    declared?.split("-")[0]?.toLowerCase() ?? "",
  );

  if (hebrew > latin)
    return { lang: declared && declaredRtl ? declared : "he-IL", dir: "rtl" };

  return declared && !declaredRtl ? { lang: declared } : {};
}

/**
 * The YAML metadata block at the top of the markdown, if any, and its keys.
 */
function metadataBlock(markdown: string): MetadataBlock {
  const text = /^---\n[\s\S]*?\n(?:---|\.\.\.)\n/.exec(markdown)?.[0] ?? "";

  return { text, keys: text.match(/^[A-Za-z][\w-]*(?=:)/gm) ?? [] };
}

/**
 * Adds the detected language and direction to the metadata block, creating it
 * when Pandoc wrote none. A field the block already has is not overridden.
 */
function withMetadata(
  markdown: string,
  fields: { lang?: string; dir?: string },
): string {
  const { text, keys } = metadataBlock(markdown);

  const lines = Object.entries(fields)
    .filter(([key]) => !keys.includes(key))
    .map(([key, value]) => `${key}: ${value}`);

  if (lines.length === 0) return markdown;

  if (!text) return `---\n${lines.join("\n")}\n---\n\n${markdown}`;

  const closing = text.lastIndexOf("\n", text.length - 2) + 1;

  return `${text.slice(0, closing)}${lines.join("\n")}\n${text.slice(closing)}${markdown.slice(text.length)}`;
}

/**
 * Converts a Word document to Pandoc markdown with its footnotes as `[^n]`
 * definitions, so the result can feed the edit/review/export workflows. Word's
 * own citation fields are rendered as plain text, never as `[@key]`: their keys
 * do not belong to the project's `sources.json`.
 *
 * @param cwd - Project root.
 * @param inputPath - Project-relative `.docx` file.
 * @param options - Destination, overwrite, and tracked-changes handling.
 *
 * @returns Where the markdown went, plus footnote counts and warnings.
 * @throws When the paths are invalid, the destination exists without
 *   `overwrite`, or Pandoc fails.
 */
export async function importDocx(
  cwd: string,
  inputPath: string,
  options: ImportDocxOptions = {},
): Promise<ImportDocxResult> {
  const source = resolveInside(cwd, inputPath);

  if (!/\.docx$/i.test(source)) throw new Error("Input must be a .docx file.");

  if (!existsSync(source)) throw new Error(`File not found: ${inputPath}`);

  const output = resolveInside(
    cwd,
    options.output ??
      articlePaths(basename(source).replace(/\.docx$/i, "")).markdown,
  );

  if (!output.endsWith(".md")) throw new Error("Output must be a .md file.");

  if (existsSync(output) && !options.overwrite) {
    throw new Error(
      `${toRelative(cwd, output)} already exists; pass overwrite: true to replace it.`,
    );
  }

  const outDir = dirname(output);
  mkdirSync(outDir, { recursive: true });

  // Pandoc writes image links relative to its cwd, so run it beside the
  // markdown to keep them valid wherever the article lives.
  const mediaName = `${basename(output, ".md")}.media`;

  const imported = (
    await runPandoc(
      [
        "-f",
        "docx",
        "-t",
        "markdown-smart",
        // Standalone, so the Word title, author and date become a YAML block
        // instead of being dropped.
        "-s",
        "--wrap=none",
        "--markdown-headings=atx",
        `--track-changes=${options.trackChanges ?? "accept"}`,
        `--extract-media=${mediaName}`,
        `--lua-filter=${join(PACKAGE_ROOT, "extensions", "pandoc", "unwrap-link-underline.lua")}`,
        ...(options.stripHighlights
          ? [
              `--lua-filter=${join(PACKAGE_ROOT, "extensions", "pandoc", "strip-highlight.lua")}`,
            ]
          : []),
        source,
      ],
      { cwd: outDir, signal: options.signal },
    )
  ).toString("utf8");

  const withMeta = withMetadata(imported, documentLanguage(source, imported));
  const footnotes = separateFootnotes(withMeta).footnoteDefinitions.size;
  const sourceNotes = countSourceNotes(source);
  const warnings: string[] = [];

  if (footnotes !== sourceNotes) {
    warnings.push(
      `The Word file has ${sourceNotes} footnote/endnote(s) but the markdown has ${footnotes}; check for unreferenced or merged notes.`,
    );
  }

  // A literal "note 19" is only known to name note 19 when the markdown labels
  // match Word's numbering, so a count mismatch leaves them as written.
  const linked = footnotes === sourceNotes ? linkNoteRefs(withMeta) : undefined;

  const markdown = linked?.markdown ?? withMeta;

  if (linked?.unresolved.length) {
    warnings.push(
      `Cross-references to a note that does not exist were left as written: ${linked.unresolved.join("; ")}.`,
    );
  }

  writeFileAtomic(output, markdown.endsWith("\n") ? markdown : `${markdown}\n`);

  const mediaDir = join(outDir, mediaName);

  return {
    output: toRelative(cwd, output),
    media: existsSync(mediaDir) ? relative(cwd, mediaDir) : null,
    metadata: metadataBlock(markdown).keys,
    footnotes,
    sourceNotes,
    noteRefs: linked?.linked ?? 0,
    warnings,
  };
}
