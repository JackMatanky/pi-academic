/**
 * Evaluation of drafting variants: computed distance from a reference, the rate
 * of each lint rule on human reference text versus the variants, and a blind
 * side-by-side sheet for the researcher's own judgement.
 */
import { lintProse } from "./lint.js";
import {
  proseParagraphs,
  tokenize,
  type StyleMetricKey,
  type StyleMetrics,
} from "./style-metrics.js";
import {
  compareToReference,
  referenceDistance,
  type ReferenceComparison,
  type ReferenceDocument,
} from "./style-reference.js";

/**
 * One named variant of the same drafting task, as full text.
 */
export interface VariantText {
  name: string;
  text: string;
  metrics: StyleMetrics;
}

/**
 * How one variant measures against the reference.
 */
export interface VariantReport {
  name: string;
  metrics: StyleMetrics;
  comparison: ReferenceComparison;
  distance: number | null;
  outside: StyleMetricKey[];
}

/**
 * Compares each variant with the reference documents.
 */
export function reportVariants(
  variants: VariantText[],
  documents: ReferenceDocument[],
): VariantReport[] {
  return variants.map((variant) => {
    const comparison = compareToReference(variant.metrics, documents);

    return {
      name: variant.name,
      metrics: variant.metrics,
      comparison,
      ...referenceDistance(comparison),
    };
  });
}

/**
 * Findings per 1,000 words for each lint rule on the references and on each
 * variant. A rule that fires as often on published human text as on a draft is
 * not evidence of anything.
 */
export interface LintAudit {
  referenceWords: number;
  rules: Record<
    string,
    { reference: number; variants: Record<string, number> }
  >;
}

/**
 * Findings per rule and the word count of one text.
 */
interface RuleCounts {
  counts: Map<string, number>;
  words: number;
}

function ruleCounts(text: string): RuleCounts {
  const counts = new Map<string, number>();

  for (const finding of lintProse(text).findings) {
    counts.set(finding.id, (counts.get(finding.id) ?? 0) + 1);
  }

  return { counts, words: tokenize(text).length };
}

/**
 * Audits the English lint rules against the reference texts.
 *
 * @param referenceTexts - Full text of each reference document.
 * @param variants - Variant texts, keyed by name.
 */
export function auditLint(
  referenceTexts: string[],
  variants: Array<{ name: string; text: string }>,
): LintAudit {
  const reference = referenceTexts.map(ruleCounts);
  const referenceWords = reference.reduce((sum, item) => sum + item.words, 0);

  const measured = variants.map((v) => ({
    name: v.name,
    ...ruleCounts(v.text),
  }));

  const ids = new Set<string>();

  for (const item of [...reference, ...measured]) {
    for (const id of item.counts.keys()) ids.add(id);
  }

  const perThousand = (hits: number, words: number): number =>
    words === 0 ? 0 : (hits / words) * 1000;

  const rules: LintAudit["rules"] = {};

  for (const id of [...ids].sort()) {
    rules[id] = {
      reference: perThousand(
        reference.reduce((sum, item) => sum + (item.counts.get(id) ?? 0), 0),
        referenceWords,
      ),
      variants: Object.fromEntries(
        measured.map((item) => [
          item.name,
          perThousand(item.counts.get(id) ?? 0, item.words),
        ]),
      ),
    };
  }

  return { referenceWords, rules };
}

/**
 * Blind side-by-side sheet and its key.
 */
export interface BlindSheet {
  sheet: string;
  key: Array<{ paragraph: number; labels: Record<string, string> }>;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;

  for (const char of seed) {
    hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16777619);
  }

  return hash >>> 0;
}

function seededRandom(seed: string): () => number {
  let state = hashSeed(seed);

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds a paragraph-by-paragraph blind comparison. Variants must have the same
 * number of prose paragraphs; for each paragraph the variants are shuffled and
 * labelled A, B, C...; the key maps labels back to variant names.
 *
 * @param variants - Named full texts with aligned paragraphs.
 * @param seed - Makes the shuffle reproducible.
 * @throws When fewer than two variants are given or paragraph counts differ.
 */
export function buildBlindSheet(
  variants: Array<{ name: string; text: string }>,
  seed: string,
): BlindSheet {
  if (variants.length < 2) throw new Error("A blind sheet needs two variants.");

  const paragraphs = variants.map((variant) => ({
    name: variant.name,
    items: proseParagraphs(variant.text, 1),
  }));

  const expected = paragraphs[0]?.items.length ?? 0;

  for (const variant of paragraphs) {
    if (variant.items.length !== expected) {
      throw new Error(
        `Variant "${variant.name}" has ${variant.items.length} prose paragraphs; "${paragraphs[0]?.name}" has ${expected}. Blind comparison needs aligned paragraphs.`,
      );
    }
  }

  const random = seededRandom(seed);
  const key: BlindSheet["key"] = [];
  const lines = ["# Blind comparison", ""];

  for (let index = 0; index < expected; index++) {
    const order = paragraphs
      .map((variant) => ({
        name: variant.name,
        text: variant.items[index] ?? "",
      }))
      .map((entry) => ({ entry, sort: random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ entry }) => entry);

    const labels: Record<string, string> = {};

    lines.push(`## Paragraph ${index + 1}`, "");

    for (const [position, entry] of order.entries()) {
      const label = String.fromCharCode(65 + position);

      labels[label] = entry.name;
      lines.push(`**${label}.** ${entry.text}`, "");
    }

    lines.push("Reads more like a scholar in the field: ___", "");
    key.push({ paragraph: index + 1, labels });
  }

  return { sheet: `${lines.join("\n")}\n`, key };
}
