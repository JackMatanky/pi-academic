import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { existsSync } from "node:fs";

import { Type } from "typebox";

import { resolveInside, writeFileAtomic } from "../../lib/fs-safe.js";
import { fail, registerTool } from "../core/tool-kit.js";
import { extractDocument } from "../parsers/documents.js";
import {
  auditLint,
  buildBlindSheet,
  reportVariants,
  type BlindSheet,
  type LintAudit,
  type VariantText,
} from "../prose/style-eval.js";
import {
  MIN_REFERENCE_DOCUMENTS,
  STYLE_METRIC_KEYS,
  STYLE_METRIC_LABELS,
  measureParagraphs,
  proseParagraphs,
  splitSentences,
  styleLanguage,
  type StyleMetrics,
} from "../prose/style-metrics.js";
import {
  compareToReference,
  measureDocumentText,
  measureReference,
  referenceDistance,
  type ReferenceComparison,
} from "../prose/style-reference.js";

const referenceDescription =
  "Project-relative reference files or directories (.md, .txt, .docx, .pdf; directories are not recursive): the researcher's own articles, or published work in the field. Only numbers are derived from them.";

function fmt(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(2);
}

function metricsTable(
  metrics: StyleMetrics,
  comparison: ReferenceComparison | null,
): string {
  const lines = [
    `${metrics.words} words, ${metrics.sentences} sentences, ${metrics.paragraphs} paragraphs`,
    "",
  ];

  for (const key of STYLE_METRIC_KEYS) {
    const value = metrics.values[key];
    const position = comparison?.[key] ?? null;

    const against = position
      ? `  reference median ${fmt(position.refMedian)} (range ${fmt(position.refMin)}-${fmt(position.refMax)}), ${position.position} range, percentile ${Math.round(position.percentile)}`
      : "";

    lines.push(
      `${key}: ${fmt(value)}  [${STYLE_METRIC_LABELS[key]}]${against}`,
    );
  }

  return lines.join("\n");
}

/**
 * Registers the deterministic style-measurement and variant-evaluation tools.
 *
 * @param pi - Pi extension API used to register tools.
 */
export function registerStyleTools(pi: ExtensionAPI): void {
  registerTool(pi, {
    name: "pi_academic_style_metrics",
    effect: "read",
    label: "Pi Academic Style Metrics",
    description:
      "Measure style in code, not by estimate: words per sentence and its variation, paragraph length, lexical diversity (MATTR), repeated sentence openers, connector openers, and (English) agentless passives, participial -ing clauses, nominalizations, first-person rate, hedges and boosters. With referencePaths, each value is placed against the same measure on reference documents (median, range, percentile). Advisory crude proxies: a value outside the reference range is a prompt for judgement, never a verdict. Hebrew gets the language-neutral subset.",
    parameters: Type.Object({
      text: Type.Optional(
        Type.String({
          minLength: 1,
          description: "Text to measure. Give exactly one of text or path.",
        }),
      ),
      path: Type.Optional(
        Type.String({
          minLength: 1,
          description:
            "Project-relative .md/.txt/.docx/.pdf file to measure. Give exactly one of text or path.",
        }),
      ),
      language: Type.String({
        minLength: 1,
        description: 'Language of the text, e.g. "English" or "Hebrew".',
      }),
      referencePaths: Type.Optional(
        Type.Array(Type.String({ minLength: 1 }), {
          minItems: 1,
          description: referenceDescription,
        }),
      ),
      byParagraph: Type.Optional(
        Type.Boolean({
          description:
            "Also return words, sentence length, and variation for each prose paragraph.",
        }),
      ),
    }),
    failure: "Style metrics failed",
    run: async (params, { cwd, signal }) => {
      if ((params.text === undefined) === (params.path === undefined)) {
        return fail("Give exactly one of text or path.");
      }

      const language = styleLanguage(params.language);
      let source = params.text ?? "";
      let label = "text";

      if (params.path !== undefined) {
        const extracted = await extractDocument(cwd, params.path, signal);

        if (!extracted.ok) {
          return fail(`Cannot read ${params.path}: ${extracted.error}`);
        }

        source = extracted.text;
        label = extracted.path;
      }

      const metrics = measureDocumentText(source, label, language);

      if (metrics.sentences === 0) {
        return fail("No prose paragraphs found to measure.");
      }

      let comparison: ReferenceComparison | null = null;
      let note = "";
      let skipped: Array<{ path: string; reason: string }> = [];

      if (params.referencePaths) {
        const reference = await measureReference(
          cwd,
          params.referencePaths,
          language,
          signal,
        );

        skipped = reference.skipped;

        if (reference.documents.length < MIN_REFERENCE_DOCUMENTS) {
          note = `\n\nReference not used: ${reference.documents.length} measurable document(s), at least ${MIN_REFERENCE_DOCUMENTS} needed.`;
        } else {
          comparison = compareToReference(metrics, reference.documents);

          const { distance, outside } = referenceDistance(comparison);

          note = `\n\nReference: ${reference.documents.length} documents. Distance from reference median: ${fmt(distance)} (lower is closer). Outside the reference range: ${outside.join(", ") || "none"}.`;
        }
      }

      const paragraphs = params.byParagraph
        ? proseParagraphs(source, 20).map((paragraph, index) => {
            const sentences = splitSentences(paragraph, language);
            const one = measureParagraphs([paragraph], language);

            return {
              paragraph: index + 1,
              words: one.words,
              sentences: sentences.length,
              sentenceMean: one.values.sentenceMean,
              sentenceCv: one.values.sentenceCv,
            };
          })
        : undefined;

      return {
        text: `${metricsTable(metrics, comparison)}${note}`,
        details: {
          ok: true,
          metrics,
          comparison,
          skipped,
          paragraphs: paragraphs ?? null,
        },
      };
    },
  });

  registerTool(pi, {
    name: "pi_academic_style_eval",
    effect: "read",
    effectFor: (params) => (params.blind ? "write" : "read"),
    label: "Pi Academic Style Eval",
    description:
      "Evaluate drafting variants of the same material. Measures each variant file against reference documents (distance and out-of-range metrics), optionally audits each English lint rule's rate on the reference text versus the variants, and optionally writes a blind paragraph-by-paragraph comparison sheet plus a separate key under .pi-academic/runs/style-eval/. Variants must be files the caller already wrote; for a blind sheet they need the same number of prose paragraphs. The computed distance ranks closeness to the reference; the researcher's own blind choice is the final judge.",
    parameters: Type.Object({
      reference: Type.Array(Type.String({ minLength: 1 }), {
        minItems: 1,
        description: referenceDescription,
      }),
      variants: Type.Array(
        Type.Object({
          name: Type.String({
            minLength: 1,
            description: "Label for the variant.",
          }),
          path: Type.String({
            minLength: 1,
            description: "Project-relative file holding the variant's text.",
          }),
        }),
        { minItems: 1 },
      ),
      language: Type.String({
        minLength: 1,
        description: 'Language of the texts, e.g. "English" or "Hebrew".',
      }),
      auditLint: Type.Optional(
        Type.Boolean({
          description:
            "English only: report each lint rule's findings per 1,000 words on the reference versus each variant.",
        }),
      ),
      blind: Type.Optional(
        Type.Boolean({
          description:
            "Write a shuffled blind comparison sheet and its key (needs at least two variants with aligned paragraphs and an existing .pi-academic/ directory).",
        }),
      ),
      seed: Type.Optional(
        Type.String({
          minLength: 1,
          description: "Makes the blind shuffle reproducible.",
        }),
      ),
    }),
    failure: "Style eval failed",
    run: async (params, { cwd, signal }) => {
      const language = styleLanguage(params.language);

      const reference = await measureReference(
        cwd,
        params.reference,
        language,
        signal,
      );

      if (reference.documents.length < MIN_REFERENCE_DOCUMENTS) {
        return fail(
          `Only ${reference.documents.length} reference document(s) could be measured; at least ${MIN_REFERENCE_DOCUMENTS} are needed. Skipped: ${JSON.stringify(reference.skipped)}`,
        );
      }

      const loaded: VariantText[] = [];

      for (const variant of params.variants) {
        const extracted = await extractDocument(cwd, variant.path, signal);

        if (!extracted.ok) {
          return fail(`Cannot read ${variant.path}: ${extracted.error}`);
        }

        loaded.push({
          name: variant.name,
          text: extracted.text,
          metrics: measureDocumentText(
            extracted.text,
            extracted.path,
            language,
          ),
        });
      }

      const reports = reportVariants(loaded, reference.documents);

      const lines = [
        `Reference: ${reference.documents.length} documents (${reference.documents.reduce((sum, d) => sum + d.metrics.words, 0)} words).`,
        "",
        "Variant | distance (lower is closer) | outside reference range",
      ];

      for (const report of reports) {
        lines.push(
          `${report.name} | ${fmt(report.distance)} | ${report.outside.join(", ") || "none"}`,
        );
      }

      let audit: LintAudit | undefined;

      if ((params.auditLint ?? language === "en") && language === "en") {
        audit = auditLint(
          await Promise.all(
            reference.documents.map(async (document) => {
              const extracted = await extractDocument(
                cwd,
                document.path,
                signal,
              );

              return extracted.text;
            }),
          ),
          loaded,
        );

        lines.push("", "Lint rule | reference per 1k words | per variant");

        for (const [id, rule] of Object.entries(audit.rules)) {
          lines.push(
            `${id} | ${fmt(rule.reference)} | ${Object.entries(rule.variants)
              .map(([name, rate]) => `${name} ${fmt(rate)}`)
              .join(", ")}`,
          );
        }
      }

      let written: { sheet: string; key: string } | undefined;

      if (params.blind) {
        if (!existsSync(resolveInside(cwd, ".pi-academic"))) {
          return fail(
            "No .pi-academic/ directory; run the academic-setup skill first.",
          );
        }

        let blind: BlindSheet;

        try {
          blind = buildBlindSheet(
            loaded,
            params.seed ?? loaded.map((variant) => variant.name).join("|"),
          );
        } catch (error) {
          return fail(error instanceof Error ? error.message : String(error));
        }

        const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
        const sheet = `.pi-academic/runs/style-eval/${stamp}-blind.md`;
        const key = `.pi-academic/runs/style-eval/${stamp}-key.json`;

        writeFileAtomic(resolveInside(cwd, sheet), blind.sheet);
        writeFileAtomic(
          resolveInside(cwd, key),
          `${JSON.stringify(blind.key, null, 2)}\n`,
        );
        written = { sheet, key };
        lines.push(
          "",
          `Blind sheet: ${sheet}. Key (do not show the researcher): ${key}.`,
        );
      }

      return {
        text: lines.join("\n"),
        details: {
          ok: true,
          reference: {
            documents: reference.documents.map((document) => ({
              path: document.path,
              words: document.metrics.words,
            })),
            skipped: reference.skipped,
          },
          variants: reports,
          lintAudit: audit ?? null,
          blind: written ?? null,
        },
      };
    },
  });
}
