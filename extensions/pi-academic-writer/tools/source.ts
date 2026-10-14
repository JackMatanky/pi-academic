import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { Type } from "typebox";

import { auditCitations } from "../citations/audit.js";
import { resolveCslStyle } from "../citations/csl-resolver.js";
import { SourceCacheRecordSchema } from "../citations/source-records.js";
import {
  ingestSources,
  snapshotCitationAssets,
  writeSourcesCache,
} from "../citations/source-registry.js";
import { fail, registerTool } from "../core/tool-kit.js";
import { extractDocument } from "../parsers/documents.js";

/**
 * Registers source extraction/ingestion, citation cache, CSL, and citation
 * audit tools.
 *
 * @param pi - Pi extension API used to register tools.
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
}
