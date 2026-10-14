import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { errorMessage } from "../lib/fs-safe.js";
import { defaultReference } from "./pandoc.js";
import {
  loadStylePackage,
  STYLE_FORMATS,
  type NativeAssets,
  type PdfEngine,
  type StyleDesign,
  type StyleFormat,
} from "./style-design.js";
import { buildDocxReference } from "./style-docx.js";
import { buildLatexPreamble } from "./style-latex.js";
import { buildOdtReference } from "./style-odt.js";
import { starterByName } from "./style-starters.js";

/**
 * Format-specific rendered assets and arguments for Pandoc compilation.
 */
export interface RenderedStyle {
  package: string;
  format: StyleFormat;
  design: StyleDesign;
  /**
   * Absolute paths handed to Pandoc; `engine` is the package's PDF engine, if
   * any.
   */
  assets: NativeAssets;
  /**
   * Assets Academic Writer produced from design.json rather than read from the
   * package.
   */
  generated: ("referenceDocument" | "preamble")[];
  /**
   * Pandoc flags that apply the assets (the PDF engine is chosen by the
   * caller).
   */
  args: string[];
  warnings: string[];
}

/**
 * Run `work` in a fresh scratch directory under `.academic-writer/runs/`.
 */
export async function withScratchDir<T>(
  projectRoot: string,
  prefix: string,
  work: (dir: string) => Promise<T>,
): Promise<T> {
  const runs = join(projectRoot, ".academic-writer", "runs");
  mkdirSync(runs, { recursive: true });
  const dir = mkdtempSync(join(runs, `${prefix}-`));

  try {
    return await work(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function nativeNotice(
  format: string,
  asset: string,
  hasDesign: boolean,
): string[] {
  return hasDesign
    ? [
        `${format}: native ${asset} is used as supplied; design.json components are not applied to it`,
      ]
    : [];
}

/**
 * Validate a style package and produce the Pandoc assets for one format,
 * generating reference documents or a preamble into `outputDir` as needed.
 */
export async function renderDocumentStyle(
  projectRoot: string,
  packageName: string,
  format: StyleFormat,
  outputDir: string,
  signal?: AbortSignal,
): Promise<RenderedStyle> {
  const loaded = loadStylePackage(projectRoot, packageName, [format]);
  const native: NativeAssets = loaded.native[format] ?? {};
  const assets: NativeAssets = { ...native };
  const generated: RenderedStyle["generated"] = [];
  const warnings: string[] = [];
  const args: string[] = [];
  const hasDesign = loaded.explicit.size > 0;
  mkdirSync(outputDir, { recursive: true });

  if (format === "docx" || format === "odt") {
    if (native.referenceDocument) {
      warnings.push(...nativeNotice(format, "referenceDocument", hasDesign));
    } else {
      const base = await defaultReference(format, { signal });
      const build = format === "docx" ? buildDocxReference : buildOdtReference;
      const built = build(loaded.design, base, loaded.explicit);
      assets.referenceDocument = join(outputDir, `reference.${format}`);
      writeFileSync(assets.referenceDocument, built.bytes);
      generated.push("referenceDocument");
      warnings.push(...built.warnings);
    }

    args.push(`--reference-doc=${assets.referenceDocument}`);
  } else {
    if (native.preamble) {
      warnings.push(...nativeNotice(format, "preamble", hasDesign));
    } else {
      const built = buildLatexPreamble(loaded.design, loaded.explicit);
      assets.preamble = join(outputDir, "header.tex");
      writeFileSync(assets.preamble, built.tex);
      generated.push("preamble");
      warnings.push(...built.warnings);
    }

    if (assets.template) args.push(`--template=${assets.template}`);
    args.push(`--include-in-header=${assets.preamble}`);
  }

  return {
    package: packageName,
    format,
    design: loaded.design,
    assets,
    generated,
    args,
    warnings,
  };
}

/**
 * Validation and rendering check result for all formats supported by a style
 * package.
 */
export interface PackageCheck {
  package: string;
  ok: boolean;
  /**
   * One entry per format that failed validation or rendering.
   */
  errors: { format: StyleFormat; message: string }[];
  warnings: string[];
}

/**
 * Validate a package for every format and report every warning, without keeping
 * output.
 */
export async function checkStylePackage(
  projectRoot: string,
  packageName: string,
): Promise<PackageCheck> {
  const errors: PackageCheck["errors"] = [];
  const warnings = new Set<string>();
  await withScratchDir(projectRoot, "style-check", async (dir) => {
    for (const format of STYLE_FORMATS) {
      try {
        const rendered = await renderDocumentStyle(
          projectRoot,
          packageName,
          format,
          join(dir, format),
        );

        for (const warning of rendered.warnings) warnings.add(warning);
      } catch (error) {
        errors.push({
          format,
          message: errorMessage(error),
        });
      }
    }
  });

  return {
    package: packageName,
    ok: errors.length === 0,
    errors,
    warnings: [...warnings],
  };
}

/**
 * Names of the packages under `.academic-writer/styles/` that contain a
 * design.json.
 */
export function listStylePackages(projectRoot: string): string[] {
  const root = join(projectRoot, ".academic-writer", "styles");

  if (!existsSync(root)) return [];

  return readdirSync(root, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(root, entry.name, "design.json")),
    )
    .map((entry) => entry.name)
    .sort();
}

/**
 * Record of installed starter package files and directory path.
 */
export interface InstalledStarter {
  package: string;
  directory: string;
  files: string[];
}

/**
 * Generate the starter into `.academic-writer/styles/<name>/`: its design.json
 * (serialized from the typed definition in `style-starters.ts`) plus editable
 * native starting points under `native/`. The native files are not referenced
 * from design.json; the researcher opts in by adding `formats` entries.
 */
export async function installStarterPackage(
  projectRoot: string,
  name = "academic-default",
): Promise<InstalledStarter> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error(
      `Style package '${name}': use lowercase letters, digits, and hyphens`,
    );
  }

  const directory = join(projectRoot, ".academic-writer", "styles", name);

  if (existsSync(directory)) {
    throw new Error(
      `Style package '${name}' already exists; choose another name or edit it in place`,
    );
  }

  const starter = starterByName(name);

  const nativeDir = join(directory, "native");
  mkdirSync(nativeDir, { recursive: true });
  const files = ["design.json"];
  writeFileSync(
    join(directory, "design.json"),
    `${JSON.stringify({ ...starter, name }, null, 2)}\n`,
  );
  const design = loadStylePackage(projectRoot, name, []).design;
  const unchanged = new Map();
  writeFileSync(
    join(nativeDir, "reference.docx"),
    buildDocxReference(design, await defaultReference("docx"), unchanged).bytes,
  );
  writeFileSync(
    join(nativeDir, "reference.odt"),
    buildOdtReference(design, await defaultReference("odt"), unchanged).bytes,
  );
  writeFileSync(
    join(nativeDir, "preamble.tex"),
    buildLatexPreamble(design, unchanged).tex,
  );
  files.push(
    "native/reference.docx",
    "native/reference.odt",
    "native/preamble.tex",
  );

  return { package: name, directory, files };
}

export type { PdfEngine };
