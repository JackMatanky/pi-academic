import type { ExplicitProps, StyleDesign } from "./style-design.js";

import { applyBlocks } from "./latex-blocks.js";
import { applyChrome } from "./latex-chrome.js";
import { createLatexContext } from "./latex-context.js";
import { applyHeadings } from "./latex-headings.js";
import { applyNotes } from "./latex-notes.js";
import { applyPageAndBody } from "./latex-page.js";

/**
 * Generated LaTeX preamble string and non-fatal style translation warnings.
 */
export interface BuiltPreamble {
  /**
   * Formatted LaTeX preamble TeX markup
   */
  tex: string;
  /**
   * Non-fatal style translation warnings
   */
  warnings: string[];
}

/**
 * Splices color definitions into LaTeX preamble output. If \usepackage{xcolor}
 * is present, colors are inserted directly after it. Otherwise,
 * \usepackage{xcolor} and colors are appended after preamble packages.
 *
 * @param out - Output LaTeX preamble line buffer to mutate.
 * @param colors - Iterable of LaTeX color definitions (e.g. \definecolor).
 */
export function spliceLatexColors(
  out: string[],
  colors: Iterable<string>,
): void {
  const colorList = Array.from(colors);

  if (colorList.length === 0) return;

  const insertAt = out.indexOf("\\usepackage{xcolor}") + 1;

  if (insertAt > 0) {
    out.splice(insertAt, 0, ...colorList);
  } else {
    const lastPkg = out.findLastIndex((line) =>
      line.startsWith("\\usepackage"),
    );

    const target = lastPkg >= 0 ? lastPkg + 1 : out.length;
    out.splice(target, 0, "\\usepackage{xcolor}", ...colorList);
  }
}

/**
 * Generates the preamble `design.json` describes. Components the LaTeX output
 * cannot express are reported in `warnings` rather than dropped.
 *
 * @param design - Style design specification.
 * @param explicit - Explicitly overridden styling properties.
 *
 * @returns Generated LaTeX preamble string and warnings.
 */
export function buildLatexPreamble(
  design: StyleDesign,
  explicit: ExplicitProps,
): BuiltPreamble {
  const ctx = createLatexContext(design, explicit);
  applyPageAndBody(ctx);
  applyHeadings(ctx);
  applyNotes(ctx);
  applyBlocks(ctx);
  applyChrome(ctx);

  // Colour definitions must precede their first use.
  spliceLatexColors(ctx.out, ctx.colors.values());

  return { tex: `${ctx.out.join("\n")}\n`, warnings: ctx.warnings };
}
