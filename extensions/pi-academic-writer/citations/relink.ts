import type { JsonObject } from "../../lib/schema.js";

import { NOTE_ANCHOR } from "./note-refs.js";
import { stringField } from "./source-records.js";

/**
 * What matching needs from one `sources.json` record.
 */
export interface SourceRef {
  citeKey: string;
  /**
   * Normalized surnames of every author.
   */
  surnames: string[];
  /**
   * Normalized work title.
   */
  title: string;
  year: string | null;
}

/**
 * One footnote's outcome.
 */
export interface NoteReport {
  label: string;
  /**
   * `inline`: the note held only citations and became `[@key]` at its
   * reference. `footnote`: it stays a note, with matched citations rewritten.
   * `unchanged`: nothing in it was matched.
   */
  outcome: "inline" | "footnote" | "unchanged";
  keys: string[];
  /**
   * Segments left as written, with the closest records.
   */
  unresolved: { text: string; candidates: string[] }[];
  /**
   * Disagreements between the note and the matched records; the rewritten
   * citation takes the record's data.
   */
  warnings: string[];
}

/**
 * Result of {@link relinkFootnotes}.
 */
export interface RelinkResult {
  markdown: string;
  notes: NoteReport[];
}

/**
 * Normalizes text for matching: no diacritics, case, or punctuation.
 */
function norm(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Builds match data from `sources.json` entries. Records without an author
 * (local files) cannot be matched by a note's author-and-title text and are
 * skipped.
 *
 * @param entries - Registry entries.
 */
export function sourceRefs(entries: JsonObject[]): SourceRef[] {
  const refs: SourceRef[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const citeKey = stringField(entry, "citeKey");
    const author = stringField(entry, "author");
    const title = stringField(entry, "workTitle");

    if (!citeKey || !author || !title) continue;

    if (seen.has(citeKey)) continue;

    seen.add(citeKey);

    const surnames = author
      .split(/;|\sand\s/)
      .map((name) => norm(name.split(",")[0] ?? ""))
      .filter(Boolean);

    refs.push({
      citeKey,
      surnames,
      title: norm(title),
      year: stringField(entry, "year") ?? null,
    });
  }

  return refs;
}

const ROMAN = "(?=[ivxlc])c{0,3}(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})(?![a-z])";

const NUM = `(?:\\d+|${ROMAN})(?:\\s*[–-]\\s*(?:\\d+|${ROMAN}))?`;

/**
 * Locator terms of Pandoc's en-US locale, abbreviated or not, singular or
 * plural, plus "ch."/"chs.", which Pandoc does not know and `splitLocator`
 * rewrites. `s.v.` takes a word, not a number, and has its own pattern.
 */
const TERM =
  "(?:(?:bks?|chaps?|chs?|cols?|figs?|fols?|nos?|ll?|nn?|opp?|pp?|paras?|pts?|secs?|vv?|vols?)\\.|(?:books?|chapters?|columns?|figures?|folios?|numbers?|lines?|notes?|opus|opera|pages?|paragraphs?|parts?|sections?|verses?|volumes?)\\b|[¶§]{1,2})";

const ITEM = `(?:${TERM}\\s*)?${NUM}`;

/**
 * More locators after the first: "5, 7", "5 and 7", "vol. 2, p. 5", "232 n.
 * 36".
 */
const MORE = `(?:(?:,\\s*|\\s+and\\s+|\\s*&\\s*)${ITEM}|\\s+nn?\\.\\s*${NUM})`;

const SUFFIX_WORDS = "(?:(?:and|et)\\s+)?(?:passim|ff?\\.?|seq\\.?|following)";

const SUFFIX_START = `esp\\.|especially|${SUFFIX_WORDS}`;

/**
 * Short suffixes common in citations: "esp. 7", "passim", "ff.", "et seq.".
 */
const SUFFIX = `(?:,?\\s*(?:esp\\.|especially)\\s*${NUM}(?:${MORE})*|,?\\s*${SUFFIX_WORDS})`;

const TAIL = `(?:${ITEM}(?:${MORE})*(?:${SUFFIX})*|(?:${SUFFIX})+)`;

const LOCATOR = new RegExp(`(?:[,:]”?|\\bat)\\s+(${TAIL})\\s*$`, "i");

const SUB_VERBO = /[,:]”?\s+((?:s\.vv?\.|sub verbo)\s+\S.*)$/i;

/**
 * Lead-ins that open a note segment with something other than the citation;
 * Pandoc treats them as the citation's prefix.
 */
const LEAD_SRC =
  "(?:but\\s+)?(?:see(?:\\s+(?:also|generally|further|esp\\.|especially))?(?:,\\s*e\\.g\\.,)?|cf\\.|compare|contrast|contra|accord|e\\.g\\.,?|for\\s+(?:example|instance),?|inter\\s+alia,?)";

const LEAD = new RegExp(`^${LEAD_SRC}\\s+`, "i");

/**
 * A sentence boundary that is not an abbreviation or an initial.
 */
const SENTENCE_BREAK =
  /(?<![A-Z]|\b(?:ed|eds|trans|esp|cf|vol|no|pp?|n|al|Jr|St))\.\s+[A-Z“"]/;

/**
 * Splits at `;` outside parentheses, brackets, and quotation marks.
 */
function splitSegments(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of text) {
    if (char === "(" || char === "[" || char === "“") depth += 1;

    if (char === ")" || char === "]" || char === "”") {
      depth = Math.max(0, depth - 1);
    }

    if (char === ";" && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  parts.push(current);

  return parts.flatMap((part) => (part.trim() ? [part.trim()] : []));
}

interface LocatorSplit {
  rest: string;
  locator: string | null;
}

/**
 * Splits a locator, with any short suffix, off the end of a citation and
 * formats it for Pandoc: a bare number gets "p."/"pp.", a term Pandoc does not
 * know ("ch.", "chs.") becomes the one it does, and the rest is kept word for
 * word.
 */
function splitLocator(text: string): LocatorSplit {
  const bare = text.replace(/,?\s*https?:\/\/\S+$/, "").trim();
  const found = SUB_VERBO.exec(bare) ?? LOCATOR.exec(bare);
  const raw = found?.[1]?.replace(/\u00a0/g, " ").trim();

  // A lone year is publication data, not a page.
  if (!found || !raw || /^(?:1[4-9]|20)\d\d$/.test(raw)) {
    return { rest: bare, locator: null };
  }

  // The caller strips a final period, which "ff." and "seq." need back.
  const canonical = raw
    .replace(/\bchs\./gi, "chaps.")
    .replace(/\bch\./gi, "chap.")
    .replace(/\b(ff?|seq)$/i, "$1.");

  // A leading term wins over a Roman numeral: "l." and "v." are line and verse.
  const needsTerm =
    !new RegExp(`^${TERM}`, "i").test(canonical) &&
    new RegExp(`^${NUM}`, "i").test(canonical);

  // Plural only when the locator itself lists or ranges, not a trailing
  // suffix such as "esp. 7".
  const head = canonical.split(new RegExp(`,?\\s*(?:${SUFFIX_START})`, "i"))[0];
  const plural = /[–,&-]|\sand\s/.test(head ?? canonical);

  return {
    rest: bare.slice(0, found.index),
    locator: needsTerm ? `${plural ? "pp." : "p."} ${canonical}` : canonical,
  };
}

/**
 * Clauses a full or short citation may contain besides its author: the title
 * (or a piece of it), publication data with digits or parentheses, and editor,
 * translator, or container-title clauses.
 */
const CITATION_CLAUSE = /^(?:ed\.|eds\.|trans\.|translated|edited|rev\.)/i;

/**
 * Words that start a clause of prose or another citation, never part of a
 * container's own author, title, or editor.
 */
const PROSE_START =
  /^(?:and|but|or|see|cf|compare|contra|e\.g|which|who|whom|whose|where|whereas|while|that|because|since|although|however|thus)\b/i;

/**
 * Whether every comma-separated part after the author is accounted for. A
 * second citation or a clause of prose after the title is not, and converting
 * the segment would silently drop it.
 */
function explained(rest: string, title: string): boolean {
  let inContainer = false;

  return rest
    .split(",")
    .slice(1)
    .map((chunk) => chunk.trim().replace(/^[”"’)\s]+/, ""))
    .every((chunk) => {
      if (chunk === "" || /[\d()]/.test(chunk)) return true;

      if (/^in\s/i.test(chunk)) {
        inContainer = true;

        return true;
      }

      if (CITATION_CLAUSE.test(chunk)) return true;

      // After "in …" come the container's author, title, and editors.
      if (inContainer) return !PROSE_START.test(chunk);

      const piece = norm(chunk);

      return piece !== "" && ` ${title} `.includes(` ${piece} `);
    });
}

/**
 * One already-written Pandoc citation: `[@key, p. 5]`, optionally with a prefix
 * such as `[see @key, p. 5]`.
 */
const EXISTING_MARKER = new RegExp(
  `^\\[(?:(${LEAD_SRC})\\s+)?@([^\\s,\\];]+)(?:,\\s*([^\\]]+))?\\]$`,
  "i",
);

/**
 * Splits `[@a, p. 1; @b, p. 2]` into one bracket per item, so each is matched
 * alone; the lead-in stays with the first.
 */
function expandMarkers(segment: string): string[] {
  // Word imports escape the brackets (`\[@a; @b\]`); keep whichever form the
  // note used, so an item left unmatched is written back unchanged.
  const found = new RegExp(
    `^(${LEAD_SRC}\\s+)?(\\\\?)\\[(@[^\\]]*;[^\\]]*?)\\\\?\\]\\.?$`,
    "i",
  ).exec(segment.trim());

  if (!found) return [segment];

  const escape = found[2] ?? "";

  return (found[3] ?? "")
    .split(";")
    .map(
      (item, index) =>
        `${index === 0 ? (found[1] ?? "") : ""}${escape}[${item.trim()}${escape}]`,
    );
}

interface Match {
  key: string;
  locator: string | null;
  /**
   * Lead-in such as "see" or "cf.", which Pandoc treats as the citation prefix.
   */
  prefix: string;
}

interface SegmentResult {
  lead: string;
  match: Match | null;
  /**
   * Why the segment is not a plain citation, when it is not.
   */
  candidates: string[];
  /**
   * The note's year disagrees with the matched record's.
   */
  warning?: string | undefined;
}

/**
 * A year in the note's publication parentheses that the matched record does not
 * have. Relinking replaces the note's text with the bibliography's data, so a
 * disagreement means one of the two is wrong.
 */
function yearWarning(
  rest: string,
  ref: SourceRef | undefined,
): string | undefined {
  const found =
    /\((?:[^()]*?,\s*)?((?:1[4-9]|20)\d\d)(?:[–-]((?:1[4-9]|20)\d\d))?[a-z]?\)/.exec(
      rest,
    );

  const year = /\d{4}/.exec(ref?.year ?? "")?.[0];

  if (!found || !ref || !year) return undefined;

  const years = found.slice(1).flatMap((value) => (value ? [value] : []));

  return years.includes(year)
    ? undefined
    : `${ref.citeKey}: the note says ${years.join("–")}, sources.json says ${year}`;
}

/**
 * Finds the record a note segment cites: an author's surname near the start,
 * plus a title or short title that the record's title contains.
 */
function matchSegment(
  raw: string,
  refs: SourceRef[],
  previousKey: string | undefined,
): SegmentResult {
  const withoutAnd = raw.replace(/^and\s+/i, "");
  const lead = LEAD.exec(withoutAnd)?.[0] ?? "";

  const text = withoutAnd
    .slice(lead.length)
    .replace(/[*\\]/g, "")
    .replace(/[.\s]+$/, "")
    .trim();

  const existing = EXISTING_MARKER.exec(text);

  // A citation an earlier pass (or the author) already wrote as Pandoc syntax.
  if (existing) {
    const key = existing[2] ?? "";

    // A locator holding another `@key` is an unsplit multi-item bracket.
    const known =
      refs.some((ref) => ref.citeKey === key) && !existing[3]?.includes("@");

    return {
      lead,
      match: known
        ? {
            key,
            // Pandoc's DOCX writer puts a no-break space after "pp.".
            locator: existing[3]?.replace(/\u00a0/g, " ").trim() || null,
            prefix: (existing[1] ?? lead).trim().toLowerCase(),
          }
        : null,
      candidates: [],
    };
  }

  const { rest, locator } = splitLocator(text);

  if (/^ibid\b/i.test(rest) && previousKey) {
    return {
      lead,
      match: { key: previousKey, locator, prefix: lead.trim().toLowerCase() },
      candidates: [],
    };
  }

  if (SENTENCE_BREAK.test(rest)) return { lead, match: null, candidates: [] };

  // Pages the locator pattern did not recognize must not be dropped silently.
  if (!locator && /\d\s*$/.test(rest)) {
    return { lead, match: null, candidates: [] };
  }

  const words = norm(rest);
  const authorChunk = ` ${norm(rest.split(",")[0] ?? "")}`;

  const pieces = rest
    .split(/[,(]/)
    .map(norm)
    .filter((p) => p.length >= 5);

  const scored: { key: string; score: number }[] = [];

  for (const ref of refs) {
    // Chicago opens with the author, ending at the first comma. An author's
    // name appearing later (in a title) does not make the note theirs.
    const author = ref.surnames.some((surname) =>
      authorChunk.endsWith(` ${surname}`),
    );

    if (!author || authorChunk.trim().split(" ").length > 6) continue;

    let score = words.includes(ref.title) ? ref.title.length : 0;

    for (const piece of pieces) {
      if (` ${ref.title} `.includes(` ${piece} `)) {
        score = Math.max(score, piece.length);
      }
    }

    if (score > 0) scored.push({ key: ref.citeKey, score });
  }

  scored.sort((a, b) => b.score - a.score);

  const [best, second] = scored;

  const bestTitle = refs.find((ref) => ref.citeKey === best?.key)?.title ?? "";

  if (
    best &&
    best.score >= 6 &&
    best.score > (second?.score ?? 0) &&
    explained(rest, bestTitle)
  ) {
    return {
      lead,
      match: { key: best.key, locator, prefix: lead.trim().toLowerCase() },
      candidates: [],
      warning: yearWarning(
        rest,
        refs.find((ref) => ref.citeKey === best.key),
      ),
    };
  }

  return {
    lead,
    match: null,
    candidates: scored.slice(0, 3).map((entry) => entry.key),
  };
}

function marker(matches: Match[]): string {
  return `[${matches
    .map(
      ({ key, locator, prefix }) =>
        `${prefix ? `${prefix} ` : ""}@${key}${locator ? `, ${locator}` : ""}`,
    )
    .join("; ")}]`;
}

interface Definition {
  label: string;
  start: number;
  end: number;
  text: string;
  /**
   * More than one paragraph: left alone.
   */
  multi: boolean;
}

function findDefinitions(lines: string[]): Definition[] {
  const defs: Definition[] = [];

  for (let i = 0; i < lines.length; i++) {
    const head = /^\[\^([^\]]+)\]:\s*(.*)$/.exec(lines[i] ?? "");

    if (!head) continue;

    let end = i;
    let multi = false;
    let text = head[2] ?? "";

    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j] ?? "";

      if (/^(?: {4}|\t)\S/.test(line)) {
        text += ` ${line.trim()}`;
        multi ||= j > end + 1;
        end = j;
      } else if (
        line.trim() === "" &&
        /^(?: {4}|\t)\S/.test(lines[j + 1] ?? "")
      ) {
        continue;
      } else {
        break;
      }
    }

    defs.push({ label: head[1] ?? "", start: i, end, text, multi });
    i = end;
  }

  return defs;
}

const MARK = /\[((?:\\.|[^\]\\])*)\]\{\.mark\}/g;

const LEADING_ANCHORS = new RegExp(`^(?:${NOTE_ANCHOR.source}\\s*)+`, "u");

/**
 * Where a footnote's marker goes in the body: before sentence punctuation, or
 * after a closing quotation mark or parenthesis.
 */
function placeMarker(
  body: string,
  label: string,
  citation: string,
  anchors: string,
): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const ref = new RegExp(`([.,;:!?]*)([”"’)]*)\\[\\^${escaped}\\](?!:)`, "g");

  // An anchor is glued to the word before it: a space in front of it would
  // survive citeproc and leave a gap before the note.
  const placed = anchors ? `${anchors} ${citation}` : ` ${citation}`;

  return body.replace(ref, (_all, punct: string, close: string) =>
    close ? `${punct}${close}${placed}` : `${placed}${punct}`,
  );
}

/**
 * Rewrites footnotes that cite sources in `sources.json` as Pandoc citations. A
 * note made only of citations becomes `[@key, p. N]` at its reference; a note
 * with other text stays a note, with the citations inside it rewritten.
 * Anything that cannot be matched unambiguously is left as written and
 * reported.
 *
 * @param markdown - Article markdown with `[^n]` footnotes.
 * @param refs - Match data from {@link sourceRefs}.
 *
 * @returns The rewritten markdown and one report per footnote.
 */
export function relinkFootnotes(
  markdown: string,
  refs: SourceRef[],
  options: { noteStyle: boolean },
): RelinkResult {
  const lines = markdown.split("\n");
  const defs = findDefinitions(lines);
  const notes: NoteReport[] = [];
  const dropped = new Set<number>();
  const inline = new Map<string, { anchors: string; citation: string }>();
  let previousKey: string | undefined;

  for (const def of defs) {
    const report: NoteReport = {
      label: def.label,
      outcome: "unchanged",
      keys: [],
      unresolved: [],
      warnings: [],
    };

    notes.push(report);

    if (def.multi) continue;

    // Note anchors are not citation text; they travel with the note.
    const anchors = def.text.match(LEADING_ANCHORS)?.[0] ?? "";
    const text = def.text.slice(anchors.length).replace(MARK, "$1").trim();
    const glued = anchors.replace(/\s+/g, "");
    const segments = splitSegments(text).flatMap(expandMarkers);
    const results: SegmentResult[] = [];
    let carry = previousKey;

    for (const segment of segments) {
      const result = matchSegment(segment, refs, carry);

      results.push(result);

      if (result.match) carry = result.match.key;
    }

    const matched = results.filter((result) => result.match);

    if (matched.length === 0) {
      report.unresolved = results.map((result, index) => ({
        text: segments[index] ?? "",
        candidates: result.candidates,
      }));

      continue;
    }

    previousKey = carry;
    report.keys = matched.flatMap((result) =>
      result.match ? [result.match.key] : [],
    );

    report.warnings = results.flatMap((result) =>
      result.warning ? [result.warning] : [],
    );

    // "See" and "cf." become the citation's prefix, so a note of only cited
    // works can still be inline.
    const plain = results.every((result) => result.match);

    if (plain) {
      report.outcome = "inline";

      inline.set(def.label, {
        anchors: glued,
        citation: marker(
          results.flatMap((result) => (result.match ? [result.match] : [])),
        ),
      });

      for (let i = def.start; i <= def.end; i++) dropped.add(i);

      continue;
    }

    report.outcome = "footnote";

    report.unresolved = results.flatMap((result, index) =>
      result.match
        ? []
        : [{ text: segments[index] ?? "", candidates: result.candidates }],
    );

    const rewritten = results
      .map((result, index) => {
        if (!result.match) return segments[index] ?? "";

        const { key, locator, prefix } = result.match;

        // A leading "and" joined this item to the one before it; a kept note
        // is prose, so it stays.
        const conj = /^and\s+/i.exec(segments[index] ?? "")?.[0] ?? "";
        const lead = conj + (result.lead || (prefix ? `${prefix} ` : ""));

        // In a note style, a bracketed citation inside an explicit note is
        // wrapped in parentheses; the author-in-text form is not.
        return options.noteStyle
          ? `${lead}@${key}${locator ? ` [${locator}]` : ""}`
          : `${lead}${marker([{ key, locator, prefix: "" }])}`;
      })
      .join("; ")
      .replace(/\]; \[@/g, "; @");

    const closing = text.endsWith(".") && !rewritten.endsWith(".") ? "." : "";

    lines[def.start] =
      `[^${def.label}]: ${glued ? `${glued} ` : ""}${rewritten}${closing}`;

    for (let i = def.start + 1; i <= def.end; i++) dropped.add(i);
  }

  const kept = lines.filter((_line, index) => !dropped.has(index));
  let body = kept.join("\n");

  for (const [label, { anchors, citation }] of inline) {
    body = placeMarker(body, label, citation, anchors);
  }

  return {
    markdown: body.replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "\n"),
    notes,
  };
}
