import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { Type } from "typebox";

import { errorMessage } from "../../lib/fs-safe.js";
import { stringEnum } from "../../lib/schema.js";
import { fail, registerTool } from "../core/tool-kit.js";
import { lintWithHarper, type HarperDialect } from "../prose/harper.js";
import { lintProse } from "../prose/lint.js";
import { cleanRtlText } from "../prose/typography.js";
import { calculateArticleWordCount } from "../prose/word-count.js";

/**
 * Registers the word-count, prose-lint, proofread, and typography tools.
 *
 * @param pi - Pi extension API used to register tools.
 */
export function registerProseTools(pi: ExtensionAPI): void {
  registerTool(pi, {
    name: "academic_writer_count_words",
    effect: "read",
    label: "Academic Writer Count Words",
    description:
      "Calculate markdown word count and estimated rendered document word count with citations, footnotes, and bibliography based on citationStyle.",
    parameters: Type.Object({
      article: Type.String({
        minLength: 1,
        description:
          "Path to the article markdown file; relative paths resolve from the project root.",
      }),
      citationStyle: Type.String({
        minLength: 1,
        description:
          "inline-parenthetical for literal citation mode; any other value means citeproc mode.",
      }),
    }),
    failure: "Word count failed",
    run: ({ article, citationStyle }, { cwd }) => {
      try {
        const counts = calculateArticleWordCount(cwd, article, citationStyle);

        const lines = [
          `Markdown source: ${counts.markdownWords} words`,
          `Body prose: ${counts.bodyWords} words`,
          `Footnotes: ${counts.footnoteWords} words across ${counts.footnoteCount} note(s)`,
          `Citations (rendered expansion): ${counts.citationWords} words across ${counts.citationCount} key(s)`,
          `Bibliography: ${counts.bibliographyWords} words across ${counts.bibliographyEntriesCount} entry/entries`,
          `Expected document total: ${counts.expectedDocumentWords} words`,
        ];

        return {
          text: lines.join("\n"),
          details: { ok: true, ...counts },
        };
      } catch (error) {
        return fail(`Word count failed: ${errorMessage(error)}`);
      }
    },
  });

  registerTool(pi, {
    name: "academic_writer_lint_prose",
    effect: "read",
    label: "Academic Writer Prose Lint",
    description:
      "Run read-only, deterministic English prose-pattern checks. Findings are advisory prompts for contextual review, not violations or authorship judgments.",
    parameters: Type.Object({
      text: Type.String({
        description: "Draft prose to inspect; it is not modified or stored.",
      }),
      language: Type.String({
        minLength: 1,
        description:
          "Target language; English is linted and other languages are explicitly skipped.",
      }),
    }),
    run: ({ text, language }) => {
      if (!language.trim().toLowerCase().startsWith("en")) {
        return {
          text: "Prose lint skipped: English-only advisory rules.",
          details: {
            ok: true,
            skipped: true,
            reason: "The prose linter currently supports English only.",
          },
        };
      }

      const result = lintProse(text);

      return {
        text: `Prose lint completed with ${result.findings.length} advisory match(es).`,
        details: { ok: true, ...result },
      };
    },
  });

  registerTool(pi, {
    name: "academic_writer_proofread",
    effect: "read",
    core: true,
    label: "Academic Writer Harper Proofread",
    description:
      "Run the Harper English grammar/spelling linter on text. Findings are advisory; a match alone is never an error. English-only — Hebrew or other languages return zero findings by design (use the inline הגהה sweep and academic_writer_fix_typography for Hebrew).",
    parameters: Type.Object({
      text: Type.String({
        minLength: 1,
        description: "Text to proofread; it is not modified or stored.",
      }),
      dialect: Type.Optional(
        stringEnum(["American", "British"] as const, {
          description: 'English dialect. Defaults to "American".',
        }),
      ),
    }),
    run: async ({ text, dialect }) => {
      if (!text.trim()) return fail("Text must not be empty.");

      const selected: HarperDialect = dialect ?? "American";

      try {
        const findings = await lintWithHarper(text, selected);

        return {
          text: JSON.stringify(
            findings.length === 0
              ? {
                  count: 0,
                  findings,
                  note: "English-only scope; other languages are intentionally unchecked.",
                }
              : { count: findings.length, findings },
          ),
          details: { ok: true, count: findings.length, findings },
        };
      } catch (error) {
        return fail(`harper unavailable: ${errorMessage(error)}`);
      }
    },
  });

  registerTool(pi, {
    name: "academic_writer_fix_typography",
    effect: "read",
    label: "Academic Writer Fix Typography",
    description:
      "Apply deterministic typography cleanup to a paragraph: em dashes become spaced hyphens, straight quotes around Hebrew text become gereshayim (English quotes are left alone), and stray directional marks and orphan leading punctuation are removed.",
    parameters: Type.Object({
      text: Type.String({ description: "Paragraph text to clean." }),
    }),
    run: ({ text }) => {
      const fixed = cleanRtlText(text);

      return { text: fixed, details: { ok: true, changed: fixed !== text } };
    },
  });
}
