import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { promisify } from "node:util";

import { DOMParser } from "@xmldom/xmldom";
import { strFromU8, unzipSync } from "fflate";
import { extractText, getDocumentProxy } from "unpdf";

import { errorMessage, resolveInside } from "../lib/fs-safe.js";
import { commandExists } from "./commands.js";
import { toRelative } from "./project-files.js";

/**
 * Promisified `execFile` used for bounded external extraction commands.
 */
const execFileAsync = promisify(execFile);

/**
 * Largest `word/document.xml` the DOM fallback inflates; guards against zip
 * bombs.
 */
const MAX_DOCX_XML_BYTES = 64 * 1024 * 1024;

/**
 * Plain-text extraction result for one source or article document.
 */
export interface ExtractedDocument {
  /**
   * Whether text extraction succeeded
   */
  ok: boolean;
  /**
   * Resolved document path inside the project
   */
  path: string;
  /**
   * Extracted plain text content
   */
  text: string;
  /**
   * Optional array of extracted page-level segments for PDFs
   */
  pages?: Array<{ pdfPageIndex: number; text: string }>;
  /**
   * Optional error message on failure
   */
  error?: string;
  /**
   * Non-fatal warnings encountered during extraction
   */
  warnings?: string[];
}

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/**
 * Reads DOCX body text without Pandoc: one blank-line-separated block per
 * paragraph.
 *
 * @param path - Path of the .docx file.
 *
 * @returns The paragraph text, or an error when the file is not a DOCX archive.
 */
function extractDocxParagraphs(path: string): string {
  const entry = unzipSync(readFileSync(path), {
    filter: (file) =>
      file.name === "word/document.xml" &&
      file.originalSize <= MAX_DOCX_XML_BYTES,
  })["word/document.xml"];

  if (!entry)
    throw new Error(`Not a DOCX file, or its body is too large: ${path}`);
  const doc = new DOMParser().parseFromString(strFromU8(entry), "text/xml");
  const paragraphs = doc.getElementsByTagNameNS(WORD_NS, "p");
  const blocks: string[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const runs = paragraphs.item(i)?.getElementsByTagNameNS(WORD_NS, "t");
    let text = "";

    for (let j = 0; runs && j < runs.length; j++) {
      text += runs.item(j)?.textContent ?? "";
    }

    blocks.push(text);
  }

  return blocks.join("\n\n").trim();
}

/**
 * Extracts DOCX text with Pandoc when Pandoc is installed.
 *
 * @param path - File path to read, write, or resolve.
 * @param signal - Optional abort signal forwarded to subprocesses.
 */
async function extractDocxWithPandoc(
  path: string,
  signal?: AbortSignal,
): Promise<{ text: string } | { reason: string }> {
  if (!commandExists("pandoc")) return { reason: "pandoc is not installed" };

  try {
    const { stdout } = await execFileAsync(
      "pandoc",
      ["-f", "docx+citations", "-t", "markdown", path],
      { signal, maxBuffer: 256 * 1024 * 1024 },
    );

    return { text: stdout.trim() };
  } catch (error) {
    return { reason: errorMessage(error).split("\n")[0] ?? "pandoc failed" };
  }
}

/**
 * Extracts plain text from markdown/text/PDF/DOCX using package dev deps when
 * needed.
 *
 * @param projectRoot - Absolute project root used to resolve project-relative
 *   files.
 * @param inputPath - Input document path, relative to the project root unless
 *   absolute.
 * @param signal - Optional abort signal forwarded to subprocesses.
 *
 * @returns Extraction result with plain text or failure message.
 */
export async function extractDocument(
  projectRoot: string,
  inputPath: string,
  signal?: AbortSignal,
): Promise<ExtractedDocument> {
  let path: string;

  try {
    path = resolveInside(projectRoot, inputPath);
  } catch (error) {
    return { ok: false, path: inputPath, text: "", error: errorMessage(error) };
  }

  const relPath = toRelative(projectRoot, path);
  const ext = extname(path).toLowerCase();

  try {
    if (ext === ".md" || ext === ".txt") {
      return { ok: true, path: relPath, text: readFileSync(path, "utf-8") };
    }

    if (ext === ".docx") {
      const pandoc = await extractDocxWithPandoc(path, signal);

      signal?.throwIfAborted();

      if ("text" in pandoc)
        return { ok: true, path: relPath, text: pandoc.text };

      const text = extractDocxParagraphs(path);

      return {
        ok: true,
        path: relPath,
        text,
        warnings: [
          `Pandoc extraction unavailable (${pandoc.reason}); used plain paragraph text, so footnotes and citations are omitted.`,
        ],
      };
    }

    if (ext === ".pdf") {
      signal?.throwIfAborted();

      const pdf = await getDocumentProxy(new Uint8Array(readFileSync(path)));

      signal?.throwIfAborted();

      const { text: pageTexts } = await extractText(pdf, { mergePages: false });

      const pages = pageTexts.map((text, pdfPageIndex) => ({
        pdfPageIndex,
        text,
      }));

      return {
        ok: true,
        path: relPath,
        text: pages
          .map((page) => page.text)
          .filter(Boolean)
          .join("\n\n"),
        pages,
      };
    }

    return {
      ok: false,
      path: relPath,
      text: "",
      error: `Unsupported file type: ${ext || "(none)"}`,
    };
  } catch (error) {
    return { ok: false, path: relPath, text: "", error: errorMessage(error) };
  }
}
