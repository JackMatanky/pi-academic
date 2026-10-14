import type { ExplicitProps } from "./style-design.js";
import type { Document, Element } from "@xmldom/xmldom";

import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import {
  COMPONENT_NAMES,
  pageSizeMm,
  type ComponentName,
  type ComponentStyle,
  type StyleDesign,
} from "./style-design.js";
import { append, isElement, ownerOf, rootOf } from "./xml.js";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const REL = "http://schemas.openxmlformats.org/package/2006/relationships";

const CT = "http://schemas.openxmlformats.org/package/2006/content-types";

const FOOTER_REL_ID = "rIdAwFooter1";

// Word rejects out-of-order children, so every insertion follows these
// sequences.
const STYLE_ORDER = [
  "name",
  "aliases",
  "basedOn",
  "next",
  "link",
  "autoRedefine",
  "hidden",
  "uiPriority",
  "semiHidden",
  "unhideWhenUsed",
  "qFormat",
  "locked",
  "personal",
  "personalCompose",
  "personalReply",
  "rsid",
  "pPr",
  "rPr",
  "tblPr",
  "trPr",
  "tcPr",
  "tblStylePr",
] as const;

const PPR_ORDER = [
  "pStyle",
  "keepNext",
  "keepLines",
  "pageBreakBefore",
  "framePr",
  "widowControl",
  "numPr",
  "suppressLineNumbers",
  "pBdr",
  "shd",
  "tabs",
  "suppressAutoHyphens",
  "kinsoku",
  "wordWrap",
  "overflowPunct",
  "topLinePunct",
  "autoSpaceDE",
  "autoSpaceDN",
  "bidi",
  "adjustRightInd",
  "snapToGrid",
  "spacing",
  "ind",
  "contextualSpacing",
  "mirrorIndents",
  "suppressOverlap",
  "jc",
  "textDirection",
  "textAlignment",
  "textboxTightWrap",
  "outlineLvl",
  "divId",
  "cnfStyle",
  "rPr",
  "sectPr",
  "pPrChange",
] as const;

const RPR_ORDER = [
  "rStyle",
  "rFonts",
  "b",
  "bCs",
  "i",
  "iCs",
  "caps",
  "smallCaps",
  "strike",
  "dstrike",
  "outline",
  "shadow",
  "emboss",
  "imprint",
  "noProof",
  "snapToGrid",
  "vanish",
  "webHidden",
  "color",
  "spacing",
  "w",
  "kern",
  "position",
  "sz",
  "szCs",
  "highlight",
  "u",
  "effect",
  "bdr",
  "shd",
  "fitText",
  "vertAlign",
  "rtl",
  "cs",
  "em",
  "lang",
  "eastAsianLayout",
  "specVanish",
  "oMath",
] as const;

const TBLPR_ORDER = [
  "tblStyle",
  "tblpPr",
  "tblOverlap",
  "bidiVisual",
  "tblStyleRowBandSize",
  "tblStyleColBandSize",
  "tblW",
  "jc",
  "tblCellSpacing",
  "tblInd",
  "tblBorders",
  "shd",
  "tblLayout",
  "tblCellMar",
  "tblLook",
] as const;

const TBLSTYLEPR_ORDER = ["pPr", "rPr", "tblPr", "trPr", "tcPr"] as const;

const TCPR_ORDER = [
  "cnfStyle",
  "tcW",
  "gridSpan",
  "hMerge",
  "vMerge",
  "tcBorders",
  "shd",
  "noWrap",
  "tcMar",
  "textDirection",
  "tcFitText",
  "vAlign",
  "hideMark",
] as const;

type Order = readonly string[];

interface StyleTarget {
  id: string;
  /**
   * Paragraph styles accept every property; character styles only run
   * properties.
   */
  type: "paragraph" | "character";
  /**
   * Created when the reference document does not define it.
   */
  create?: { name: string; basedOn: string };
}

const STYLE_MAP: Partial<Record<ComponentName, StyleTarget[]>> = {
  title: [{ id: "Title", type: "paragraph" }],
  subtitle: [{ id: "Subtitle", type: "paragraph" }],
  abstractHeading: [{ id: "AbstractTitle", type: "paragraph" }],
  abstractBody: [{ id: "Abstract", type: "paragraph" }],
  body: [{ id: "BodyText", type: "paragraph" }],
  heading1: [{ id: "Heading1", type: "paragraph" }],
  heading2: [{ id: "Heading2", type: "paragraph" }],
  heading3: [{ id: "Heading3", type: "paragraph" }],
  heading4: [{ id: "Heading4", type: "paragraph" }],
  heading5: [{ id: "Heading5", type: "paragraph" }],
  heading6: [{ id: "Heading6", type: "paragraph" }],
  blockQuote: [{ id: "BlockText", type: "paragraph" }],
  footnoteReference: [{ id: "FootnoteReference", type: "character" }],
  footnoteText: [{ id: "FootnoteText", type: "paragraph" }],
  bibliography: [{ id: "Bibliography", type: "paragraph" }],
  tableBody: [{ id: "Compact", type: "paragraph" }],
  caption: [{ id: "Caption", type: "paragraph" }],
  figure: [
    { id: "CaptionedFigure", type: "paragraph" },
    { id: "Figure", type: "paragraph" },
  ],
  header: [
    {
      id: "Header",
      type: "paragraph",
      create: { name: "header", basedOn: "Normal" },
    },
  ],
  footer: [
    {
      id: "Footer",
      type: "paragraph",
      create: { name: "footer", basedOn: "Normal" },
    },
  ],
  pageNumber: [
    {
      id: "PageNumber",
      type: "character",
      create: { name: "page number", basedOn: "DefaultParagraphFont" },
    },
  ],
  hyperlink: [{ id: "Hyperlink", type: "character" }],
  code: [{ id: "VerbatimChar", type: "character" }],
};

const UNSUPPORTED: Partial<Record<ComponentName, string>> = {
  citation: "Pandoc emits citations as plain runs with no style to attach to",
  orderedList:
    "list layout lives in numbering definitions that Pandoc regenerates",
  bulletList:
    "list layout lives in numbering definitions that Pandoc regenerates",
};

const PARAGRAPH_ONLY: (keyof ComponentStyle)[] = [
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
];

const twipsMm = (mm: number) => String(Math.round((mm * 1440) / 25.4));

const twipsPt = (pt: number) => String(Math.round(pt * 20));

const hex = (color: string) => color.slice(1).toUpperCase();

function elementChildren(parent: Element): Element[] {
  const out: Element[] = [];

  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (isElement(node)) out.push(node);
  }

  return out;
}

/**
 * Return the child with this name, creating it at the schema-correct position.
 */
function ensure(parent: Element, local: string, order: Order): Element {
  const existing = elementChildren(parent).find((el) => el.localName === local);

  if (existing) return existing;
  const doc = ownerOf(parent);
  const created = doc.createElementNS(W, `w:${local}`);
  const rank = order.indexOf(local);

  const next = elementChildren(parent).find((el) => {
    const other = order.indexOf(el.localName ?? "");

    return other > rank;
  });

  parent.insertBefore(created, next ?? null);

  return created;
}

/**
 * Remove a w: attribute by qualified name; xmldom's removeAttributeNS misses
 * parsed attributes.
 */
function drop(el: Element, name: string): void {
  el.removeAttribute(`w:${name}`);
}

function attrs(el: Element, values: Record<string, string>): Element {
  for (const [name, value] of Object.entries(values)) {
    el.setAttributeNS(W, `w:${name}`, value);
  }

  return el;
}

function toggle(rPr: Element, local: string, on: boolean): void {
  attrs(ensure(rPr, local, RPR_ORDER), { val: on ? "1" : "0" });
}

function applyRun(rPr: Element, props: ComponentStyle): void {
  if (props.fontFamily) {
    const fonts = ensure(rPr, "rFonts", RPR_ORDER);

    // Theme attributes take precedence over explicit names in Word.
    for (const theme of [
      "asciiTheme",
      "hAnsiTheme",
      "eastAsiaTheme",
      "cstheme",
    ]) {
      drop(fonts, theme);
    }

    attrs(fonts, {
      ascii: props.fontFamily,
      hAnsi: props.fontFamily,
      cs: props.fontFamily,
      eastAsia: props.fontFamily,
    });
  }

  if (props.bold !== undefined) {
    toggle(rPr, "b", props.bold);
    toggle(rPr, "bCs", props.bold);
  }

  if (props.italic !== undefined) {
    toggle(rPr, "i", props.italic);
    toggle(rPr, "iCs", props.italic);
  }

  if (props.color) {
    const color = ensure(rPr, "color", RPR_ORDER);

    for (const theme of ["themeColor", "themeShade", "themeTint"]) {
      drop(color, theme);
    }

    attrs(color, { val: hex(props.color) });
  }

  if (props.fontSizePt !== undefined) {
    const half = String(Math.round(props.fontSizePt * 2));
    attrs(ensure(rPr, "sz", RPR_ORDER), { val: half });
    attrs(ensure(rPr, "szCs", RPR_ORDER), { val: half });
  }

  if (props.underline !== undefined) {
    attrs(ensure(rPr, "u", RPR_ORDER), {
      val: props.underline ? "single" : "none",
    });
  }
}

function box(
  parent: Element,
  width: number,
  color: string,
  sides: readonly string[],
) {
  for (const side of sides) {
    attrs(append(parent, ownerOf(parent).createElementNS(W, `w:${side}`)), {
      val: width > 0 ? "single" : "nil",
      sz: String(Math.max(2, Math.round(width * 8))),
      space: "4",
      color: color ? hex(color) : "auto",
    });
  }
}

function applyParagraph(pPr: Element, props: ComponentStyle): void {
  if (props.keepWithNext !== undefined) {
    attrs(ensure(pPr, "keepNext", PPR_ORDER), {
      val: props.keepWithNext ? "1" : "0",
    });
  }

  if (props.pageBreakBefore !== undefined) {
    attrs(ensure(pPr, "pageBreakBefore", PPR_ORDER), {
      val: props.pageBreakBefore ? "1" : "0",
    });
  }

  if (props.borderWidthPt !== undefined || props.borderColor) {
    const borders = ensure(pPr, "pBdr", PPR_ORDER);

    while (borders.firstChild) borders.removeChild(borders.firstChild);
    box(borders, props.borderWidthPt ?? 0.5, props.borderColor ?? "", [
      "top",
      "left",
      "bottom",
      "right",
    ]);
  }

  if (props.shading) {
    attrs(ensure(pPr, "shd", PPR_ORDER), {
      val: "clear",
      color: "auto",
      fill: hex(props.shading),
    });
  }

  if (
    props.spaceBeforePt !== undefined ||
    props.spaceAfterPt !== undefined ||
    props.lineSpacing !== undefined
  ) {
    const spacing = ensure(pPr, "spacing", PPR_ORDER);

    if (props.spaceBeforePt !== undefined) {
      attrs(spacing, { before: twipsPt(props.spaceBeforePt) });
      drop(spacing, "beforeAutospacing");
    }

    if (props.spaceAfterPt !== undefined) {
      attrs(spacing, { after: twipsPt(props.spaceAfterPt) });
      drop(spacing, "afterAutospacing");
    }

    if (props.lineSpacing !== undefined) {
      attrs(spacing, {
        line: String(Math.round(props.lineSpacing * 240)),
        lineRule: "auto",
      });
    }
  }

  if (
    props.indentLeftMm !== undefined ||
    props.indentRightMm !== undefined ||
    props.firstLineIndentMm !== undefined ||
    props.hangingIndentMm !== undefined
  ) {
    const ind = ensure(pPr, "ind", PPR_ORDER);

    if (props.indentLeftMm !== undefined)
      attrs(ind, { left: twipsMm(props.indentLeftMm) });

    if (props.indentRightMm !== undefined)
      attrs(ind, { right: twipsMm(props.indentRightMm) });

    if (props.firstLineIndentMm !== undefined) {
      drop(ind, "hanging");
      attrs(ind, { firstLine: twipsMm(props.firstLineIndentMm) });
    } else if (props.hangingIndentMm !== undefined) {
      drop(ind, "firstLine");
      attrs(ind, { hanging: twipsMm(props.hangingIndentMm) });
    }
  }

  if (props.alignment) {
    const jc = {
      left: "left",
      right: "right",
      center: "center",
      justify: "both",
    }[props.alignment];

    attrs(ensure(pPr, "jc", PPR_ORDER), { val: jc });
  }
}

function findStyle(root: Element, id: string): Element | undefined {
  return elementChildren(root).find(
    (el) => el.localName === "style" && el.getAttributeNS(W, "styleId") === id,
  );
}

function createStyle(root: Element, target: StyleTarget): Element {
  const doc = ownerOf(root);

  const style = attrs(doc.createElementNS(W, "w:style"), {
    type: target.type,
    styleId: target.id,
  });

  attrs(append(style, doc.createElementNS(W, "w:name")), {
    val: target.create?.name ?? target.id,
  });
  attrs(append(style, doc.createElementNS(W, "w:basedOn")), {
    val: target.create?.basedOn ?? "Normal",
  });
  root.appendChild(style);

  return style;
}

function applyStyle(
  style: Element,
  target: StyleTarget,
  props: ComponentStyle,
) {
  if (target.type === "paragraph") {
    applyParagraph(ensure(style, "pPr", STYLE_ORDER), props);
  }

  applyRun(ensure(style, "rPr", STYLE_ORDER), props);
}

function applyTable(root: Element, design: StyleDesign) {
  const table = design.components.table;
  const header = design.components.tableHeader;
  const style = findStyle(root, "Table");

  if (!style) return;

  if (table) {
    applyParagraph(ensure(style, "pPr", STYLE_ORDER), table);
    applyRun(ensure(style, "rPr", STYLE_ORDER), table);
    const tblPr = ensure(style, "tblPr", STYLE_ORDER);

    if (table.cellPaddingMm !== undefined) {
      const margins = ensure(tblPr, "tblCellMar", TBLPR_ORDER);

      while (margins.firstChild) margins.removeChild(margins.firstChild);

      for (const side of ["top", "left", "bottom", "right"]) {
        attrs(append(margins, ownerOf(root).createElementNS(W, `w:${side}`)), {
          w: twipsMm(table.cellPaddingMm),
          type: "dxa",
        });
      }
    }

    if (table.borderWidthPt !== undefined || table.borderColor) {
      const borders = ensure(tblPr, "tblBorders", TBLPR_ORDER);

      while (borders.firstChild) borders.removeChild(borders.firstChild);
      box(borders, table.borderWidthPt ?? 0.5, table.borderColor ?? "", [
        "top",
        "left",
        "bottom",
        "right",
        "insideH",
        "insideV",
      ]);
    }

    if (table.shading) {
      attrs(ensure(tblPr, "shd", TBLPR_ORDER), {
        val: "clear",
        color: "auto",
        fill: hex(table.shading),
      });
    }
  }

  if (header) {
    let first = elementChildren(style).find(
      (el) =>
        el.localName === "tblStylePr" &&
        el.getAttributeNS(W, "type") === "firstRow",
    );

    if (!first) {
      first = attrs(ownerOf(root).createElementNS(W, "w:tblStylePr"), {
        type: "firstRow",
      });
      style.appendChild(first);
    }

    applyParagraph(ensure(first, "pPr", TBLSTYLEPR_ORDER), header);
    applyRun(ensure(first, "rPr", TBLSTYLEPR_ORDER), header);

    if (header.shading) {
      const tcPr = ensure(first, "tcPr", TBLSTYLEPR_ORDER);
      attrs(ensure(tcPr, "shd", TCPR_ORDER), {
        val: "clear",
        color: "auto",
        fill: hex(header.shading),
      });
    }
  }
}

function patchSection(doc: Document, design: StyleDesign): void {
  const body = doc.getElementsByTagNameNS(W, "body")[0];

  if (!body) throw new Error("DOCX reference has no document body");
  let sect = elementChildren(body).find((el) => el.localName === "sectPr");

  if (!sect) {
    sect = doc.createElementNS(W, "w:sectPr");
    body.appendChild(sect);
  }

  const keep = elementChildren(sect).filter(
    (el) => el.localName === "footnotePr" || el.localName === "endnotePr",
  );

  while (sect.firstChild) sect.removeChild(sect.firstChild);
  const footer = doc.createElementNS(W, "w:footerReference");
  footer.setAttributeNS(W, "w:type", "default");
  footer.setAttributeNS(R, "r:id", FOOTER_REL_ID);
  sect.appendChild(footer);

  for (const el of keep) sect.appendChild(el);
  const [width, height] = pageSizeMm(design.page);

  const size = attrs(append(sect, doc.createElementNS(W, "w:pgSz")), {
    w: twipsMm(width),
    h: twipsMm(height),
  });

  if (design.page.orientation === "landscape")
    attrs(size, { orient: "landscape" });
  const m = design.page.marginsMm;
  attrs(append(sect, doc.createElementNS(W, "w:pgMar")), {
    top: twipsMm(m.top),
    right: twipsMm(m.right),
    bottom: twipsMm(m.bottom),
    left: twipsMm(m.left),
    header: twipsMm(design.page.headerDistanceMm ?? 12.7),
    footer: twipsMm(design.page.footerDistanceMm ?? 12.7),
    gutter: "0",
  });
}

function footerXml(): string {
  const run = (inner: string) =>
    `<w:r><w:rPr><w:rStyle w:val="PageNumber"/></w:rPr>${inner}</w:r>`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:ftr xmlns:w="${W}" xmlns:r="${R}"><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr>` +
    run(`<w:fldChar w:fldCharType="begin"/>`) +
    run(`<w:instrText xml:space="preserve"> PAGE </w:instrText>`) +
    run(`<w:fldChar w:fldCharType="separate"/>`) +
    run(`<w:t>1</w:t>`) +
    run(`<w:fldChar w:fldCharType="end"/>`) +
    `</w:p></w:ftr>`
  );
}

function parse(entries: Record<string, Uint8Array>, path: string): Document {
  const data = entries[path];

  if (!data) throw new Error(`DOCX reference is missing ${path}`);

  return new DOMParser().parseFromString(strFromU8(data), "text/xml");
}

function serialize(doc: Document): Uint8Array {
  return strToU8(new XMLSerializer().serializeToString(doc));
}

function addPart(entries: Record<string, Uint8Array>) {
  entries["word/footer1.xml"] = strToU8(footerXml());
  const rels = parse(entries, "word/_rels/document.xml.rels");
  const relsRoot = rootOf(rels);

  const hasFooterRel = elementChildren(relsRoot).some(
    (el) => el.getAttribute("Id") === FOOTER_REL_ID,
  );

  if (!hasFooterRel) {
    const rel = rels.createElementNS(REL, "Relationship");
    rel.setAttribute("Id", FOOTER_REL_ID);
    rel.setAttribute("Type", `${R}/footer`);
    rel.setAttribute("Target", "footer1.xml");
    relsRoot.appendChild(rel);
    entries["word/_rels/document.xml.rels"] = serialize(rels);
  }

  const types = parse(entries, "[Content_Types].xml");
  const typesRoot = rootOf(types);

  const hasFooterType = elementChildren(typesRoot).some(
    (el) => el.getAttribute("PartName") === "/word/footer1.xml",
  );

  if (!hasFooterType) {
    const override = types.createElementNS(CT, "Override");
    override.setAttribute("PartName", "/word/footer1.xml");
    override.setAttribute(
      "ContentType",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml",
    );
    typesRoot.appendChild(override);
    entries["[Content_Types].xml"] = serialize(types);
  }
}

/**
 * In-memory patched reference DOCX bytes and non-fatal style translation
 * warnings.
 */
export interface BuiltReference {
  bytes: Uint8Array;
  warnings: string[];
}

/**
 * Apply a style design to a Pandoc-compatible reference DOCX (normally Pandoc's
 * own default, which already carries the footnote parts).
 */
export function buildDocxReference(
  design: StyleDesign,
  base: Uint8Array,
  explicit: ExplicitProps,
): BuiltReference {
  const warnings: string[] = [];
  const entries: Record<string, Uint8Array> = unzipSync(base);

  for (const required of [
    "word/footnotes.xml",
    "word/styles.xml",
    "word/document.xml",
  ]) {
    if (!entries[required]) {
      throw new Error(
        `DOCX reference lacks ${required}; it cannot carry real footnotes`,
      );
    }
  }

  const stylesDoc = parse(entries, "word/styles.xml");
  const root = rootOf(stylesDoc);

  for (const name of COMPONENT_NAMES) {
    const props = design.components[name];

    if (!props) continue;

    const reason = UNSUPPORTED[name];

    if (reason) {
      if (explicit.has(name))
        warnings.push(`docx: components.${name} is not applied; ${reason}`);
      continue;
    }

    for (const target of STYLE_MAP[name] ?? []) {
      const style =
        findStyle(root, target.id) ??
        (target.create ? createStyle(root, target) : undefined);

      if (!style) {
        if (explicit.has(name)) {
          warnings.push(
            `docx: components.${name} skipped; style ${target.id} is missing from the reference`,
          );
        }

        continue;
      }

      applyStyle(style, target, props);

      if (target.type === "character" && explicit.has(name)) {
        for (const key of PARAGRAPH_ONLY) {
          if (explicit.get(name)?.has(key)) {
            warnings.push(
              `docx: components.${name}.${key} is not applied; ${target.id} is a character style`,
            );
          }
        }
      }
    }
  }

  applyTable(root, design);

  // The footer needs a page-number run style and a footer style even when
  // unconfigured.
  for (const id of ["Footer", "PageNumber"]) {
    if (!findStyle(root, id)) {
      createStyle(root, {
        id,
        type: id === "Footer" ? "paragraph" : "character",
        create: {
          name: id === "Footer" ? "footer" : "page number",
          basedOn: id === "Footer" ? "Normal" : "DefaultParagraphFont",
        },
      });
    }
  }

  const footer = findStyle(root, "Footer");

  if (footer && !design.components.footer?.alignment) {
    applyParagraph(ensure(footer, "pPr", STYLE_ORDER), { alignment: "center" });
  }

  entries["word/styles.xml"] = serialize(stylesDoc);

  const docDoc = parse(entries, "word/document.xml");
  patchSection(docDoc, design);
  entries["word/document.xml"] = serialize(docDoc);
  addPart(entries);

  return { bytes: zipSync(entries), warnings };
}
