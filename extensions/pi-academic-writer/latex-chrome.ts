import { fontCommands, type LatexContext } from "./latex-context.js";

/**
 * Applies running footer, header, and hyperlink colours to the LaTeX preamble.
 *
 * @param ctx - Active LaTeX generation context.
 */
export function applyChrome(ctx: LatexContext): void {
  const { out, color, unsupported, wholly, get } = ctx;
  // Running footer with the page number; the header stays empty.
  const footer = get("footer") ?? {};
  const pageNumber = get("pageNumber") ?? {};
  const footerColor = color("awfooter", pageNumber.color ?? footer.color);
  const footerFont = fontCommands({ ...footer, ...pageNumber }, footerColor);

  const slot = { left: "L", right: "R", center: "C", justify: "C" }[
    footer.alignment ?? "center"
  ];

  out.push(
    "\\fancyhf{}",
    "\\renewcommand{\\headrulewidth}{0pt}",
    `\\fancyfoot[${slot}]{{${footerFont}\\thepage}}`,
    "\\pagestyle{fancy}",
    // \maketitle switches the first page to the plain style.
    `\\fancypagestyle{plain}{\\fancyhf{}\\renewcommand{\\headrulewidth}{0pt}\\fancyfoot[${slot}]{{${footerFont}\\thepage}}}`,
  );
  wholly("header", "exports have no running header content to style");
  unsupported(
    "footer",
    [
      "lineSpacing",
      "spaceBeforePt",
      "spaceAfterPt",
      "indentLeftMm",
      "indentRightMm",
      "firstLineIndentMm",
      "hangingIndentMm",
      "keepWithNext",
      "pageBreakBefore",
      "underline",
      "shading",
      "borderWidthPt",
      "borderColor",
    ],
    "the footer takes font and alignment settings only",
  );

  const link = get("hyperlink");

  if (link) {
    const lc = color("awlink", link.color);

    if (lc) {
      out.push(
        `\\AtBeginDocument{\\hypersetup{colorlinks=true,urlcolor=${lc},linkcolor=${lc},citecolor=${lc}}}`,
      );
    }

    unsupported(
      "hyperlink",
      ["fontFamily", "fontSizePt", "bold", "italic", "underline", "shading"],
      "hyperref styles links by colour only",
    );
  }
}
