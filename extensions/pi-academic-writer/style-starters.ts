import type { ComponentStyles, PageInput } from "./style-design.js";

/**
 * A shipped starter style package: typed source for the `design.json` that
 * `installStarterPackage` writes into a project.
 */
export interface StyleStarter {
  schemaVersion: 1;
  /**
   * Default package name; install overrides it with the chosen name.
   */
  name: string;
  /**
   * Partial page setup, merged over the built-in base at load time.
   */
  page: PageInput;
  /**
   * Per-component style properties; omitted components inherit the base.
   */
  components: ComponentStyles;
  /**
   * Shipped starters declare no native assets; researchers add them.
   */
  formats: Record<string, never>;
}

// Length conventions used across the starters: 25.4 mm = 1 inch,
// 12.7 mm = 0.5 inch (the standard indented-paragraph / hanging-indent unit).

/**
 * Generic academic starter: Times New Roman throughout, 1.5-spaced justified
 * body, 1-inch margins, colored headings suppressed (black only).
 */
const academicDefault: StyleStarter = {
  schemaVersion: 1,
  name: "academic-default",
  page: {
    size: "A4",
    orientation: "portrait",
    marginsMm: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
    headerDistanceMm: 12.7,
    footerDistanceMm: 12.7,
  },
  components: {
    title: {
      fontFamily: "Times New Roman",
      fontSizePt: 16,
      bold: true,
      color: "#000000",
      alignment: "center",
      spaceBeforePt: 0,
      spaceAfterPt: 6,
    },
    subtitle: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      italic: true,
      color: "#000000",
      alignment: "center",
      spaceAfterPt: 12,
    },
    abstractHeading: {
      fontFamily: "Times New Roman",
      fontSizePt: 13,
      bold: true,
      color: "#000000",
      alignment: "left",
      spaceBeforePt: 12,
      spaceAfterPt: 6,
    },
    abstractBody: {
      fontFamily: "Times New Roman",
      fontSizePt: 11,
      lineSpacing: 1.15,
      alignment: "justify",
      indentLeftMm: 10,
      indentRightMm: 10,
      spaceAfterPt: 6,
    },
    body: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      lineSpacing: 1.5,
      alignment: "justify",
      color: "#000000",
      firstLineIndentMm: 0,
      spaceBeforePt: 0,
      spaceAfterPt: 6,
    },
    heading1: {
      fontFamily: "Times New Roman",
      fontSizePt: 14,
      bold: true,
      color: "#000000",
      spaceBeforePt: 18,
      spaceAfterPt: 6,
      keepWithNext: true,
    },
    heading2: {
      fontFamily: "Times New Roman",
      fontSizePt: 13,
      bold: true,
      color: "#000000",
      spaceBeforePt: 14,
      spaceAfterPt: 4,
      keepWithNext: true,
    },
    heading3: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      bold: true,
      italic: true,
      color: "#000000",
      spaceBeforePt: 12,
      spaceAfterPt: 4,
      keepWithNext: true,
    },
    heading4: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      italic: true,
      color: "#000000",
      spaceBeforePt: 10,
      spaceAfterPt: 3,
      keepWithNext: true,
    },
    blockQuote: {
      fontSizePt: 11,
      lineSpacing: 1.15,
      indentLeftMm: 12.7,
      indentRightMm: 12.7,
      spaceBeforePt: 6,
      spaceAfterPt: 6,
    },
    footnoteReference: {
      fontFamily: "Times New Roman",
    },
    footnoteText: {
      fontFamily: "Times New Roman",
      fontSizePt: 10,
      lineSpacing: 1.0,
      alignment: "justify",
      spaceAfterPt: 2,
    },
    citation: {},
    bibliography: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      lineSpacing: 1.15,
      hangingIndentMm: 12.7,
      indentLeftMm: 12.7,
      spaceAfterPt: 6,
    },
    table: {
      cellPaddingMm: 1.5,
      borderWidthPt: 0.5,
      borderColor: "#000000",
    },
    tableHeader: {
      bold: true,
      shading: "#EEEEEE",
    },
    tableBody: {
      fontSizePt: 11,
      lineSpacing: 1.0,
    },
    caption: {
      fontFamily: "Times New Roman",
      fontSizePt: 10,
      italic: true,
      alignment: "center",
      spaceBeforePt: 4,
      spaceAfterPt: 8,
    },
    figure: {
      alignment: "center",
    },
    header: {
      fontFamily: "Times New Roman",
      fontSizePt: 10,
      alignment: "center",
    },
    footer: {
      fontFamily: "Times New Roman",
      fontSizePt: 10,
      alignment: "center",
    },
    pageNumber: {
      fontFamily: "Times New Roman",
      fontSizePt: 10,
      color: "#000000",
    },
    hyperlink: {
      color: "#1F3A93",
      underline: true,
    },
    code: {
      fontFamily: "Courier New",
      fontSizePt: 10,
    },
  },
  formats: {},
};

/**
 * APA 7: Letter page, double-spaced everything, centered bold running heads,
 * 0.5-inch first-line indents, centered level-1 headings.
 */
const apa7: StyleStarter = {
  schemaVersion: 1,
  name: "apa-7",
  page: {
    size: "Letter",
  },
  components: {
    title: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      bold: true,
      alignment: "center",
      lineSpacing: 2.0,
      spaceBeforePt: 48,
      spaceAfterPt: 24,
    },
    abstractHeading: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      bold: true,
      alignment: "center",
      lineSpacing: 2.0,
      spaceBeforePt: 0,
      spaceAfterPt: 0,
    },
    abstractBody: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      lineSpacing: 2.0,
      alignment: "left",
      indentLeftMm: 0,
      indentRightMm: 0,
      firstLineIndentMm: 0,
      spaceAfterPt: 0,
    },
    body: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      lineSpacing: 2.0,
      alignment: "left",
      firstLineIndentMm: 12.7,
      spaceBeforePt: 0,
      spaceAfterPt: 0,
    },
    heading1: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      bold: true,
      italic: false,
      alignment: "center",
      lineSpacing: 2.0,
      spaceBeforePt: 12,
      spaceAfterPt: 0,
      keepWithNext: true,
    },
    heading2: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      bold: true,
      italic: false,
      alignment: "left",
      lineSpacing: 2.0,
      spaceBeforePt: 12,
      spaceAfterPt: 0,
      keepWithNext: true,
    },
    heading3: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      bold: true,
      italic: true,
      alignment: "left",
      lineSpacing: 2.0,
      spaceBeforePt: 12,
      spaceAfterPt: 0,
      keepWithNext: true,
    },
    heading4: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      bold: true,
      italic: false,
      alignment: "left",
      indentLeftMm: 12.7,
      lineSpacing: 2.0,
      spaceBeforePt: 12,
      spaceAfterPt: 0,
      keepWithNext: true,
    },
    heading5: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      bold: true,
      italic: true,
      alignment: "left",
      indentLeftMm: 12.7,
      lineSpacing: 2.0,
      spaceBeforePt: 12,
      spaceAfterPt: 0,
      keepWithNext: true,
    },
    heading6: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      bold: false,
      italic: true,
      alignment: "left",
      indentLeftMm: 12.7,
      lineSpacing: 2.0,
      spaceBeforePt: 12,
      spaceAfterPt: 0,
      keepWithNext: true,
    },
    blockQuote: {
      fontSizePt: 12,
      lineSpacing: 2.0,
      indentLeftMm: 12.7,
      indentRightMm: 0,
      spaceBeforePt: 0,
      spaceAfterPt: 0,
    },
    footnoteText: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      lineSpacing: 2.0,
    },
    bibliography: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      lineSpacing: 2.0,
      hangingIndentMm: 12.7,
      indentLeftMm: 12.7,
      spaceAfterPt: 0,
    },
    header: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      alignment: "right",
    },
    pageNumber: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
    },
  },
  formats: {},
};

/**
 * MLA 9: minimal — Letter page, double-spaced, left-aligned with 0.5-inch
 * first-line indents; everything else inherits the academic-default base.
 */
const mla9: StyleStarter = {
  schemaVersion: 1,
  name: "mla-9",
  page: {
    size: "Letter",
  },
  components: {
    title: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      bold: false,
      italic: false,
      alignment: "center",
      lineSpacing: 2.0,
      spaceBeforePt: 0,
      spaceAfterPt: 12,
    },
    body: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      lineSpacing: 2.0,
      alignment: "left",
      firstLineIndentMm: 12.7,
      spaceBeforePt: 0,
      spaceAfterPt: 0,
    },
    blockQuote: {
      fontSizePt: 12,
      lineSpacing: 2.0,
      indentLeftMm: 12.7,
      indentRightMm: 0,
      spaceBeforePt: 0,
      spaceAfterPt: 0,
    },
    footnoteText: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      lineSpacing: 2.0,
    },
    bibliography: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      lineSpacing: 2.0,
      hangingIndentMm: 12.7,
      indentLeftMm: 12.7,
      spaceAfterPt: 0,
    },
    header: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      alignment: "right",
    },
    pageNumber: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
    },
  },
  formats: {},
};

/**
 * Chicago (notes-bibliography flavor): like MLA but with true chapter-style
 * headings, single-spaced block quotes and bibliography with 0.5-inch hanging
 * indents, 10pt footnotes with first-line indents.
 */
const chicago: StyleStarter = {
  schemaVersion: 1,
  name: "chicago",
  page: {
    size: "Letter",
  },
  components: {
    title: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      bold: false,
      italic: false,
      alignment: "center",
      lineSpacing: 2.0,
      spaceBeforePt: 0,
      spaceAfterPt: 12,
    },
    body: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      lineSpacing: 2.0,
      alignment: "left",
      firstLineIndentMm: 12.7,
      spaceBeforePt: 0,
      spaceAfterPt: 0,
    },
    heading1: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      bold: true,
      italic: false,
      alignment: "center",
      lineSpacing: 2.0,
      spaceBeforePt: 18,
      spaceAfterPt: 6,
      keepWithNext: true,
    },
    heading2: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      bold: true,
      italic: false,
      alignment: "left",
      lineSpacing: 2.0,
      spaceBeforePt: 12,
      spaceAfterPt: 0,
      keepWithNext: true,
    },
    heading3: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      bold: false,
      italic: true,
      alignment: "left",
      lineSpacing: 2.0,
      spaceBeforePt: 12,
      spaceAfterPt: 0,
      keepWithNext: true,
    },
    heading4: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      bold: false,
      italic: true,
      alignment: "left",
      indentLeftMm: 12.7,
      lineSpacing: 2.0,
      spaceBeforePt: 0,
      spaceAfterPt: 0,
      keepWithNext: true,
    },
    heading5: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      bold: false,
      italic: true,
      alignment: "left",
      indentLeftMm: 12.7,
      lineSpacing: 2.0,
      spaceBeforePt: 0,
      spaceAfterPt: 0,
      keepWithNext: true,
    },
    heading6: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      bold: false,
      italic: true,
      alignment: "left",
      indentLeftMm: 12.7,
      lineSpacing: 2.0,
      spaceBeforePt: 0,
      spaceAfterPt: 0,
      keepWithNext: true,
    },
    blockQuote: {
      fontSizePt: 12,
      lineSpacing: 1.0,
      indentLeftMm: 12.7,
      indentRightMm: 0,
      spaceBeforePt: 12,
      spaceAfterPt: 12,
    },
    footnoteText: {
      fontFamily: "Times New Roman",
      fontSizePt: 10,
      lineSpacing: 1.0,
      firstLineIndentMm: 12.7,
      spaceAfterPt: 4,
    },
    bibliography: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      lineSpacing: 1.0,
      hangingIndentMm: 12.7,
      indentLeftMm: 12.7,
      spaceAfterPt: 12,
    },
    header: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
      alignment: "right",
    },
    pageNumber: {
      fontFamily: "Times New Roman",
      fontSizePt: 12,
    },
  },
  formats: {},
};

/**
 * Every shipped starter. Unknown names fall back to academic-default, exactly
 * as the previous template-directory fallback did.
 */
export const STYLE_STARTERS: readonly StyleStarter[] = [
  academicDefault,
  apa7,
  mla9,
  chicago,
];

/**
 * Returns the starter definition for `name`; unknown names resolve to
 * academic-default's design, which is installed under the requested name.
 *
 * @param name - Shipped starter package name (e.g. "apa-7", "chicago").
 *
 * @returns Matching starter definition or the academic-default fallback.
 */
export function starterByName(name: string): StyleStarter {
  return (
    STYLE_STARTERS.find((starter) => starter.name === name) ?? academicDefault
  );
}
