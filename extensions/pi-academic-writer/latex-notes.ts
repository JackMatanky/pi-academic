import { fontCommands, num, type LatexContext } from "./latex-context.js";

/** Block quotes, footnotes, bibliography and citations. */
export function applyNotes(ctx: LatexContext): void {
  const { out, warnings, color, unsupported, wholly, get, explicit } = ctx;
  const quote = get("blockQuote");

  if (quote) {
    const qc = color("awquote", quote.color);
    out.push(
      `\\renewenvironment{quote}{\\list{}{\\leftmargin=${num(quote.indentLeftMm ?? 10)}mm\\rightmargin=${num(quote.indentRightMm ?? 0)}mm\\topsep=${num(quote.spaceBeforePt ?? 6)}pt\\partopsep=0pt}\\item\\relax${fontCommands(quote, qc)}${quote.lineSpacing !== undefined ? `\\setstretch{${num(quote.lineSpacing)}}` : ""}}{\\endlist\\vspace{${num(quote.spaceAfterPt ?? 0)}pt}}`,
    );
    unsupported(
      "blockQuote",
      [
        "underline",
        "alignment",
        "firstLineIndentMm",
        "hangingIndentMm",
        "keepWithNext",
        "pageBreakBefore",
        "shading",
        "borderWidthPt",
        "borderColor",
      ],
      "block quotes take font, spacing, and margins only",
    );
  }

  const footnote = get("footnoteText");

  if (footnote) {
    const fc = color("awfootnote", footnote.color);

    // setspace's \setstretch re-runs \@currsize, which is \footnotesize here, and
    // recurses forever; line spacing therefore goes into the explicit leading.
    const leading =
      footnote.fontSizePt === undefined
        ? undefined
        : footnote.fontSizePt * 1.2 * (footnote.lineSpacing ?? 1);

    const { fontSizePt: _size, ...unsized } = footnote;
    out.push("\\makeatletter");

    if (footnote.fontSizePt !== undefined && leading !== undefined) {
      out.push(
        `\\renewcommand\\footnotesize{\\@setfontsize\\footnotesize{${num(footnote.fontSizePt)}pt}{${num(leading)}pt}${fontCommands(unsized, fc)}}`,
      );
    } else if (fontCommands(footnote, fc)) {
      out.push(`\\apptocmd{\\footnotesize}{${fontCommands(footnote, fc)}}{}{}`);
    }

    out.push("\\makeatother");

    if (
      footnote.fontSizePt === undefined &&
      footnote.lineSpacing !== undefined
    ) {
      if (explicit.get("footnoteText")?.has("lineSpacing")) {
        warnings.push(
          "latex: components.footnoteText.lineSpacing is not applied; set fontSizePt too so the footnote leading can be computed",
        );
      }
    }

    if (footnote.spaceAfterPt !== undefined)
      out.push(`\\setlength{\\footnotesep}{${num(footnote.spaceAfterPt)}pt}`);
    unsupported(
      "footnoteText",
      [
        "alignment",
        "indentLeftMm",
        "indentRightMm",
        "firstLineIndentMm",
        "hangingIndentMm",
        "spaceBeforePt",
        "keepWithNext",
        "pageBreakBefore",
        "underline",
        "shading",
        "borderWidthPt",
        "borderColor",
      ],
      "footnote text takes font, spacing, and footnote separation settings only",
    );
  }

  const mark = get("footnoteReference");

  if (mark) {
    const mc = color("awfnmark", mark.color);
    const style = fontCommands(mark, mc);

    if (style) {
      out.push(
        "\\makeatletter",
        `\\renewcommand\\@makefnmark{\\hbox{\\@textsuperscript{\\normalfont${style}\\@thefnmark}}}`,
        "\\makeatother",
      );
    }

    unsupported(
      "footnoteReference",
      ["underline"],
      "footnote marks cannot be underlined in LaTeX",
    );
  }

  const bib = get("bibliography");

  if (bib) {
    const bc = color("awbib", bib.color);

    const spacing =
      bib.lineSpacing !== undefined
        ? `\\setstretch{${num(bib.lineSpacing)}}`
        : "";

    const style = `${fontCommands(bib, bc)}${spacing}`;

    if (style) out.push(`\\AtBeginEnvironment{CSLReferences}{${style}}`);
    unsupported(
      "bibliography",
      [
        "spaceAfterPt",
        "spaceBeforePt",
        "hangingIndentMm",
        "indentLeftMm",
        "indentRightMm",
        "firstLineIndentMm",
        "alignment",
        "underline",
        "keepWithNext",
        "pageBreakBefore",
        "shading",
        "borderWidthPt",
        "borderColor",
      ],
      "Pandoc's CSLReferences environment sets indentation and entry spacing itself",
    );
  }

  wholly(
    "citation",
    "Pandoc emits citations as plain text with no style to attach to",
  );
}
