import {
  ALIGN_COMMAND,
  fontCommands,
  line,
  num,
  type LatexContext,
} from "./latex-context.js";

/**
 * Applies lists, tables, captions, figures, and code block styles to the LaTeX
 * preamble.
 *
 * @param ctx - Active LaTeX generation context.
 */
export function applyBlocks(ctx: LatexContext): void {
  const { out, color, unsupported, wholly, get } = ctx;
  const lists = [get("orderedList"), get("bulletList")];

  if (lists.some(Boolean)) {
    out.push("\\usepackage{enumitem}");
    (["orderedList", "bulletList"] as const).forEach((name, index) => {
      const props = lists[index];

      if (!props) return;
      const env = name === "orderedList" ? "enumerate" : "itemize";
      const options: string[] = [];

      if (props.indentLeftMm !== undefined)
        options.push(`leftmargin=${num(props.indentLeftMm)}mm`);

      if (props.spaceAfterPt !== undefined)
        options.push(`itemsep=${num(props.spaceAfterPt)}pt`);

      if (props.spaceBeforePt !== undefined)
        options.push(`topsep=${num(props.spaceBeforePt)}pt`);

      if (options.length) out.push(`\\setlist[${env}]{${options.join(",")}}`);
      unsupported(
        name,
        [
          "fontFamily",
          "fontSizePt",
          "lineSpacing",
          "bold",
          "italic",
          "underline",
          "color",
          "shading",
          "alignment",
          "indentRightMm",
          "firstLineIndentMm",
          "hangingIndentMm",
          "keepWithNext",
          "pageBreakBefore",
          "borderWidthPt",
          "borderColor",
        ],
        "lists take left indent and item/list spacing only",
      );
    });
  }

  const table = get("table");

  if (table) {
    if (table.cellPaddingMm !== undefined)
      out.push(`\\setlength{\\tabcolsep}{${num(table.cellPaddingMm)}mm}`);

    const rule = [
      table.borderWidthPt !== undefined
        ? `\\setlength{\\heavyrulewidth}{${num(table.borderWidthPt)}pt}\\setlength{\\lightrulewidth}{${num(table.borderWidthPt)}pt}`
        : "",
      table.borderColor
        ? `\\arrayrulecolor{${color("awrule", table.borderColor)}}`
        : "",
    ].join("");

    // booktabs is only loaded when the document contains a table.
    if (rule)
      out.push(`\\AtBeginDocument{\\ifdefined\\heavyrulewidth${rule}\\fi}`);
    unsupported(
      "table",
      [
        "fontFamily",
        "fontSizePt",
        "lineSpacing",
        "bold",
        "italic",
        "underline",
        "color",
        "shading",
        "alignment",
        "spaceBeforePt",
        "spaceAfterPt",
        "indentLeftMm",
        "indentRightMm",
        "firstLineIndentMm",
        "hangingIndentMm",
        "keepWithNext",
        "pageBreakBefore",
      ],
      "tables take cell padding and rule width/colour only",
    );
  }

  wholly(
    "tableHeader",
    "Pandoc's LaTeX tables carry no header-row hook to style",
  );
  wholly("tableBody", "Pandoc's LaTeX tables carry no body-cell hook to style");

  const caption = get("caption");

  if (caption) {
    const cc = color("awcaption", caption.color);
    const fontMacro = fontCommands(caption, cc);
    const options: string[] = [];

    if (fontMacro) {
      out.push(`\\DeclareCaptionFont{awcaption}{${fontMacro}}`);
      options.push("font=awcaption");
    }

    if (caption.alignment) {
      options.push(
        `justification=${{ left: "raggedright", right: "raggedleft", center: "centering", justify: "justified" }[caption.alignment]}`,
      );
    }

    if (caption.spaceBeforePt !== undefined)
      options.push(`aboveskip=${num(caption.spaceBeforePt)}pt`);

    if (caption.spaceAfterPt !== undefined)
      options.push(`belowskip=${num(caption.spaceAfterPt)}pt`);

    if (options.length) out.push(`\\captionsetup{${options.join(",")}}`);
    unsupported(
      "caption",
      [
        "lineSpacing",
        "underline",
        "indentLeftMm",
        "indentRightMm",
        "firstLineIndentMm",
        "hangingIndentMm",
        "keepWithNext",
        "pageBreakBefore",
        "shading",
        "borderWidthPt",
        "borderColor",
      ],
      "captions take font, alignment, and spacing only",
    );
  }

  const figure = get("figure");

  if (figure?.alignment && ALIGN_COMMAND[figure.alignment]) {
    out.push(
      `\\AtBeginEnvironment{figure}{${ALIGN_COMMAND[figure.alignment]}}`,
    );
  }

  if (figure) {
    unsupported(
      "figure",
      [
        "fontFamily",
        "fontSizePt",
        "lineSpacing",
        "bold",
        "italic",
        "underline",
        "color",
        "shading",
        "spaceBeforePt",
        "spaceAfterPt",
        "indentLeftMm",
        "indentRightMm",
        "firstLineIndentMm",
        "hangingIndentMm",
        "keepWithNext",
        "pageBreakBefore",
        "borderWidthPt",
        "borderColor",
      ],
      "figures take alignment only",
    );
  }

  const code = get("code");

  if (code?.fontSizePt !== undefined) {
    const size = `\\fontsize{${num(code.fontSizePt)}pt}{${line(code.fontSizePt)}pt}\\selectfont`;
    out.push(
      `\\AtBeginEnvironment{verbatim}{${size}}`,
      `\\AtBeginEnvironment{Highlighting}{${size}}`,
    );
  }

  if (code) {
    unsupported(
      "code",
      [
        "bold",
        "italic",
        "underline",
        "color",
        "shading",
        "lineSpacing",
        "alignment",
        "spaceBeforePt",
        "spaceAfterPt",
        "indentLeftMm",
        "indentRightMm",
        "firstLineIndentMm",
        "hangingIndentMm",
        "keepWithNext",
        "pageBreakBefore",
        "borderWidthPt",
        "borderColor",
      ],
      "code takes a monospace font and block size only",
    );
  }
}
