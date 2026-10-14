/**
 * Advisory English prose-pattern checks for Markdown text.
 */
import { fenceAfter } from "../../lib/markdown.js";

/**
 * One contextual match from the deterministic prose rules.
 */
export interface ProseLintFinding {
  id: string;
  line: number;
  excerpt: string;
  message: string;
  matchedText?: string;
  relatedLines?: number[];
}

/**
 * Stable result envelope returned by the prose lint tool.
 */
export interface ProseLintResult {
  file: string;
  language: "english";
  status: "advisory";
  findings: ProseLintFinding[];
}

interface Rule {
  id: string;
  message: string;
  pattern: RegExp;
}

const rules: Rule[] = [
  {
    id: "chatbot-residue",
    message:
      "Possible conversational residue; keep it if the genre or context calls for it.",
    pattern:
      /(?<![\p{L}\p{N}_])(?:I hope this helps|Let me know if you'd like|Would you like me to|Great question|Certainly|Of course)(?![\p{L}\p{N}_])/iu,
  },
  {
    id: "staged-opener",
    message:
      "Possible run-up before the point; check whether it adds meaning or voice.",
    pattern:
      /^\s*(?:let['’]?s\s+(?:dive in|explore|break this down)|here['’]s what you need to know|without further ado|honestly\??|real talk)\s*[.!,:—–-]?/iu,
  },
  {
    id: "inflated-significance",
    message:
      "Possible inflated significance; retain when the source supports the claim.",
    pattern:
      /(?<![\p{L}\p{N}_])(?:stands as a testament|marking a pivotal moment|plays a key role|underscores its importance|evolving landscape)(?![\p{L}\p{N}_])/iu,
  },
  {
    id: "meta-announcement",
    message:
      "Possible announcement or transition that may be replaceable with the point itself.",
    pattern:
      /(?<![\p{L}\p{N}_])(?:it is worth noting that|it is important to note that|what is striking (?:here|is)|in light of the foregoing|taken together)(?![\p{L}\p{N}_])/iu,
  },
];

const inlineCodePattern = /(`+).*?\1/gu;

const linkPattern = /!?\[([^\]]+)\]\([^)]*\)/gu;

const citationPattern = /\[@[^\]]*\]/gu;

const urlPattern = /https?:\/\/\S+/giu;

const wordPattern = /[\p{L}\p{N}_’'-]+/gu;

/**
 * The characters Python's `str.splitlines` treats as line boundaries, besides
 * `\r\n`.
 */
const LINE_BREAKS = [
  "\n",
  "\r",
  "\v",
  "\f",
  "\u001c",
  "\u001d",
  "\u001e",
  "\u0085",
  "\u2028",
  "\u2029",
];

const lineBreakPattern = new RegExp(`\\r\\n|[${LINE_BREAKS.join("")}]`, "u");

function visibleLines(text: string): Array<[number, string]> {
  const lines = text.split(lineBreakPattern);
  const visible: Array<[number, string]> = [];
  let inFrontmatter = lines[0]?.trim() === "---";
  let fence: string | null = null;

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    const stripped = line.trim();

    if (inFrontmatter) {
      if (lineNumber > 1 && (stripped === "---" || stripped === "...")) {
        inFrontmatter = false;
      }

      continue;
    }

    const openFence = fence;
    fence = fenceAfter(line, fence);

    if (openFence !== null || fence !== null) {
      continue;
    }

    if (/^\s{0,3}>/u.test(line) || /^\s{0,3}#{1,6}\s/u.test(line)) {
      continue;
    }

    const prose = line
      .replace(inlineCodePattern, "")
      .replace(linkPattern, "$1")
      .replace(citationPattern, "")
      .replace(urlPattern, "");

    if (prose.trim()) visible.push([lineNumber, prose]);
  }

  return visible;
}

function excerpt(text: string): string {
  const compact = text.trim().split(/\s+/u).join(" ");
  const characters = Array.from(compact);

  return characters.length <= 180
    ? compact
    : characters.slice(0, 177).join("") + "...";
}

function repeatedOpenings(lines: Array<[number, string]>): ProseLintFinding[] {
  const groups = new Map<string, Array<[number, string]>>();
  let paragraph: Array<[number, string]> = [];

  const flush = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.map(([, line]) => line).join(" ");
    const words = text.toLowerCase().match(wordPattern) ?? [];

    if (words.length >= 4) {
      const key = words.slice(0, 4).join(" ");
      const occurrences = groups.get(key) ?? [];
      occurrences.push([paragraph[0]?.[0] ?? 0, text]);
      groups.set(key, occurrences);
    }

    paragraph = [];
  };

  let previousLine = 0;

  for (const entry of lines) {
    const [lineNumber] = entry;

    if (previousLine > 0 && lineNumber > previousLine + 1) flush();
    paragraph.push(entry);
    previousLine = lineNumber;
  }

  flush();

  const findings: ProseLintFinding[] = [];

  for (const occurrences of groups.values()) {
    if (occurrences.length < 2) continue;
    const occurrenceLines = occurrences.map(([line]) => line);

    for (const [line, text] of occurrences) {
      findings.push({
        id: "repeated-paragraph-opening",
        line,
        relatedLines: occurrenceLines.filter((otherLine) => otherLine !== line),
        excerpt: excerpt(text),
        message:
          "Several paragraphs share the same first four words; check whether the repetition is intentional.",
      });
    }
  }

  return findings;
}

/**
 * Returns stable, read-only advisory findings for English Markdown prose.
 *
 * @param text - Markdown prose text to lint.
 * @param fileName - File identifier used in result object.
 *
 * @returns Linting result with advisory findings.
 */
export function lintProse(text: string, fileName = "<stdin>"): ProseLintResult {
  const lines = visibleLines(text);
  const findings: ProseLintFinding[] = [];

  for (const [line, prose] of lines) {
    for (const rule of rules) {
      const match = rule.pattern.exec(prose);

      if (match) {
        findings.push({
          id: rule.id,
          line,
          excerpt: excerpt(prose),
          matchedText: match[0].trim(),
          message: rule.message,
        });
      }
    }
  }

  findings.push(...repeatedOpenings(lines));
  findings.sort(
    (left, right) =>
      left.line - right.line ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  );

  return { file: fileName, language: "english", status: "advisory", findings };
}
