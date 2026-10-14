import type { ExplicitProps } from "./style-design.js";
import type { BuiltReference } from "./style-docx.js";
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
import { elementsByTagNameNS, isElement, ownerOf } from "./xml.js";

const NS = {
  office: "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
  style: "urn:oasis:names:tc:opendocument:xmlns:style:1.0",
  fo: "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0",
} as const;

interface OdtTarget {
  name: string;
  /**
   * Text styles take run properties only.
   */
  family: "paragraph" | "text";
  /**
   * Created when the reference document does not define it.
   */
  create?: string;
}

const STYLE_MAP: Partial<Record<ComponentName, OdtTarget[]>> = {
  title: [{ name: "Title", family: "paragraph" }],
  subtitle: [{ name: "Subtitle", family: "paragraph" }],
  abstractBody: [{ name: "Abstract", family: "paragraph" }],
  body: [{ name: "Text_20_body", family: "paragraph" }],
  heading1: [{ name: "Heading_20_1", family: "paragraph" }],
  heading2: [{ name: "Heading_20_2", family: "paragraph" }],
  heading3: [{ name: "Heading_20_3", family: "paragraph" }],
  heading4: [{ name: "Heading_20_4", family: "paragraph" }],
  heading5: [{ name: "Heading_20_5", family: "paragraph" }],
  heading6: [{ name: "Heading_20_6", family: "paragraph" }],
  blockQuote: [{ name: "Quotations", family: "paragraph" }],
  footnoteReference: [
    { name: "Footnote_20_Symbol", family: "text" },
    { name: "Footnote_20_anchor", family: "text" },
  ],
  footnoteText: [{ name: "Footnote", family: "paragraph" }],
  orderedList: [
    { name: "List_20_Number", family: "paragraph" },
    { name: "List_20_Number_20_Tight", family: "paragraph" },
  ],
  bulletList: [
    { name: "List_20_Bullet", family: "paragraph" },
    { name: "List_20_Bullet_20_Tight", family: "paragraph" },
  ],
  tableHeader: [{ name: "Table_20_Heading", family: "paragraph" }],
  tableBody: [{ name: "Table_20_Contents", family: "paragraph" }],
  caption: [
    { name: "Caption", family: "paragraph" },
    { name: "TableCaption", family: "paragraph" },
    { name: "FigureCaption", family: "paragraph" },
  ],
  figure: [
    { name: "Figure", family: "paragraph" },
    { name: "FigureWithCaption", family: "paragraph" },
  ],
  header: [{ name: "Header", family: "paragraph", create: "Standard" }],
  footer: [
    { name: "Footer", family: "paragraph" },
    { name: "MP1", family: "paragraph" },
  ],
  pageNumber: [{ name: "MP1", family: "text" }],
  hyperlink: [{ name: "Internet_20_link", family: "text" }],
  code: [
    { name: "Source_20_Text", family: "text" },
    { name: "Preformatted_20_Text", family: "paragraph" },
  ],
};

const UNSUPPORTED: Partial<Record<ComponentName, string>> = {
  abstractHeading:
    "Pandoc's ODT writer emits no separate abstract heading style",
  citation: "Pandoc emits citations as plain text with no style to attach to",
  bibliography: "Pandoc writes bibliography entries with the body text style",
  table:
    "Pandoc writes table cell borders and padding as inline automatic styles",
};

const TEXT_ONLY_IGNORED: (keyof ComponentStyle)[] = [
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

const mm = (value: number) => `${+value.toFixed(3)}mm`;

const pt = (value: number) => `${+value.toFixed(3)}pt`;

function childByName(
  parent: Element,
  ns: string,
  local: string,
): Element | undefined {
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (isElement(node) && node.localName === local && node.namespaceURI === ns)
      return node;
  }

  return undefined;
}

/**
 * Return `style:<local>`, keeping paragraph-properties ahead of
 * text-properties.
 */
function ensureProps(
  style: Element,
  local: "paragraph-properties" | "text-properties",
): Element {
  const existing = childByName(style, NS.style, local);

  if (existing) return existing;
  const created = ownerOf(style).createElementNS(NS.style, `style:${local}`);
  const text = childByName(style, NS.style, "text-properties");

  if (local === "paragraph-properties" && text)
    style.insertBefore(created, text);
  else style.appendChild(created);

  return created;
}

function set(el: Element, qname: string, value: string): void {
  const [prefix = ""] = qname.split(":");
  const namespace = new Map<string, string>(Object.entries(NS)).get(prefix);

  if (!namespace) throw new Error(`Unknown ODT namespace prefix: ${qname}`);

  el.setAttributeNS(namespace, qname, value);
}

function applyParagraph(style: Element, props: ComponentStyle): void {
  const pp = ensureProps(style, "paragraph-properties");

  if (props.alignment) {
    const align = {
      left: "start",
      right: "end",
      center: "center",
      justify: "justify",
    }[props.alignment];

    set(pp, "fo:text-align", align);
  }

  if (props.lineSpacing !== undefined)
    set(pp, "fo:line-height", `${+(props.lineSpacing * 100).toFixed(1)}%`);

  if (props.spaceBeforePt !== undefined)
    set(pp, "fo:margin-top", pt(props.spaceBeforePt));

  if (props.spaceAfterPt !== undefined)
    set(pp, "fo:margin-bottom", pt(props.spaceAfterPt));

  if (props.indentLeftMm !== undefined)
    set(pp, "fo:margin-left", mm(props.indentLeftMm));

  if (props.indentRightMm !== undefined)
    set(pp, "fo:margin-right", mm(props.indentRightMm));

  if (props.firstLineIndentMm !== undefined)
    set(pp, "fo:text-indent", mm(props.firstLineIndentMm));
  else if (props.hangingIndentMm !== undefined)
    set(pp, "fo:text-indent", mm(-props.hangingIndentMm));

  if (props.keepWithNext !== undefined)
    set(pp, "fo:keep-with-next", props.keepWithNext ? "always" : "auto");

  if (props.pageBreakBefore !== undefined)
    set(pp, "fo:break-before", props.pageBreakBefore ? "page" : "auto");

  if (props.borderWidthPt !== undefined || props.borderColor) {
    set(
      pp,
      "fo:border",
      `${pt(props.borderWidthPt ?? 0.5)} solid ${props.borderColor ?? "#000000"}`,
    );
  }

  if (props.shading) set(pp, "fo:background-color", props.shading);
}

function applyText(style: Element, props: ComponentStyle): void {
  const tp = ensureProps(style, "text-properties");

  if (props.fontFamily) {
    for (const stale of [
      "style:font-name",
      "style:font-name-complex",
      "style:font-name-asian",
    ]) {
      tp.removeAttribute(stale);
    }

    set(tp, "fo:font-family", props.fontFamily);
    set(tp, "style:font-family-complex", props.fontFamily);
    set(tp, "style:font-family-asian", props.fontFamily);
  }

  if (props.fontSizePt !== undefined) {
    for (const name of [
      "fo:font-size",
      "style:font-size-complex",
      "style:font-size-asian",
    ]) {
      set(tp, name, pt(props.fontSizePt));
    }
  }

  if (props.bold !== undefined) {
    const weight = props.bold ? "bold" : "normal";

    for (const name of [
      "fo:font-weight",
      "style:font-weight-complex",
      "style:font-weight-asian",
    ]) {
      set(tp, name, weight);
    }
  }

  if (props.italic !== undefined) {
    const italic = props.italic ? "italic" : "normal";

    for (const name of [
      "fo:font-style",
      "style:font-style-complex",
      "style:font-style-asian",
    ]) {
      set(tp, name, italic);
    }
  }

  if (props.color) set(tp, "fo:color", props.color);

  if (props.underline !== undefined) {
    set(tp, "style:text-underline-style", props.underline ? "solid" : "none");

    if (props.underline) {
      set(tp, "style:text-underline-width", "auto");
      set(tp, "style:text-underline-color", "font-color");
    }
  }
}

function findStyle(doc: Document, name: string): Element | undefined {
  return elementsByTagNameNS(doc, NS.style, "style").find(
    (style) => style.getAttributeNS(NS.style, "name") === name,
  );
}

function patchPage(doc: Document, design: StyleDesign): void {
  const master = doc.getElementsByTagNameNS(NS.style, "master-page")[0];
  const layoutName = master?.getAttributeNS(NS.style, "page-layout-name");

  const layout = elementsByTagNameNS(doc, NS.style, "page-layout")
    .filter(
      (candidate) => candidate.getAttributeNS(NS.style, "name") === layoutName,
    )
    .at(-1);

  const props =
    layout && childByName(layout, NS.style, "page-layout-properties");

  if (!layout || !props)
    throw new Error("ODT reference has no page layout to configure");
  const [width, height] = pageSizeMm(design.page);
  const m = design.page.marginsMm;
  set(props, "fo:page-width", mm(width));
  set(props, "fo:page-height", mm(height));
  set(props, "style:print-orientation", design.page.orientation);
  set(props, "fo:margin-top", mm(m.top));
  set(props, "fo:margin-left", mm(m.left));
  set(props, "fo:margin-right", mm(m.right));
  // Word measures the footer from the page edge; ODF puts it inside the bottom
  // margin.
  const footerDistance = design.page.footerDistanceMm;
  const footerStyle = childByName(layout, NS.style, "footer-style");

  const footerProps =
    footerStyle &&
    childByName(footerStyle, NS.style, "header-footer-properties");

  if (
    footerDistance !== undefined &&
    footerProps &&
    footerDistance < m.bottom
  ) {
    set(props, "fo:margin-bottom", mm(footerDistance));
    set(footerProps, "fo:min-height", mm(m.bottom - footerDistance));
    set(footerProps, "fo:margin-top", mm(0));
  } else {
    set(props, "fo:margin-bottom", mm(m.bottom));
  }
}

/**
 * Applies a style design to a Pandoc-compatible reference ODT.
 *
 * @param design - Design specification to apply.
 * @param base - Base reference ODT binary bytes.
 * @param explicit - Set of explicitly overridden styling properties.
 *
 * @returns Patched reference ODT bytes and warning list.
 * @throws When the base ODT archive lacks required XML parts.
 */
export function buildOdtReference(
  design: StyleDesign,
  base: Uint8Array,
  explicit: ExplicitProps,
): BuiltReference {
  const warnings: string[] = [];
  const entries: Record<string, Uint8Array> = unzipSync(base);
  const stylesXml = entries["styles.xml"];

  if (!stylesXml) throw new Error("ODT reference is missing styles.xml");
  const doc = new DOMParser().parseFromString(strFromU8(stylesXml), "text/xml");
  const officeStyles = doc.getElementsByTagNameNS(NS.office, "styles")[0];

  if (!officeStyles)
    throw new Error("ODT reference has no office:styles section");

  for (const name of COMPONENT_NAMES) {
    const props = design.components[name];

    if (!props) continue;

    const reason = UNSUPPORTED[name];

    if (reason) {
      if (explicit.has(name))
        warnings.push(`odt: components.${name} is not applied; ${reason}`);
      continue;
    }

    for (const target of STYLE_MAP[name] ?? []) {
      let style = findStyle(doc, target.name);

      if (!style && target.create) {
        style = doc.createElementNS(NS.style, "style:style");
        set(style, "style:name", target.name);
        set(style, "style:family", target.family);
        set(style, "style:parent-style-name", target.create);
        officeStyles.appendChild(style);
      }

      if (!style) {
        if (explicit.has(name)) {
          warnings.push(
            `odt: components.${name} skipped; style ${target.name} is missing from the reference`,
          );
        }

        continue;
      }

      if (target.family === "paragraph") applyParagraph(style, props);
      applyText(style, props);

      if (target.family === "text" && explicit.has(name)) {
        for (const key of TEXT_ONLY_IGNORED) {
          if (explicit.get(name)?.has(key)) {
            warnings.push(
              `odt: components.${name}.${key} is not applied; ${target.name} is a text style`,
            );
          }
        }
      }
    }
  }

  patchPage(doc, design);
  entries["styles.xml"] = strToU8(new XMLSerializer().serializeToString(doc));
  // ODF requires the mimetype entry first and stored uncompressed.
  const ordered: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};

  if (entries.mimetype) ordered.mimetype = [entries.mimetype, { level: 0 }];

  for (const [path, data] of Object.entries(entries)) {
    if (path !== "mimetype") ordered[path] = [data, { level: 6 }];
  }

  return { bytes: zipSync(ordered), warnings };
}
