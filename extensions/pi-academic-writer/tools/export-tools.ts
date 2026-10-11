import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Type } from "typebox";
import {
  errorMessage,
  resolveInside,
  writeFileAtomic,
} from "../../lib/fs-safe.js";
import { loadProfile } from "../../lib/profile.js";
import { auditCitations } from "../citation-audit.js";
import {
  checkStylePackage,
  installStarterPackage,
  listStylePackages,
  renderDocumentStyle,
  withScratchDir,
  type RenderedStyle,
} from "../document-style.js";
import { cleanRtlText, generateDocx } from "../docx-generator.js";
import { runPandoc } from "../pandoc.js";
import { selectPdfEngine } from "../commands.js";
import { assembleDocxJson } from "../docx-assembly.js";
import { citationAssetPaths } from "../project-files.js";
import { STYLE_FORMATS, type StyleFormat } from "../style-design.js";
import {
  fail,
  parseJsonObject,
  registerTool,
  type ToolOutput,
} from "../tool-kit.js";

/** Per-format style details returned by `academic_writer_export_article`. */
interface StyleSummary {
  package: string;
  /** Assets generated from design.json. */
  generated: string[];
  /** Native assets used as supplied, by role. */
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
  (STYLE_FORMATS as readonly string[]).includes(value);

const REMOTE_REFERENCE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Pandoc fetches URLs given as `--csl=` or `--bibliography=`; exports stay local. */
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

/** Export, DOCX generation, style package and typography tools. */
export function registerExportTools(pi: ExtensionAPI): void {
  registerTool(pi, {
    name: "academic_writer_export_article",
    label: "Academic Writer Export Article",
    description:
      "Audit citations and export an article to DOCX, ODT, LaTeX, or PDF with Pandoc, applying the profile style package or an optional per-export override. Continues other formats when one fails; unsupported formats are rejected up front. Output replaces an earlier export only when Pandoc succeeds.",
    parameters: Type.Object({
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
            "Local bibliography file for citeproc exports. Defaults to the article-local snapshot, then .academic-writer/bibliography.bib.",
        }),
      ),
      pdfEngine: Type.Optional(
        Type.Union([Type.Literal("xelatex"), Type.Literal("tectonic")], {
          description:
            "Optional PDF engine. Defaults to the style package engine, then to whichever of xelatex/tectonic is installed.",
        }),
      ),
      stylePackage: Type.Optional(
        Type.String({
          minLength: 1,
          description:
            "Style package under .academic-writer/styles/ for this export; overrides the profile's stylePackage.",
        }),
      ),
    }),
    failure: "Export failed",
    run: async (params, { cwd, signal }) => {
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

      if (!("mode" in audit) || !audit.ok) {
        return fail("Export stopped: citation audit failed", {
          ok: false,
          audit,
        });
      }

      // The audit resolved the article inside the project; `./` keeps a leading `-` from being a flag.
      const input = audit.article.startsWith("-")
        ? `./${audit.article}`
        : audit.article;

      const citeproc = citationStyle !== "inline-parenthetical";

      const stylePackage =
        params.stylePackage ??
        loadProfile(cwd)?.outputFormatPreferences?.stylePackage;

      const localAssets = citationAssetPaths(audit.article);

      const bibliography =
        params.bibliography ??
        (existsSync(join(cwd, localAssets.bibliography))
          ? localAssets.bibliography
          : ".academic-writer/bibliography.bib");

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
          continue;
        }

        const args = ["--from", "markdown", input];

        if (citeproc) {
          args.push(
            "--citeproc",
            "--fail-if-warnings",
            `--bibliography=${bibliography}`,
          );

          if (params.csl) args.push(`--csl=${params.csl}`);
        }

        results.push(
          await withScratchDir(cwd, "style-export", async (dir) => {
            let style: RenderedStyle | undefined;
            let engine: string | undefined;

            const detail = () => ({
              ...(engine ? { engine } : {}),
              ...(style ? { style: summarizeStyle(style) } : {}),
            });

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

              // Pandoc writes into the scratch directory; the real output is replaced
              // only after it succeeds, so a failure never clobbers or fakes a result.
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

              writeFileAtomic(outputPath, readFileSync(scratchOutput));

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
    },
  });

  registerTool(pi, {
    name: "academic_writer_assemble_docx_json",
    label: "Academic Writer Assemble DOCX JSON",
    description:
      "Deterministically assemble article JSON for academic_writer_generate_docx from an article markdown file inside the project. Headings below the title become sections, [^n] footnotes become real footnotes, and fenced code is left intact. Use before academic_writer_generate_docx instead of hand-writing large JSON payloads.",
    parameters: Type.Object({
      input: Type.String({
        minLength: 1,
        description: "Markdown article path.",
      }),
      output: Type.String({
        minLength: 1,
        description: "JSON output path for academic_writer_generate_docx.",
      }),
      title: Type.Optional(Type.String({ minLength: 1 })),
      targetLanguage: Type.Optional(Type.String({ minLength: 1 })),
      formatJson: Type.Optional(
        Type.String({
          description:
            "Optional JSON object merged into the article JSON format field.",
        }),
      ),
    }),
    run: (params, { cwd }) => {
      const format =
        params.formatJson === undefined
          ? undefined
          : parseJsonObject(params.formatJson);

      if (format === null) {
        return fail("DOCX JSON assembly failed: formatJson must be an object", {
          ok: false,
        });
      }

      const result = assembleDocxJson(cwd, params.input, params.output, {
        ...(params.title ? { title: params.title } : {}),
        ...(params.targetLanguage
          ? { targetLanguage: params.targetLanguage }
          : {}),
        ...(format ? { format } : {}),
      });

      if (!result.ok) {
        return fail(`DOCX JSON assembly failed: ${result.error}`, result);
      }

      return {
        text: `Assembled ${result.output}: ${result.sections} section(s), ${result.totalWords} word(s).`,
        details: result,
      };
    },
  });

  registerTool(pi, {
    name: "academic_writer_generate_docx",
    label: "Academic Writer Generate DOCX",
    description:
      "Generate an Academic Writer .docx with real footnotes from the article JSON payload, using Pandoc and the profile's style package when one is configured.",
    parameters: Type.Object({
      input: Type.String({
        minLength: 1,
        description:
          "Path to the article JSON input file inside the project; relative paths resolve from the project root.",
      }),
      output: Type.String({
        minLength: 1,
        description:
          "Output .docx path inside the project; relative paths resolve from the project root.",
      }),
      stylePackage: Type.Optional(
        Type.String({
          minLength: 1,
          description:
            "Style package under .academic-writer/styles/; overrides the profile's stylePackage.",
        }),
      ),
    }),
    failure: "DOCX generation failed",
    run: async (params, { cwd, signal }) => {
      const stylePackage =
        params.stylePackage ??
        loadProfile(cwd)?.outputFormatPreferences?.stylePackage;

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
              result: await generateDocx(params.input, params.output, cwd, {
                ...(style.assets.referenceDocument
                  ? { referenceDoc: style.assets.referenceDocument }
                  : {}),
                ...(signal ? { signal } : {}),
              }),
              warnings: style.warnings,
            };
          })
        : {
            result: await generateDocx(
              params.input,
              params.output,
              cwd,
              signal ? { signal } : {},
            ),
            warnings: [] as string[],
          };

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
    name: "academic_writer_style_package",
    label: "Academic Writer Style Package",
    description:
      "Manage document style packages under .academic-writer/styles/: list them, install the academic-default starter (design.json plus editable native Word/LibreOffice/LaTeX files), or validate a package for every export format and report what each format cannot express.",
    parameters: Type.Object({
      action: Type.Union(
        [
          Type.Literal("list"),
          Type.Literal("install-starter"),
          Type.Literal("validate"),
        ],
        { description: "list, install-starter, or validate." },
      ),
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

  registerTool(pi, {
    name: "academic_writer_fix_typography",
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
