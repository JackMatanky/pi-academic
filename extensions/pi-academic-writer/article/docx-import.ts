import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

import { DOMParser } from "@xmldom/xmldom";
import { unzipSync } from "fflate";

import { resolveInside, writeFileAtomic } from "../../lib/fs-safe.js";
import { PACKAGE_ROOT } from "../../lib/paths.js";
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

  const markdown = (
    await runPandoc(
      [
        "-f",
        "docx",
        "-t",
        "markdown-smart",
        "--wrap=none",
        "--markdown-headings=atx",
        `--track-changes=${options.trackChanges ?? "accept"}`,
        `--extract-media=${mediaName}`,
        `--lua-filter=${join(PACKAGE_ROOT, "templates", "pandoc", "unwrap-link-underline.lua")}`,
        source,
      ],
      { cwd: outDir, signal: options.signal },
    )
  ).toString("utf8");

  writeFileAtomic(output, markdown.endsWith("\n") ? markdown : `${markdown}\n`);

  const footnotes = separateFootnotes(markdown).footnoteDefinitions.size;
  const sourceNotes = countSourceNotes(source);
  const warnings: string[] = [];

  if (footnotes !== sourceNotes) {
    warnings.push(
      `The Word file has ${sourceNotes} footnote/endnote(s) but the markdown has ${footnotes}; check for unreferenced or merged notes.`,
    );
  }

  const mediaDir = join(outDir, mediaName);

  return {
    output: toRelative(cwd, output),
    media: existsSync(mediaDir) ? relative(cwd, mediaDir) : null,
    footnotes,
    sourceNotes,
    warnings,
  };
}
