import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { Type } from "typebox";

import { errorMessage } from "../../lib/fs-safe.js";
import { stringEnum } from "../../lib/schema.js";
import { auditCitations } from "../citation-audit.js";
import { resolveCslStyle } from "../csl-resolver.js";
import { extractDocument } from "../documents.js";
import { lintWithHarper, type HarperDialect } from "../harper.js";
import { lintProse } from "../prose-lint.js";
import { SourceCacheRecordSchema } from "../source-records.js";
import {
  ingestSources,
  snapshotCitationAssets,
  writeSourcesCache,
} from "../source-registry.js";
import { fail, registerTool } from "../tool-kit.js";
import { calculateArticleWordCount } from "../word-count.js";

/**
 * Source extraction and ingestion, citation cache, CSL, citation audit and
 * prose lint tools.
 */
export function registerSourceTools(pi: ExtensionAPI): void {
  registerTool(pi, {
    name: "academic_writer_extract_document",
    effect: "read",
    label: "Academic Writer Extract Document",
    description:
      "Extract deterministic plain text from markdown, text, PDF, or DOCX files inside the project. Use instead of ad-hoc shell extraction snippets.",
    parameters: Type.Object({
      path: Type.String({
        minLength: 1,
        description: "Document path inside the project.",
      }),
    }),
    run: async ({ path }, { cwd, signal }) => {
      const result = await extractDocument(cwd, path, signal);
      const details = { ...result, length: result.text.length };

      if (!result.ok) {
        return fail(`Document extraction failed: ${result.error}`, details);
      }

      const warnings = (result.warnings ?? []).map(
        (warning) => `[warning] ${warning}\n`,
      );

      return { text: warnings.join("") + result.text, details };
    },
  });

  registerTool(pi, {
    name: "academic_writer_ingest_sources",
    effect: "write",
    label: "Academic Writer Ingest Sources",
    description:
      "Ingest PDF, DOCX, Markdown, or text files inside the project (default: .academic-writer/sources/). Generates local source records, citekeys, sources.json, and bibliography.bib without requiring Zotero. Existing Zotero records and the citekeys of already-ingested files are preserved.",
    parameters: Type.Object({
      paths: Type.Optional(
        Type.Array(Type.String({ minLength: 1 }), {
          description:
            "Optional project-relative source files. If omitted, ingests supported files in .academic-writer/sources/.",
        }),
      ),
    }),
    run: async ({ paths }, { cwd, signal }) => {
      const result = await ingestSources(cwd, paths, signal);

      const failures = result.errors.map(
        (entry) => `${entry.path}: ${entry.error}`,
      );

      if (result.count === 0 && failures.length > 0) {
        return fail(`Ingested 0 source(s); ${failures.length} failed.`, result);
      }

      return {
        text: [
          failures.length
            ? `Ingested ${result.count} source(s); ${failures.length} failed.`
            : `Ingested ${result.count} source(s).`,
          ...failures,
        ].join("\n"),
        details: result,
      };
    },
  });

  registerTool(pi, {
    name: "academic_writer_write_sources_cache",
    effect: "write",
    label: "Academic Writer Write Sources Cache",
    description:
      "Write the current-run .academic-writer/sources.json and .academic-writer/bibliography.bib from the researcher's extracted records. Call before academic_writer_snapshot_citations.",
    parameters: Type.Object({
      sourcesJson: Type.Array(SourceCacheRecordSchema, {
        description: "Structured source records from the researcher.",
      }),
      bibliography: Type.String({
        description:
          "Concatenated BibTeX entries for the current run; may be empty.",
      }),
    }),
    failure: "Sources cache write failed",
    run: async ({ sourcesJson, bibliography }, { cwd }) => {
      const result = await writeSourcesCache(cwd, sourcesJson, bibliography);

      return {
        text: `Sources cache written: ${result.sourcesPath}, ${result.bibliographyPath}`,
        details: result,
      };
    },
  });

  registerTool(pi, {
    name: "academic_writer_snapshot_citations",
    effect: "write",
    label: "Academic Writer Snapshot Citations",
    description:
      "Freeze the current project citation cache beside an article as articles/<slug>.sources.json and articles/<slug>.bibliography.bib.",
    parameters: Type.Object({
      article: Type.String({
        minLength: 1,
        description: "Markdown article path, usually articles/<slug>.md.",
      }),
    }),
    failure: "Citation snapshot failed",
    run: ({ article }, { cwd }) => {
      const result = snapshotCitationAssets(cwd, article);

      if (!result.ok) {
        return fail(
          `Citation snapshot incomplete: missing ${result.missing.join(", ")}`,
          result,
        );
      }

      return {
        text: `Citation snapshot written: ${result.sources}, ${result.bibliography}`,
        details: result,
      };
    },
  });

  registerTool(pi, {
    name: "academic_writer_resolve_csl",
    effect: "exec",
    label: "Academic Writer Resolve CSL",
    description:
      "Resolve a bundled alias, CSL repository id, cached style, or custom .csl path to a local CSL file for Pandoc.",
    parameters: Type.Object({
      style: Type.String({
        minLength: 1,
        description:
          "CSL alias/id/path, e.g. apa, mla, chicago, nature, or .academic-writer/csl/custom.csl.",
      }),
      download: Type.Optional(
        Type.Boolean({
          description:
            "Download missing repository style ids into .academic-writer/csl/.",
        }),
      ),
    }),
    failure: "CSL resolution failed",
    run: async ({ style, download }, { cwd }) => {
      const path = await resolveCslStyle(style, cwd, download === true);

      return { text: path, details: { ok: true, path } };
    },
  });

  registerTool(pi, {
    name: "academic_writer_audit_citations",
    effect: "read",
    core: true,
    label: "Academic Writer Citation Audit",
    description:
      "Deterministically verify citation syntax and citeproc keys before DOCX/export/review. Code spans, fenced code, front matter and e-mail addresses are ignored; narrative @key citations are checked. Semantic claim verification still belongs to the editor agent in audit mode.",
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
    failure: "Citation audit failed",
    run: ({ article, citationStyle }, { cwd }) => {
      const audit = auditCitations(article, citationStyle, cwd);

      switch (audit.status) {
        case "error":
          return fail(`Citation audit failed: ${audit.error}`, audit);
        case "failed": {
          const reasons = [
            audit.reason,
            audit.missingFromSources.length &&
              `${audit.missingFromSources.length} missing source key(s): ${audit.missingFromSources.join(", ")}`,
            audit.missingFromBibliography.length &&
              `${audit.missingFromBibliography.length} missing bibliography key(s): ${audit.missingFromBibliography.join(", ")}`,
            audit.malformedMarkers.length &&
              `${audit.malformedMarkers.length} malformed marker(s): ${audit.malformedMarkers.join(" ")}`,
          ].filter(Boolean);

          return fail(`Citation audit failed: ${reasons.join("; ")}.`, audit);
        }

        case "passed":
          return {
            text: `Citation audit passed: ${audit.citationKeys.length} cite key(s), ${audit.warnings.length} warning(s).`,
            details: audit,
          };
      }
    },
  });

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
}
