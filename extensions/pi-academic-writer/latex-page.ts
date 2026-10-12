import {
  ALIGN_COMMAND,
  GEOMETRY_PAPER,
  line,
  num,
  type LatexContext,
} from "./latex-context.js";

/**
 * Page geometry, packages, fonts and document-wide body text settings.
 */
export function applyPageAndBody(ctx: LatexContext): void {
  const { out, color, unsupported, get, design } = ctx;
  const { page } = design;
  const m = page.marginsMm;

  const geometry = [
    GEOMETRY_PAPER[page.size],
    `top=${num(m.top)}mm`,
    `bottom=${num(m.bottom)}mm`,
    `left=${num(m.left)}mm`,
    `right=${num(m.right)}mm`,
  ];

  if (page.orientation === "landscape") geometry.push("landscape");

  // Word measures the footer from the page edge; LaTeX measures footskip from
  // the text block.
  if (page.footerDistanceMm !== undefined && page.footerDistanceMm < m.bottom) {
    geometry.push(`footskip=${num(m.bottom - page.footerDistanceMm)}mm`);
  }

  out.push(
    "\\usepackage{iftex}",
    `\\usepackage[${geometry.join(",")}]{geometry}`,
    "\\usepackage{xcolor}",
    "\\usepackage{colortbl}",
    "\\usepackage{setspace}",
    "\\usepackage{etoolbox}",
    "\\usepackage{titlesec}",
    "\\usepackage{titling}",
    "\\usepackage{fancyhdr}",
    "\\usepackage{caption}",
  );

  const body = get("body") ?? {};
  const body_color = color("awbody", body.color);
  const fontLines: string[] = [];

  if (body.fontFamily) {
    fontLines.push(
      `\\IfFontExistsTF{${body.fontFamily}}{\\setmainfont{${body.fontFamily}}}{}`,
    );
  }

  const code = get("code");

  if (code?.fontFamily) {
    fontLines.push(
      `\\IfFontExistsTF{${code.fontFamily}}{\\setmonofont{${code.fontFamily}}}{}`,
    );
  }

  if (fontLines.length) {
    out.push("\\iftutex", "\\usepackage{fontspec}", ...fontLines, "\\fi");
  }

  out.push("\\makeatletter");

  if (body.fontSizePt !== undefined) {
    out.push(
      `\\renewcommand\\normalsize{\\@setfontsize\\normalsize{${num(body.fontSizePt)}pt}{${line(body.fontSizePt)}pt}}`,
      "\\AtBeginDocument{\\normalsize}",
    );
  }

  out.push("\\makeatother");

  if (body.lineSpacing !== undefined)
    out.push(`\\AtBeginDocument{\\setstretch{${num(body.lineSpacing)}}}`);

  if (body.alignment && ALIGN_COMMAND[body.alignment]) {
    out.push(`\\AtBeginDocument{${ALIGN_COMMAND[body.alignment]}}`);
  }

  if (body.firstLineIndentMm !== undefined) {
    out.push(
      `\\AtBeginDocument{\\setlength{\\parindent}{${num(body.firstLineIndentMm)}mm}}`,
    );
  }

  if (body.spaceAfterPt !== undefined) {
    out.push(
      `\\AtBeginDocument{\\setlength{\\parskip}{${num(body.spaceAfterPt)}pt}}`,
    );
  }

  if (body_color) out.push(`\\AtBeginDocument{\\color{${body_color}}}`);
  unsupported(
    "body",
    [
      "bold",
      "italic",
      "underline",
      "indentLeftMm",
      "indentRightMm",
      "hangingIndentMm",
      "spaceBeforePt",
      "keepWithNext",
      "pageBreakBefore",
      "shading",
      "borderWidthPt",
      "borderColor",
    ],
    "LaTeX applies body text settings document-wide only for the listed properties",
  );
}
