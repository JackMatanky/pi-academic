import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Type, type Static } from "typebox";

import {
  errorMessage,
  resolveInside,
  writeFileAtomic,
} from "../../lib/fs-safe.js";
import { loadProfile } from "../../lib/profile.js";
import { stringEnum } from "../../lib/schema.js";
import { generateDocx } from "../article/docx-generator.js";
import { importDocx } from "../article/docx-import.js";
import { auditCitations } from "../citations/audit.js";
import { bibliographyTitle } from "../citations/csl-resolver.js";
import { selectPdfEngine } from "../core/commands.js";
import {
  BIBLIOGRAPHY_PAGE_FILTER,
  bibliographyTitleArgs,
  NOTE_REFS_FILTER,
  runPandoc,
} from "../core/pandoc.js";
import { citationAssetPaths } from "../core/project-files.js";
import {
  fail,
  registerTool,
  type ToolContext,
  type ToolOutput,
} from "../core/tool-kit.js";
import { STYLE_FORMATS, type StyleFormat } from "../styling/design.js";
import {
  checkStylePackage,
  installStarterPackage,
  listStylePackages,
  renderDocumentStyle,
  withScratchDir,
  type RenderedStyle,
} from "../styling/document-style.js";
import { addBibliographyPageStyles } from "../styling/odt.js";

/**
 * Per-format style details returned by `pi_academic_export_article`.
 */
interface StyleSummary {
  package: string;
  /**
   * Assets generated from design.json.
   */
  generated: string[];
  /**
   * Native assets used as supplied, by role.
   */
  native: Record<string, string>;
  warnings: string[];
}

interface ExportResult {
  format: string;
  output: string;
  ok: boolean;
  error?: string;
  engine?: string;
  style?: StyleSummary;
}

const isStyleFormat = (value: string): value is StyleFormat =>
  STYLE_FORMATS.some((format) => format === value);

const REMOTE_REFERENCE = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Pandoc fetches URLs given as `--csl=` or `--bibliography=`; exports stay
 * local.
 */
function assertLocalReference(value: string, label: string): void {
  if (REMOTE_REFERENCE.test(value)) {
    fail(`Export failed: ${label} must be a local file, not a URL: ${value}`, {
      ok: false,
    });
  }
}

function exportOutputPath(article: string, format: StyleFormat): string {
  const extension = format === "latex" ? "tex" : format;

  return `${article.replace(/\.[^./]+$/, "")}.${extension}`;
}

function summarizeStyle(style: RenderedStyle): StyleSummary {
  const generated: readonly string[] = style.generated;
  const native: Record<string, string> = {};

  for (const [role, path] of Object.entries(style.assets)) {
    if (role !== "engine" && !generated.includes(role)) native[role] = path;
  }

  return {
    package: style.package,
    generated: style.generated,
    native,
    warnings: style.warnings,
  };
}

const ExportArticleSchema = Type.Object({
  article: Type.String({
    minLength: 1,
    description: "Markdown article path inside the project.",
  }),
  citationStyle: Type.String({
    minLength: 1,
    description:
      "Profile citationStyle; inline-parenthetical means literal mode.",
  }),
  formats: Type.Array(Type.String({ minLength: 2 }), {
    description: "Formats: docx, odt, latex (.tex), pdf.",
  }),
  csl: Type.Optional(
    Type.String({
      minLength: 1,
      description:
        "Resolved local CSL file path for citeproc exports. If omitted, Pandoc uses its default style.",
    }),
  ),
  bibliography: Type.Optional(
    Type.String({
      minLength: 1,
      description:
        "Local bibliography for citeproc exports. The frozen article-local snapshot takes precedence; this override applies only before a snapshot exists.",
    }),
  ),
  pdfEngine: Type.Optional(
    stringEnum(["xelatex", "tectonic"] as const, {
      description:
        "Optional PDF engine. Defaults to the style package engine, then to whichever of xelatex/tectonic is installed.",
    }),
  ),
  stylePackage: Type.Optional(
    Type.String({
      minLength: 1,
      description:
        "Style package under .pi-academic/styles/ for this export; overrides the profile's stylePackage.",
    }),
  ),
});

type ExportArticleParams = Static<typeof ExportArticleSchema>;

/**
 * The whole `pi_academic_export_article` operation: validate references, gate
 * on the citation audit, then export each requested format, capturing
 * per-format outcomes and promoting Pandoc's scratch output only on success.
 * Returns the tool output, or throws ToolFailure when the export is refused or
 * any format fails.
 */
async function runExport(
  cwd: string,
  params: ExportArticleParams,
  { signal, progress }: Pick<ToolContext, "progress" | "signal">,
): Promise<ToolOutput> {
  const { article, citationStyle } = params;

  const requested = [
    ...new Set(params.formats.map((format) => format.toLowerCase())),
  ];

  const formats = requested.filter(isStyleFormat);

  if (formats.length === 0) {
    return fail("Export failed: no supported formats requested", {
      ok: false,
      supported: [...STYLE_FORMATS],
    });
  }

  if (formats.length !== requested.length) {
    return fail(
      `Export failed: unsupported format(s): ${requested.filter((format) => !isStyleFormat(format)).join(", ")}`,
      { ok: false, supported: [...STYLE_FORMATS] },
    );
  }

  if (params.csl) assertLocalReference(params.csl, "csl");

  if (params.bibliography)
    assertLocalReference(params.bibliography, "bibliography");

  const audit = auditCitations(article, citationStyle, cwd);

  switch (audit.status) {
    case "failed":
    case "error":
      return fail("Export stopped: citation audit failed", {
        ok: false,
        audit,
      });
    case "passed":
      break;
  }

  // The audit resolved the article inside the project; `./` keeps a leading
  // `-` from being a flag.
  const input = audit.article.startsWith("-")
    ? `./${audit.article}`
    : audit.article;

  const citeproc = citationStyle !== "inline-parenthetical";

  const stylePackage =
    params.stylePackage ??
    loadProfile(cwd)?.outputFormatPreferences?.stylePackage;

  const localAssets = citationAssetPaths(audit.article);

  const hasArticleBibliography = existsSync(
    join(cwd, localAssets.bibliography),
  );

  const bibliography = hasArticleBibliography
    ? localAssets.bibliography
    : (params.bibliography ?? ".pi-academic/bibliography.bib");

  const results: ExportResult[] = [];

  for (const format of formats) {
    const output = exportOutputPath(audit.article, format);
    const outputPath = resolveInside(cwd, output);

    if (outputPath === resolveInside(cwd, audit.article)) {
      results.push({
        format,
        output,
        ok: false,
        error: "The output file would overwrite the article itself",
      });
      progress(`${format}: failed`);
      continue;
    }

    const args = ["--from", "markdown", input];

    if (citeproc) {
      const title = bibliographyTitle(citationStyle);

      if (title) args.push(...bibliographyTitleArgs(title));

      args.push(
        "--citeproc",
        "--fail-if-warnings",
        `--bibliography=${bibliography}`,
      );

      if (params.csl) args.push(`--csl=${params.csl}`);
    }

    args.push(NOTE_REFS_FILTER);

    if (citeproc) args.push(BIBLIOGRAPHY_PAGE_FILTER);

    results.push(
      await withScratchDir(cwd, "style-export", async (dir) => {
        let style: RenderedStyle | undefined;
        let engine: string | undefined;

        const detail = () => {
          const found: Pick<ExportResult, "engine" | "style"> = {};

          if (engine) found.engine = engine;

          if (style) found.style = summarizeStyle(style);

          return found;
        };

        try {
          if (stylePackage) {
            style = await renderDocumentStyle(
              cwd,
              stylePackage,
              format,
              dir,
              signal,
            );
            args.push(...style.args);
          }

          if (format === "pdf") {
            engine =
              params.pdfEngine ?? style?.assets.engine ?? selectPdfEngine();

            if (engine) args.push(`--pdf-engine=${engine}`);
          }

          // Pandoc writes into the scratch directory; the real output is
          // replaced only after it succeeds, so a failure never clobbers or
          // fakes a result.
          const scratchOutput = join(
            dir,
            `export.${format === "latex" ? "tex" : format}`,
          );

          await runPandoc([...args, "-o", scratchOutput], {
            cwd,
            signal,
          });

          if (!existsSync(scratchOutput)) {
            throw new Error(
              "Pandoc exited successfully but did not create the output file",
            );
          }

          let bytes = readFileSync(scratchOutput);

          if (citeproc && format === "odt")
            bytes = Buffer.from(addBibliographyPageStyles(bytes));

          writeFileAtomic(outputPath, bytes);

          return { format, output, ok: true, ...detail() };
        } catch (error) {
          return {
            format,
            output,
            ok: false,
            error: errorMessage(error),
            ...detail(),
          };
        }
      }),
    );

    progress(`${format}: ${results.at(-1)?.ok ? "done" : "failed"}`);
  }

  const ok = results.every((result) => result.ok);

  const text = results
    .flatMap((result) => [
      result.ok
        ? `${result.format}: wrote ${result.output}`
        : `${result.format}: failed - ${result.error}`,
      ...(result.style?.warnings ?? []).map(
        (warning) => `  warning: ${warning}`,
      ),
    ])
    .join("\n");

  const details = {
    ok,
    audit,
    bibliography: citeproc ? bibliography : null,
    stylePackage: stylePackage ?? null,
    results,
  };

  return ok ? { text, details } : fail(text, details);
}

/**
 * Registers export, DOCX generation, and style package tools.
 *
 * @param pi - Pi extension API used to register tools.
 */
export function registerExportTools(pi: ExtensionAPI): void {
  registerTool(pi, {
    name: "pi_academic_export_article",
    effect: "exec",
    label: "Pi Academic Export Article",
    description:
      "Audit citations and export an article to DOCX, ODT, LaTeX, or PDF with Pandoc, applying the profile style package or an optional per-export override. Continues other formats when one fails; unsupported formats are rejected up front. Output replaces an earlier export only when Pandoc succeeds.",
    parameters: ExportArticleSchema,
    failure: "Export failed",
    run: (params, context) => runExport(context.cwd, params, context),
  });

  registerTool(pi, {
    name: "pi_academic_generate_docx",
    effect: "exec",
    label: "Pi Academic Generate DOCX",
    description:
      "Generate an Pi Academic .docx with real footnotes from the article markdown file, using Pandoc and the profile's style package when one is configured.",
    parameters: Type.Object({
      input: Type.String({
        minLength: 1,
        description:
          "Path to markdown article file (e.g. articles/<slug>.md) or article JSON input.",
      }),
      output: Type.String({
        minLength: 1,
        description: "Output .docx path inside the project.",
      }),
      stylePackage: Type.Optional(Type.String({ minLength: 1 })),
    }),
    failure: "DOCX generation failed",
    run: async (params, { cwd, signal }) => {
      const stylePackage =
        params.stylePackage ??
        loadProfile(cwd)?.outputFormatPreferences?.stylePackage;

      const generate = (referenceDoc?: string) =>
        generateDocx(params.input, params.output, cwd, {
          referenceDoc,
          signal,
        });

      const noWarnings: string[] = [];

      const { result, warnings } = stylePackage
        ? await withScratchDir(cwd, "style-docx", async (dir) => {
            const style = await renderDocumentStyle(
              cwd,
              stylePackage,
              "docx",
              dir,
              signal,
            );

            return {
              result: await generate(style.assets.referenceDocument),
              warnings: style.warnings,
            };
          })
        : { result: await generate(), warnings: noWarnings };

      return {
        text: [
          `Generated ${result.output}: ${result.sections} section(s), ${result.footnotes} footnote(s).`,
          ...warnings.map((warning) => `warning: ${warning}`),
        ].join("\n"),
        details: { ...result, stylePackage: stylePackage ?? null, warnings },
      };
    },
  });

  registerTool(pi, {
    name: "pi_academic_import_docx",
    effect: "exec",
    label: "Pi Academic Import DOCX",
    description:
      'Convert a Word .docx inside the project to a Pandoc markdown article with its footnotes and endnotes as [^n] definitions. Default output is articles/<slug>.md; refuses to replace an existing file unless overwrite is true. Images are extracted beside the markdown. Word citation fields come through as plain text, never [@key]. Literal cross-references such as "note 19 above" become links to note anchors, so they stay right when notes move. Warns when the footnote count differs from the Word file.',
    parameters: Type.Object({
      input: Type.String({
        minLength: 1,
        description: "Project-relative .docx path.",
      }),
      output: Type.Optional(
        Type.String({
          minLength: 1,
          description: "Project-relative .md destination.",
        }),
      ),
      overwrite: Type.Optional(Type.Boolean()),
      trackChanges: Type.Optional(stringEnum(["accept", "reject", "all"])),
      stripHighlights: Type.Optional(Type.Boolean()),
    }),
    failure: "DOCX import failed",
    run: async ({ input, ...options }, { cwd, signal }) => {
      const result = await importDocx(cwd, input, { ...options, signal });

      return {
        text: [
          `Imported ${input} to ${result.output}: ${result.footnotes} footnote(s)${result.noteRefs ? `, ${result.noteRefs} note cross-reference(s) linked` : ""}${result.media ? `, images in ${result.media}` : ""}.`,
          ...result.warnings.map((warning) => `warning: ${warning}`),
        ].join("\n"),
        details: result,
      };
    },
  });

  registerTool(pi, {
    name: "pi_academic_style_package",
    effect: "write",
    effectFor: ({ action }) => (action === "list" ? "read" : "write"),
    label: "Pi Academic Style Package",
    description:
      "Manage document style packages under .pi-academic/styles/: list them, install the academic-default starter (design.json plus editable native Word/LibreOffice/LaTeX files), or validate a package for every export format and report what each format cannot express.",
    parameters: Type.Object({
      action: stringEnum(["list", "install-starter", "validate"] as const, {
        description: "list, install-starter, or validate.",
      }),
      name: Type.Optional(
        Type.String({
          minLength: 1,
          description:
            "Package name. Required for validate; install-starter defaults to academic-default and refuses to overwrite.",
        }),
      ),
    }),
    failure: "Style package action failed",
    run: async ({ action, name }, { cwd }): Promise<ToolOutput> => {
      if (action === "list") {
        const packages = listStylePackages(cwd);

        return {
          text: packages.length
            ? packages.join("\n")
            : "No style packages found.",
          details: { ok: true, packages },
        };
      }

      if (action === "install-starter") {
        const installed = await installStarterPackage(cwd, name);

        return {
          text: `Installed ${installed.package}: ${installed.files.join(", ")}`,
          details: { ok: true, ...installed },
        };
      }

      if (name === undefined) {
        return fail("Style validation failed: name is required", { ok: false });
      }

      const check = await checkStylePackage(cwd, name);

      const text = [
        check.ok
          ? `${check.package}: valid for all formats`
          : `${check.package}: invalid`,
        ...check.errors.map((e) => `error (${e.format}): ${e.message}`),
        ...check.warnings.map((w) => `warning: ${w}`),
      ].join("\n");

      return check.ok ? { text, details: check } : fail(text, check);
    },
  });
}
