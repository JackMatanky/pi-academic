import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveInside } from "../lib/fs-safe.js";
import { analyzeCitationText } from "./citation-audit.js";
import { citationAssetPaths } from "./project-files.js";

/**
 * Unicode-aware word counter matching Pandoc and Humanities word boundaries
 * (letters, digits, connector punctuation like Hebrew maqaf/geresh).
 */
export function countWords(text: string): number {
  const matches = text.trim().match(/[\p{L}\p{N}]+/gu);

  return matches?.length ?? 0;
}

/**
 * Breakdown of word counts across markdown prose, footnotes, citations, and the
 * bibliography.
 */
export interface ArticleWordCounts {
  /**
   * Raw words in the markdown file exactly as written (including markers,
   * footnote definitions, front matter, etc.).
   */
  markdownWords: number;
  /**
   * Words in the main body text only (headings, paragraphs, block quotes;
   * footnote definitions and reference markers excluded).
   */
  bodyWords: number;
  /**
   * Words in footnote definitions (`[^id]: ...`).
   */
  footnoteWords: number;
  /**
   * Estimated words that citation markers expand into in the rendered document:
   *
   * - In citeproc mode: markers like `[@smith2020, p. 12]` expand to author/year
   *   or full note text.
   * - In inline-parenthetical mode: literal citation text already sits in prose.
   */
  citationWords: number;
  /**
   * Estimated words in the rendered bibliography, computed from resolved BibTeX
   * entries matching cited keys (or all entries if unkeyed).
   */
  bibliographyWords: number;
  /**
   * Expected total rendered document word count: `bodyWords + footnoteWords +
   * citationWords + bibliographyWords`.
   */
  expectedDocumentWords: number;
  /**
   * Number of distinct citation keys detected.
   */
  citationCount: number;
  /**
   * Number of footnote definitions detected.
   */
  footnoteCount: number;
  /**
   * Number of bibliography entries included in the bibliography word count.
   */
  bibliographyEntriesCount: number;
  /**
   * The citation style used to evaluate citation expansion.
   */
  citationStyle: string;
}

/**
 * Extracts footnote definitions and body lines from markdown.
 */
interface SeparatedFootnotes {
  bodyText: string;
  footnoteDefinitions: Map<string, string>;
}

function separateFootnotes(markdown: string): SeparatedFootnotes {
  const lines = markdown.split(/\r?\n/);
  const bodyLines: string[] = [];
  const definitions = new Map<string, string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const match = /^\[\^([^\]]+)\]:\s*(.*)$/.exec(line);

    if (match) {
      const id = match[1] ?? "";
      const parts = [match[2] ?? ""];

      while (/^(?: {4}|\t)\S/.test(lines[i + 1] ?? "")) {
        i += 1;
        parts.push((lines[i] ?? "").trim());
      }

      definitions.set(id, parts.join(" ").trim());
    } else {
      bodyLines.push(line);
    }
  }

  return {
    bodyText: bodyLines.join("\n"),
    footnoteDefinitions: definitions,
  };
}

/**
 * Parses BibTeX entries into a map from citekey to readable entry text (tags
 * stripped to estimate words).
 */
function parseBibEntries(bibText: string): Map<string, string> {
  const entries = new Map<string, string>();
  const blocks = bibText.split(/^(?=@)/m);

  for (const block of blocks) {
    const trimmed = block.trim();

    if (!trimmed.startsWith("@")) continue;

    const match = /^@\w+\s*\{\s*([^,\s]+)\s*,([\s\S]*)\}\s*$/.exec(trimmed);

    if (!match) continue;

    const key = match[1] ?? "";
    const body = match[2] ?? "";

    // Clean BibTeX syntax into printable word-like text:
    // field = {Value}, field = "Value" -> Value
    const cleaned = body
      .replace(/^\s*\w+\s*=\s*[{"']?|[}"']?,?\s*$/gm, " ")
      .replace(/[{}\\"']/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    entries.set(key, cleaned);
  }

  return entries;
}

/**
 * Estimates rendered citation words for a citeproc marker given style.
 * Author-date styles expand to ~2–4 words per source (e.g. "Smith 2020, 15").
 * Notes styles expand to full footnote text (~15–25 words per citation).
 */
function estimateCiteprocMarkerWords(
  keys: string[],
  citationStyle: string,
): number {
  if (keys.length === 0) return 0;

  const styleLower = citationStyle.toLowerCase();

  const isNotes =
    styleLower.includes("note") ||
    styleLower.includes("chicago") ||
    styleLower.includes("turabian");

  // Notes expand to ~18 words per reference (author, title, pub, year, page).
  // In-text author-date expands to ~3 words per reference ("Author Year, p.").
  const wordsPerKey = isNotes ? 18 : 3;

  return keys.length * wordsPerKey;
}

/**
 * Calculates markdown and expected rendered document word counts for an article
 * markdown file.
 *
 * @param projectRoot - Absolute project root.
 * @param articlePath - Project-relative or absolute path to article markdown.
 * @param citationStyle - Citation style ("inline-parenthetical", "apa", etc.).
 */
export function calculateArticleWordCount(
  projectRoot: string,
  articlePath: string,
  citationStyle: string,
): ArticleWordCounts {
  const resolved = resolveInside(projectRoot, articlePath);
  const markdown = readFileSync(resolved, "utf8");

  const markdownWords = countWords(markdown);

  const { bodyText, footnoteDefinitions } = separateFootnotes(markdown);
  const bodyWords = countWords(bodyText);

  let footnoteWords = 0;

  for (const text of footnoteDefinitions.values()) {
    footnoteWords += countWords(text);
  }

  const analysis = analyzeCitationText(markdown, citationStyle);
  const isCiteproc = citationStyle !== "inline-parenthetical";

  // In inline-parenthetical, citations are already part of body / footnote text.
  // In citeproc, [@key] markers in markdown expand into rendered citations.
  const citationWords = isCiteproc
    ? estimateCiteprocMarkerWords(analysis.citationKeys, citationStyle)
    : 0;

  // Resolve bibliography if in citeproc mode
  let bibliographyWords = 0;
  let bibliographyEntriesCount = 0;

  if (isCiteproc) {
    const local = citationAssetPaths(articlePath);
    const localBib = join(projectRoot, local.bibliography);
    const globalBib = join(projectRoot, ".academic-writer", "bibliography.bib");

    const bibFile = existsSync(localBib)
      ? localBib
      : existsSync(globalBib)
        ? globalBib
        : null;

    if (bibFile) {
      const bibContent = readFileSync(bibFile, "utf8");
      const bibEntries = parseBibEntries(bibContent);

      if (analysis.citationKeys.length > 0) {
        // Only count bibliography entries for keys actually cited in the article
        const citedSet = new Set(analysis.citationKeys);

        for (const [key, text] of bibEntries.entries()) {
          if (citedSet.has(key)) {
            bibliographyWords += countWords(text);
            bibliographyEntriesCount += 1;
          }
        }
      } else {
        // No markers found; count all entries in bibliography
        for (const text of bibEntries.values()) {
          bibliographyWords += countWords(text);
        }

        bibliographyEntriesCount = bibEntries.size;
      }
    }
  }

  const expectedDocumentWords =
    bodyWords + footnoteWords + citationWords + bibliographyWords;

  return {
    markdownWords,
    bodyWords,
    footnoteWords,
    citationWords,
    bibliographyWords,
    expectedDocumentWords,
    citationCount: analysis.citationKeys.length,
    footnoteCount: footnoteDefinitions.size,
    bibliographyEntriesCount,
    citationStyle,
  };
}
