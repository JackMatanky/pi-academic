import { fenceAfter, stripCodeSpans } from "../../lib/markdown.js";

/**
 * A note cross-reference is a link to a note anchor: `note [](#fn-logic)`
 * becomes "note 19" at export (`extensions/pandoc/note-refs.lua`). The anchor
 * `[]{#fn-logic}` names the note it sits in, or else the next note after it.
 */
const ANCHOR_ID = /\]\{#(fn-[^\s{}]+)[^{}]*\}/gu;

const LINK_ID = /\[([^[\]]*)\]\(#(fn-[^\s)]+)[^)]*\)/gu;

/**
 * An empty anchor span, as written at the start of a note or glued to the end
 * of the word before an inline citation.
 */
export const NOTE_ANCHOR = /\[\]\{#fn-[^\s{}]+\}/u;

const NUMBERS = String.raw`\d+(?:\s*(?:,|and|&|\u2013|-)\s*\d+)*`;

const NOTE_WORD = String.raw`(?:notes?|nn?\.)`;

/**
 * Hard-coded cross-references: "note 19 above", "nn. 3 and 5 below", "supra
 * note 19". A bare "note 19" is left alone, because it may cite a note in the
 * source work.
 */
const CROSS_REF = new RegExp(
  String.raw`\b(?:${NOTE_WORD}\s+${NUMBERS}\s+(?:above|below)|(?:supra|infra)\s+${NOTE_WORD}\s+${NUMBERS})\b`,
  "giu",
);

/**
 * Defects in an article's note cross-references.
 */
export interface NoteRefAnalysis {
  /**
   * Anchor ids defined more than once.
   */
  duplicateAnchors: string[];
  /**
   * Link ids with no anchor.
   */
  danglingLinks: string[];
  /**
   * Link ids written with text. The export number replaces nothing, so the text
   * is an alias that the export rejects.
   */
  labelledLinks: string[];
  /**
   * Cross-references written as literal note numbers, which go stale when a
   * note is added, removed or moved.
   */
  hardCoded: string[];
}

/**
 * Checks note anchors and the links to them. Code and front matter are ignored,
 * as Pandoc ignores them.
 *
 * @param markdown - Article markdown.
 *
 * @returns Duplicate anchors, links without an anchor, and literal references.
 */
export function analyzeNoteRefs(markdown: string): NoteRefAnalysis {
  const text = stripCodeSpans(markdown);

  const anchors = Array.from(text.matchAll(ANCHOR_ID), (m) => m[1] ?? "");
  const defined = new Set(anchors);

  const links = Array.from(text.matchAll(LINK_ID), (m) => ({
    label: m[1] ?? "",
    id: m[2] ?? "",
  }));

  return {
    duplicateAnchors: [
      ...new Set(anchors.filter((id, i) => anchors.indexOf(id) !== i)),
    ],
    danglingLinks: [
      ...new Set(links.map((l) => l.id).filter((id) => !defined.has(id))),
    ],
    labelledLinks: [
      ...new Set(links.filter((l) => l.label !== "").map((l) => l.id)),
    ],
    hardCoded: [...new Set(text.match(CROSS_REF) ?? [])],
  };
}

/**
 * Result of {@link linkNoteRefs}.
 */
export interface LinkedNoteRefs {
  markdown: string;
  /**
   * Cross-reference phrases converted to links.
   */
  linked: number;
  /**
   * Phrases left as written because a note they name does not exist.
   */
  unresolved: string[];
}

/**
 * Converts literal cross-references ("note 19 above") into links to note
 * anchors, adding the anchor at the start of each note they name. Needs
 * footnotes labelled by their number, as a Word import produces them, because
 * only then is a literal number known to be the right note.
 *
 * @param markdown - Article markdown with numbered `[^n]` footnotes.
 *
 * @returns The rewritten markdown, how many phrases were linked, and which were
 *   left because the named note is missing.
 */
export function linkNoteRefs(markdown: string): LinkedNoteRefs {
  const lines = markdown.split("\n");

  const labels = new Set(
    lines.flatMap((line) => /^\[\^(\d+)\]:/u.exec(line)?.[1] ?? []),
  );

  const targets = new Set<string>();
  const unresolved: string[] = [];
  let linked = 0;
  let fence: string | null = null;
  let frontmatter = lines[0]?.trimEnd() === "---";

  const converted = lines.map((line, index) => {
    if (frontmatter) {
      if (index > 0 && /^(?:---|\.\.\.)\s*$/u.test(line)) frontmatter = false;

      return line;
    }

    const inCode = fence !== null;
    fence = fenceAfter(line, fence);

    if (inCode || fence !== null) return line;

    return line.replace(CROSS_REF, (phrase) => {
      const numbers = phrase.match(/\d+/gu) ?? [];

      if (numbers.some((n) => !labels.has(n))) {
        unresolved.push(phrase);

        return phrase;
      }

      for (const n of numbers) targets.add(n);

      linked++;

      return phrase.replace(/\d+/gu, (n) => `[](#fn-${n})`);
    });
  });

  const anchored = converted.map((line) => {
    const head = /^\[\^(\d+)\]:\s*/u.exec(line);
    const label = head?.[1];

    if (!head || !label || !targets.has(label)) return line;

    const rest = line.slice(head[0].length);

    return rest.startsWith(`[]{#fn-${label}}`)
      ? line
      : `${head[0]}[]{#fn-${label}} ${rest}`;
  });

  return { markdown: anchored.join("\n"), linked, unresolved };
}
