import type { ExplicitProps, StyleDesign } from "./style-design.js";
import { createLatexContext } from "./latex-context.js";
import { applyBlocks } from "./latex-blocks.js";
import { applyChrome } from "./latex-chrome.js";
import { applyHeadings } from "./latex-headings.js";
import { applyNotes } from "./latex-notes.js";
import { applyPageAndBody } from "./latex-page.js";

export interface BuiltPreamble {
  tex: string;
  warnings: string[];
}

/**
 * Generate the preamble `design.json` describes. Components the LaTeX
 * output cannot express are reported in `warnings` rather than dropped.
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
  const insertAt = ctx.out.indexOf("\\usepackage{xcolor}") + 1;
  ctx.out.splice(insertAt, 0, ...ctx.colors.values());

  return { tex: `${ctx.out.join("\n")}\n`, warnings: ctx.warnings };
}
