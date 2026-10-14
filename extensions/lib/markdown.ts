/**
 * One structural block of a Markdown document, with 1-indexed line bounds.
 */
export interface MarkdownBlock {
  type: "frontmatter" | "fence" | "heading" | "paragraph" | "blank";
  /**
   * Heading level (1-6); only on `heading` blocks.
   */
  level?: number;
  /**
   * Heading text without markers; only on `heading` blocks.
   */
  headingText?: string;
  /**
   * Raw block text, lines joined with `\n` (line endings normalized).
   */
  text: string;
  /**
   * First line of the block, 1-indexed.
   */
  startLine: number;
  /**
   * Last line of the block, 1-indexed.
   */
  endLine: number;
}

/**
 * Splits Markdown into structural blocks: YAML frontmatter, fenced code, ATX
 * headings, paragraphs, and blank lines. Fenced code is tracked with the same
 * rules as `fenceAfter`; frontmatter is recognized only when the first line is
 * `---` and a closing `---` or `...` follows.
 *
 * @param text - Markdown document text.
 *
 * @returns Blocks in document order with exact 1-indexed line ranges.
 */
export function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const lines = text.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];

  let index = 0;

  if (/^---\s*$/.test(lines[0] ?? "")) {
    for (let i = 1; i < lines.length; i++) {
      if (/^(?:---|\.\.\.)\s*$/.test(lines[i] ?? "")) {
        blocks.push({
          type: "frontmatter",
          text: lines.slice(0, i + 1).join("\n"),
          startLine: 1,
          endLine: i + 1,
        });
        index = i + 1;
        break;
      }
    }
  }

  let paragraph: string[] = [];
  let paragraphStart = 0;

  const flush = (lastLine: number): void => {
    if (paragraph.length === 0) return;

    blocks.push({
      type: "paragraph",
      text: paragraph.join("\n"),
      startLine: paragraphStart,
      endLine: lastLine,
    });
    paragraph = [];
  };

  for (let i = index; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);

    if (heading?.[1] && heading[2]) {
      flush(i);
      blocks.push({
        type: "heading",
        level: heading[1].length,
        headingText: heading[2],
        text: line,
        startLine: i + 1,
        endLine: i + 1,
      });
      continue;
    }

    if (/^\s*$/.test(line)) {
      flush(i);
      blocks.push({
        type: "blank",
        text: line,
        startLine: i + 1,
        endLine: i + 1,
      });
      continue;
    }

    if (/^ {0,3}(`{3,}|~{3,})/.test(line)) {
      const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1] ?? "";
      const fence: string[] = [line];

      // Closing fence: same character and at least the opening length.
      let j = i + 1;

      while (j < lines.length) {
        const inner = lines[j] ?? "";
        const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(inner);

        if (
          close?.[1] &&
          close[1][0] === marker[0] &&
          close[1].length >= marker.length
        ) {
          fence.push(inner);
          j += 1;
          break;
        }

        fence.push(inner);
        j += 1;
      }

      flush(i);
      blocks.push({
        type: "fence",
        text: fence.join("\n"),
        startLine: i + 1,
        endLine: j,
      });
      i = j - 1;
      continue;
    }

    if (paragraph.length === 0) paragraphStart = i + 1;
    paragraph.push(line);
  }

  flush(lines.length);

  return blocks;
}

/**
 * Blanks everything Pandoc never parses for citations and similar inline
 * syntax: YAML frontmatter at the document start, fenced code blocks, and
 * inline code spans (including spans that cross line breaks). Offsets within
 * the remaining text are preserved by replacing removed spans with spaces.
 *
 * @param markdown - Markdown document text.
 *
 * @returns Text of equal length and line count with code content removed.
 */
export function stripCodeSpans(markdown: string): string {
  const unbom = markdown.startsWith("\uFEFF") ? markdown.slice(1) : markdown;

  const withoutFrontmatter = unbom.replace(
    /^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)(?=\r?\n|$)/,
    "",
  );

  let fence: string | null = null;

  const withoutFences = withoutFrontmatter
    .split(/\r?\n/)
    .map((line) => {
      const inCode = fence !== null;
      fence = fenceAfter(line, fence);

      return inCode || fence !== null ? "" : line;
    })
    .join("\n");

  return blankCodeSpans(withoutFences);
}

/**
 * Scans text and replaces balanced CommonMark inline code spans with
 * whitespace, preserving character and line offsets. Unmatched backticks do not
 * bleed across paragraph boundaries.
 */
function blankCodeSpans(text: string): string {
  const chars = [...text];
  let i = 0;
  const len = chars.length;

  while (i < len) {
    if (chars[i] === "`") {
      let openLen = 1;

      while (i + openLen < len && chars[i + openLen] === "`") {
        openLen++;
      }

      let closeStart = -1;
      let j = i + openLen;

      while (j < len) {
        if (
          chars[j] === "\n" &&
          (chars[j + 1] === "\n" ||
            (chars[j + 1] === "\r" && chars[j + 2] === "\n"))
        ) {
          break;
        }

        if (
          chars[j] === "\r" &&
          chars[j + 1] === "\n" &&
          chars[j + 2] === "\r" &&
          chars[j + 3] === "\n"
        ) {
          break;
        }

        if (chars[j] === "`") {
          let run = 1;

          while (j + run < len && chars[j + run] === "`") {
            run++;
          }

          if (run === openLen) {
            closeStart = j;
            break;
          }

          j += run;
        } else {
          j++;
        }
      }

      if (closeStart !== -1) {
        const closeEnd = closeStart + openLen;

        for (let k = i; k < closeEnd; k++) {
          if (chars[k] !== "\n" && chars[k] !== "\r") {
            chars[k] = " ";
          }
        }

        i = closeEnd;
      } else {
        i += openLen;
      }
    } else {
      i++;
    }
  }

  return chars.join("");
}

/**
 * Tracks fenced code blocks line by line.
 *
 * Pass the previous return value (`null` outside a fence) with each line. A
 * line belongs to code when either the incoming or the returned state is
 * non-null, which covers the opening and closing fence lines themselves.
 *
 * @param line - Current text line to test for opening or closing fences.
 * @param open - Fence marker active prior to this line, or null if outside
 *   code.
 *
 * @returns The fence marker that is open after `line`, or `null`.
 */
export function fenceAfter(line: string, open: string | null): string | null {
  const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];

  if (!marker) return open;

  if (open === null) return marker;

  return marker[0] === open[0] && marker.length >= open.length ? null : open;
}
