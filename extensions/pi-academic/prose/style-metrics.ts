/**
 * Deterministic, advisory style measurements for scholarly prose.
 *
 * Every value is a crude surface proxy computed from the text alone, in code:
 * the point is to replace LLM-estimated counts ("mean sentence length is about
 * 24") with real ones, and to place them against a reference distribution
 * instead of a universal threshold. Nothing here judges quality.
 */
import { parseMarkdownBlocks } from "../../lib/markdown.js";

/**
 * `en` and `he` enable their language-specific measures; `other` computes the
 * language-neutral ones only.
 */
export type StyleLanguage = "en" | "he" | "other";

/**
 * Metric names in report order. Each is `null` when it cannot be computed (too
 * little text, or not defined for the language).
 */
export const STYLE_METRIC_KEYS = [
  "sentenceMean",
  "sentenceCv",
  "paragraphMean",
  "mattr",
  "openerRepeatRate",
  "connectorOpenerRate",
  "passiveRate",
  "ingTailRate",
  "nominalizationRate",
  "firstPersonRate",
  "hedgeRate",
  "boosterRate",
] as const;

export type StyleMetricKey = (typeof STYLE_METRIC_KEYS)[number];

/**
 * Units and meaning of each metric, for reports and tool descriptions.
 */
export const STYLE_METRIC_LABELS: Record<StyleMetricKey, string> = {
  sentenceMean: "words per sentence",
  sentenceCv: "sentence length variation (std/mean)",
  paragraphMean: "words per paragraph",
  mattr: "lexical diversity (MATTR, window 100)",
  openerRepeatRate: "% adjacent sentences with the same first word",
  connectorOpenerRate: "% sentences opening with a connector",
  passiveRate: "% sentences with an agentless passive",
  ingTailRate: "% sentences with a participial -ing clause after a comma",
  nominalizationRate: "nominalizations per 100 words",
  firstPersonRate: "first-person words per 1,000 words",
  hedgeRate: "hedges per 1,000 words",
  boosterRate: "boosters per 1,000 words",
};

/**
 * Measured values for one text. Counts are always present; every rate or mean
 * may be `null`.
 */
export interface StyleMetrics {
  words: number;
  sentences: number;
  paragraphs: number;
  values: Record<StyleMetricKey, number | null>;
}

/**
 * Options shared by the measuring entry points.
 */
export interface StyleOptions {
  /**
   * Paragraphs shorter than this are ignored (footnote and heading debris).
   */
  minParagraphWords?: number | undefined;
  /**
   * Leave paragraph length unmeasured, for sources (PDF) whose paragraph breaks
   * are not reliable.
   */
  skipParagraphLength?: boolean | undefined;
}

const DEFAULT_MIN_PARAGRAPH_WORDS = 20;

/**
 * Smallest token count for which MATTR is reported.
 */
const MATTR_WINDOW = 100;

const EN_ABBREVIATION =
  /\b(?:e\.g|i\.e|cf|vs|etc|Dr|Prof|St|No|Nos|pp?|ch|chs|chap|vol|vols|trans|ed|eds|Mr|Mrs|Ms|al|fol|ff|esp|ibid|viz|ca|approx|fig|sec)\.$/iu;

const HE_ABBREVIATION =
  /(?:^|\s)(?:עמ|עמוד|שם|הערה|כרך|מס|פרופ|וכו|וגו|כגון|לדוגמה|ע"ש|ד"ר)\.$/u;

const GERESH_FIX = /(?<=[\u05D0-\u05EA])"(?=[\u05D0-\u05EA])/gu;

const WORD_PATTERN = /[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}'’\u05F3\u05F4-]*/gu;

/**
 * Words of `text`, with ASCII gershayim inside Hebrew words kept in the word.
 */
export function tokenize(text: string): string[] {
  return text.replace(GERESH_FIX, "\u05F4").match(WORD_PATTERN) ?? [];
}

function cleanInline(text: string): string {
  return text
    .replace(/\[@[^\]]*\]/gu, "")
    .replace(/\[\^[^\]]*\]/gu, "")
    .replace(/\[\]\([^)]*\)/gu, "")
    .replace(/\[\]\{[^}]*\}/gu, "")
    .replace(/\{#[^}]*\}/gu, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/(`+)[^`]*\1/gu, "")
    .replace(/<[^>]+>/gu, "")
    .replace(/[*_]{1,3}(?=\S)|(?<=\S)[*_]{1,3}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function letterRatio(text: string): number {
  const visible = text.replace(/\s/gu, "");

  if (visible.length === 0) return 0;

  return (visible.match(/\p{L}/gu) ?? []).length / visible.length;
}

/**
 * Prose paragraphs of Markdown or extracted plain text, cleaned of citation
 * markers, links, footnote references, and inline code. Headings, tables,
 * lists, quotations, code, and mostly non-letter debris are dropped.
 *
 * @param text - Markdown or plain text.
 * @param minWords - Drop paragraphs with fewer words than this.
 */
export function proseParagraphs(text: string, minWords: number): string[] {
  const joined = text.replace(/(\p{L})-\n(?=\p{Ll})/gu, "$1");
  const paragraphs: string[] = [];

  for (const block of parseMarkdownBlocks(joined)) {
    if (block.type !== "paragraph") continue;

    if (/^\s{0,3}(?:>|\||[-*+]\s|\d+[.)]\s|:::|!\[|\[\^)/u.test(block.text)) {
      continue;
    }

    const clean = cleanInline(block.text);

    if (letterRatio(clean) < 0.7) continue;

    if (tokenize(clean).length < minWords) continue;

    paragraphs.push(clean);
  }

  return paragraphs;
}

/**
 * Splits one paragraph into sentences with ICU rules, then re-joins splits that
 * follow a scholarly abbreviation (`p.`, `e.g.`, `עמ.`) or precede a digit or
 * lowercase continuation.
 *
 * @param paragraph - Cleaned paragraph text.
 * @param language - Selects the locale and abbreviation list.
 */
export function splitSentences(
  paragraph: string,
  language: StyleLanguage,
): string[] {
  const locale = language === "he" ? "he" : "en";

  const segments = [
    ...new Intl.Segmenter(locale, { granularity: "sentence" }).segment(
      paragraph,
    ),
  ].map((part) => part.segment.trim());

  const abbreviation = language === "he" ? HE_ABBREVIATION : EN_ABBREVIATION;
  const sentences: string[] = [];

  for (const segment of segments) {
    if (segment === "") continue;

    const previous = sentences[sentences.length - 1];

    const continues =
      previous !== undefined &&
      (abbreviation.test(previous) ||
        /^[\d\p{Ll}]/u.test(segment) ||
        /^["”’)\]]/u.test(segment));

    if (previous !== undefined && continues) {
      sentences[sentences.length - 1] = `${previous} ${segment}`;
    } else {
      sentences.push(segment);
    }
  }

  return sentences.filter((sentence) => tokenize(sentence).length >= 3);
}

const NOT_PARTICIPLES = new Set([
  "need",
  "indeed",
  "red",
  "hundred",
  "seed",
  "speed",
  "bed",
  "open",
  "often",
  "even",
  "then",
  "ten",
  "seven",
  "eleven",
  "token",
  "listen",
  "golden",
  "kitchen",
  "deed",
  "greed",
  "feed",
  "creed",
  "proceed",
  "exceed",
  "succeed",
  "indeed",
  "sacred",
  "naked",
  "wicked",
  "beloved",
]);

const IRREGULAR_PARTICIPLES = new Set([
  "known",
  "given",
  "shown",
  "seen",
  "made",
  "taken",
  "found",
  "held",
  "done",
  "set",
  "read",
  "written",
  "said",
  "thought",
  "understood",
  "built",
  "led",
  "drawn",
  "chosen",
  "begun",
  "brought",
  "kept",
  "left",
  "lost",
  "meant",
  "paid",
  "put",
  "sent",
  "spoken",
  "taught",
  "told",
  "won",
  "cut",
  "seen",
  "borne",
  "grown",
  "gone",
  "run",
  "become",
  "come",
  "worn",
  "sung",
  "hidden",
  "forgotten",
  "overcome",
  "withdrawn",
  "undertaken",
]);

const ADVERB_GAP =
  "(?:(?:also|often|usually|generally|frequently|already|never|always|then|thus|first|further|widely|commonly|largely|not|only|still|clearly|well|even|thereby|later|here|likewise|merely|simply|typically|traditionally|explicitly|implicitly)\\s+)?";

const PASSIVE_PATTERN = new RegExp(
  `\\b(?:is|are|was|were|be|been|being)\\s+${ADVERB_GAP}([a-z]+)\\b`,
  "giu",
);

function hasAgentlessPassive(sentence: string): boolean {
  for (const match of sentence.matchAll(PASSIVE_PATTERN)) {
    const word = (match[1] ?? "").toLowerCase();

    const isParticiple =
      !NOT_PARTICIPLES.has(word) &&
      (IRREGULAR_PARTICIPLES.has(word) ||
        (word.length > 3 && /(?:ed|en)$/u.test(word)));

    if (!isParticiple) continue;

    const rest = sentence
      .slice((match.index ?? 0) + match[0].length)
      .split(/\s+/u)
      .slice(0, 6)
      .join(" ");

    if (!/\bby\b/iu.test(rest)) return true;
  }

  return false;
}

const NOT_ING_TAIL = new Set([
  "including",
  "according",
  "regarding",
  "concerning",
  "following",
  "during",
  "pending",
  "notwithstanding",
  "nothing",
  "something",
  "everything",
  "anything",
  "morning",
  "evening",
  "king",
  "thing",
  "things",
  "bring",
  "spring",
  "string",
  "ring",
  "sing",
  "wing",
  "ceiling",
  "feeling",
  "meaning",
  "being",
  "beginning",
]);

const ING_TAIL_PATTERN =
  /,\s+(?:(?:thereby|thus|also|often|hence|further|simultaneously)\s+)?([a-z]{3,}ing)\b/giu;

/**
 * A short fronted adverbial ("For a reader, translating X preserves Y"): a
 * gerund after its comma is the subject, not a participial clause.
 */
const FRONTED_STARTER =
  /^(?:for|under|in|as|if|before|after|when|once|because|given|with|by|against|within|on|at|through|since|while|although|though|during|following|whereas|unlike|like|despite|among|between|across|from|to|into|upon|throughout)\b/iu;

/**
 * A gerund governed by `by`, `through`, `via`, or a dash starts a series of
 * gerunds, not a participial clause.
 */
const GERUND_SERIES = /(?:\bby|\bthrough|\bvia|—)\s*[a-z]+ing\b/iu;

function hasIngTail(sentence: string): boolean {
  for (const match of sentence.matchAll(ING_TAIL_PATTERN)) {
    if (NOT_ING_TAIL.has((match[1] ?? "").toLowerCase())) continue;

    const prefix = sentence.slice(0, match.index);

    const fronted =
      FRONTED_STARTER.test(prefix) &&
      !prefix.includes(",") &&
      tokenize(prefix).length <= 14;

    if (fronted || GERUND_SERIES.test(prefix)) continue;

    return true;
  }

  return false;
}

const NOMINALIZATION_PATTERN =
  /^[a-z]{4,}(?:tions?|sions?|ments?|ness(?:es)?|ities|ity|ances?|ences?)$/u;

const NOT_NOMINALIZATIONS = new Set([
  "question",
  "questions",
  "section",
  "sections",
  "moment",
  "moments",
  "document",
  "documents",
  "element",
  "elements",
  "environment",
  "government",
  "city",
  "cities",
  "presence",
  "absence",
  "evidence",
  "difference",
  "differences",
  "sentence",
  "sentences",
  "essence",
  "silence",
  "audience",
  "science",
  "sciences",
  "experience",
  "experiences",
  "reference",
  "references",
  "conference",
  "commentary",
  "fragment",
  "fragments",
  "segment",
  "segments",
]);

const FIRST_PERSON = /^(?:my|me|mine|myself|we|our|ours|us|ourselves)$/iu;

const HEDGE_PATTERN =
  /\b(?:may|might|could|perhaps|possibly|probably|likely|unlikely|suggests?|suggested|appears?|appeared|seems?|seemed|arguably|presumably|apparently|somewhat|relatively|largely|tends?|tended|to some extent|in part|it is possible|it seems)\b/giu;

const BOOSTER_PATTERN =
  /\b(?:clearly|obviously|undoubtedly|certainly|definitely|indeed|plainly|surely|in fact|of course|it is clear|always|never|must|demonstrates?|demonstrated|proves?|proved|establishes?|established)\b/giu;

const EN_CONNECTOR_OPENER =
  /^(?:moreover|furthermore|additionally|in addition|however|therefore|thus|consequently|nevertheless|nonetheless|in other words|taken together|importantly|notably|ultimately|indeed|similarly|likewise|accordingly|hence|that said)\b/iu;

const HE_CONNECTOR_OPENER =
  /^(?:יתרה מכך|יתרה מזו|זאת ועוד|לפיכך|אולם|ואולם|עם זאת|בנוסף|כמו כן|לעומת זאת|בהקשר זה|כלומר|אף כי|מכאן ש)/u;

function mean(values: number[]): number | null {
  if (values.length === 0) return null;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[], average: number): number {
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
      values.length,
  );
}

function mattr(tokens: string[]): number | null {
  if (tokens.length < MATTR_WINDOW) return null;

  const counts = new Map<string, number>();
  let unique = 0;
  let total = 0;
  let windows = 0;

  for (const [index, token] of tokens.entries()) {
    const previous = counts.get(token) ?? 0;

    if (previous === 0) unique += 1;
    counts.set(token, previous + 1);

    if (index >= MATTR_WINDOW) {
      const leaving = tokens[index - MATTR_WINDOW] ?? "";
      const remaining = (counts.get(leaving) ?? 1) - 1;

      counts.set(leaving, remaining);

      if (remaining === 0) unique -= 1;
    }

    if (index >= MATTR_WINDOW - 1) {
      total += unique / MATTR_WINDOW;
      windows += 1;
    }
  }

  return total / windows;
}

function count(pattern: RegExp, text: string): number {
  return (text.match(pattern) ?? []).length;
}

/**
 * Measures prose paragraphs already split out by {@link proseParagraphs}.
 *
 * @param paragraphs - Cleaned paragraphs.
 * @param language - Language selecting the language-specific measures.
 * @param options - Only `skipParagraphLength` is read here.
 */
export function measureParagraphs(
  paragraphs: string[],
  language: StyleLanguage,
  options: StyleOptions = {},
): StyleMetrics {
  const sentences = paragraphs.flatMap((paragraph) =>
    splitSentences(paragraph, language),
  );

  const sentenceLengths = sentences.map(
    (sentence) => tokenize(sentence).length,
  );

  const paragraphLengths = paragraphs.map((p) => tokenize(p).length);
  const tokens = paragraphs.flatMap((paragraph) => tokenize(paragraph));
  const words = tokens.length;
  const lowered = tokens.map((token) => token.toLowerCase());
  const sentenceAverage = mean(sentenceLengths);
  const isEnglish = language === "en";

  const perHundredSentences = (hits: number): number | null =>
    sentences.length >= 3 ? (hits / sentences.length) * 100 : null;

  const perThousandWords = (hits: number): number | null =>
    words >= 100 ? (hits / words) * 1000 : null;

  const firsts = sentences.map(
    (sentence) => tokenize(sentence)[0]?.toLowerCase() ?? "",
  );

  const repeats = firsts.filter(
    (first, index) => index > 0 && first !== "" && first === firsts[index - 1],
  ).length;

  const connector =
    language === "he" ? HE_CONNECTOR_OPENER : EN_CONNECTOR_OPENER;

  const text = paragraphs.join(" ");

  const nominalizations = lowered.filter(
    (token) =>
      NOMINALIZATION_PATTERN.test(token) && !NOT_NOMINALIZATIONS.has(token),
  ).length;

  const firstPerson = tokens.filter(
    (token) => token === "I" || FIRST_PERSON.test(token),
  ).length;

  return {
    words,
    sentences: sentences.length,
    paragraphs: paragraphs.length,
    values: {
      sentenceMean: sentenceAverage,
      sentenceCv:
        sentenceAverage !== null && sentences.length >= 3
          ? standardDeviation(sentenceLengths, sentenceAverage) /
            sentenceAverage
          : null,
      paragraphMean: options.skipParagraphLength
        ? null
        : mean(paragraphLengths),
      mattr: mattr(lowered),
      openerRepeatRate:
        sentences.length >= 3 ? (repeats / (sentences.length - 1)) * 100 : null,
      connectorOpenerRate:
        language === "en" || language === "he"
          ? perHundredSentences(
              sentences.filter((sentence) => connector.test(sentence)).length,
            )
          : null,
      passiveRate: isEnglish
        ? perHundredSentences(sentences.filter(hasAgentlessPassive).length)
        : null,
      ingTailRate: isEnglish
        ? perHundredSentences(sentences.filter(hasIngTail).length)
        : null,
      nominalizationRate: isEnglish
        ? words >= 100
          ? (nominalizations / words) * 100
          : null
        : null,
      firstPersonRate: isEnglish ? perThousandWords(firstPerson) : null,
      hedgeRate: isEnglish
        ? perThousandWords(count(HEDGE_PATTERN, text))
        : null,
      boosterRate: isEnglish
        ? perThousandWords(count(BOOSTER_PATTERN, text))
        : null,
    },
  };
}

/**
 * Measures a whole text.
 *
 * @param text - Markdown or plain text.
 * @param language - Language selecting the language-specific measures.
 * @param options - Paragraph filtering and length options.
 */
export function measureText(
  text: string,
  language: StyleLanguage,
  options: StyleOptions = {},
): StyleMetrics {
  return measureParagraphs(
    proseParagraphs(
      text,
      options.minParagraphWords ?? DEFAULT_MIN_PARAGRAPH_WORDS,
    ),
    language,
    options,
  );
}

/**
 * Maps a free-form language name ("English", "he", "Hebrew") to a
 * {@link StyleLanguage}.
 */
export function styleLanguage(name: string): StyleLanguage {
  const lowered = name.trim().toLowerCase();

  if (lowered.startsWith("en")) return "en";

  if (lowered.startsWith("he")) return "he";

  return "other";
}

/**
 * Where one value sits against reference documents.
 */
export interface ReferencePosition {
  value: number;
  refMin: number;
  refMedian: number;
  refMax: number;
  /**
   * Share of reference documents at or below the value, 0-100.
   */
  percentile: number;
  position: "below" | "within" | "above";
  /**
   * Robust distance from the reference median in median-absolute-deviation
   * units, capped at ±5; `null` when the references do not vary.
   */
  z: number | null;
}

/**
 * Fewest reference documents for which a distribution is meaningful. A
 * statistical lower bound, not a quality gate.
 */
export const MIN_REFERENCE_DOCUMENTS = 3;

function median(sorted: number[]): number {
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * Places `value` against the same metric measured on reference documents.
 *
 * @param value - Measured value.
 * @param reference - The metric on each reference document; `null`s ignored.
 *
 * @returns The position, or `null` with fewer than
 *   {@link MIN_REFERENCE_DOCUMENTS} reference values.
 */
export function positionAgainst(
  value: number,
  reference: Array<number | null>,
): ReferencePosition | null {
  const sorted = reference
    .filter((item): item is number => item !== null)
    .sort((a, b) => a - b);

  if (sorted.length < MIN_REFERENCE_DOCUMENTS) return null;

  const refMin = sorted[0] ?? 0;
  const refMax = sorted[sorted.length - 1] ?? 0;
  const refMedian = median(sorted);

  const deviation = median(
    sorted.map((item) => Math.abs(item - refMedian)).sort((a, b) => a - b),
  );

  const scale = deviation * 1.4826;

  return {
    value,
    refMin,
    refMedian,
    refMax,
    percentile:
      (sorted.filter((item) => item <= value).length / sorted.length) * 100,
    position: value < refMin ? "below" : value > refMax ? "above" : "within",
    z:
      scale > 0 ? Math.max(-5, Math.min(5, (value - refMedian) / scale)) : null,
  };
}
