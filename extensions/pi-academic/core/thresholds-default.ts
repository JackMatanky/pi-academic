/**
 * The shipped default quality gates, previously `thresholds.json` at the
 * package root. `pi_academic_read_resource(name: thresholds)` serves this when
 * the project has no `.pi-academic/thresholds.json` override; the setup skills
 * present these values to the researcher (who may adjust them) and write the
 * result as the project override.
 */

/**
 * Score-based gate: `passThreshold` (within `minScore`–`maxScore`) must be met.
 */
export interface ScoreThresholds {
  minScore: number;
  maxScore: number;
  passThreshold: number;
}

/**
 * All numeric quality gates in one place. Never inline these values in skills
 * or agents — read them via `pi_academic_read_resource(name: thresholds)`.
 */
export interface Thresholds {
  /**
   * Per-paragraph anti-AI score (5 dimensions × 10 points).
   */
  antiAi: ScoreThresholds;
  /**
   * Whole-article self-review score (6 dimensions × 10 points).
   */
  selfReview: ScoreThresholds;
  /**
   * Rewrite cycles before a paragraph ships flagged [NEEDS REVIEW].
   */
  rewriteCycles: { max: number };
  /**
   * Soft paragraph word ceiling; intro/conclusion may exceed by the bonus.
   */
  paragraph: { wordCeiling: number; wordCeilingIntroConclusionBonus: number };
  /**
   * Minimum distinct source-backed notes mapped in an approved outline.
   */
  sources: { minPerArticle: number };
  /**
   * Article length gate: with a researcher `targetWordCount`, the draft must
   * land within `targetBandPct` of it; without one, within min/max words.
   */
  article: { minWords: number; maxWords: number; targetBandPct: number };
  /**
   * Per-dimension style-fingerprint compliance score.
   */
  styleFingerprint: { passThreshold: number; maxScore: number };
  /**
   * Voice-profile gates: rule coverage and minimum analyzable corpus.
   */
  voice: {
    ruleCoverage: { pass: number; warn: number; block: number };
    corpus: {
      minArticles: number;
      minTotalWords: number;
      minWordsPerArticle: number;
    };
  };
}

/**
 * Shipped baseline thresholds for all evaluation dimensions and quality gates.
 */
export const THRESHOLDS_DEFAULT: Thresholds = {
  antiAi: { minScore: 35, maxScore: 50, passThreshold: 35 },
  selfReview: { minScore: 40, maxScore: 60, passThreshold: 40 },
  rewriteCycles: { max: 3 },
  paragraph: { wordCeiling: 220, wordCeilingIntroConclusionBonus: 30 },
  sources: { minPerArticle: 3 },
  article: { minWords: 2000, maxWords: 12000, targetBandPct: 15 },
  styleFingerprint: { passThreshold: 7, maxScore: 10 },
  voice: {
    ruleCoverage: { pass: 8.0, warn: 6.0, block: 6.0 },
    corpus: { minArticles: 3, minTotalWords: 1500, minWordsPerArticle: 800 },
  },
};

/**
 * The default thresholds serialized exactly as a project override file is
 * expected to look (2-space JSON, trailing newline).
 */
export function thresholdsDefaultJson(): string {
  return `${JSON.stringify(THRESHOLDS_DEFAULT, null, 2)}\n`;
}
