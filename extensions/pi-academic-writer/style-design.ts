import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { PACKAGE_ROOT } from "../lib/paths.js";

export type StyleFormat = "docx" | "odt" | "latex" | "pdf";
export type PdfEngine = "xelatex" | "tectonic";

export const STYLE_FORMATS: readonly StyleFormat[] = [
  "docx",
  "odt",
  "latex",
  "pdf",
];

export const COMPONENT_NAMES = [
  "title",
  "subtitle",
  "abstractHeading",
  "abstractBody",
  "body",
  "heading1",
  "heading2",
  "heading3",
  "heading4",
  "heading5",
  "heading6",
  "blockQuote",
  "footnoteReference",
  "footnoteText",
  "citation",
  "bibliography",
  "orderedList",
  "bulletList",
  "table",
  "tableHeader",
  "tableBody",
  "caption",
  "figure",
  "header",
  "footer",
  "pageNumber",
  "hyperlink",
  "code",
] as const;
export type ComponentName = (typeof COMPONENT_NAMES)[number];

export interface ComponentStyle {
  fontFamily?: string;
  fontSizePt?: number;
  lineSpacing?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  shading?: string;
  alignment?: "left" | "right" | "center" | "justify";
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  indentLeftMm?: number;
  indentRightMm?: number;
  firstLineIndentMm?: number;
  hangingIndentMm?: number;
  keepWithNext?: boolean;
  pageBreakBefore?: boolean;
  borderWidthPt?: number;
  borderColor?: string;
  cellPaddingMm?: number;
}

type PropKind =
  | "number"
  | "spacing"
  | "boolean"
  | "font"
  | "color"
  | "alignment";

const PROP_KINDS: Record<keyof ComponentStyle, PropKind> = {
  fontFamily: "font",
  fontSizePt: "number",
  lineSpacing: "spacing",
  bold: "boolean",
  italic: "boolean",
  underline: "boolean",
  color: "color",
  shading: "color",
  alignment: "alignment",
  spaceBeforePt: "number",
  spaceAfterPt: "number",
  indentLeftMm: "number",
  indentRightMm: "number",
  firstLineIndentMm: "number",
  hangingIndentMm: "number",
  keepWithNext: "boolean",
  pageBreakBefore: "boolean",
  borderWidthPt: "number",
  borderColor: "color",
  cellPaddingMm: "number",
};

export interface PageStyle {
  size: "A4" | "Letter" | "Legal";
  orientation: "portrait" | "landscape";
  marginsMm: { top: number; right: number; bottom: number; left: number };
  headerDistanceMm?: number;
  footerDistanceMm?: number;
}

/** File names (relative to the package) that replace generated native assets. */
export interface FormatConfig {
  docx?: { referenceDocument?: string };
  odt?: { referenceDocument?: string };
  latex?: { template?: string; preamble?: string };
  pdf?: { template?: string; preamble?: string; engine?: PdfEngine };
}

export interface StyleDesign {
  schemaVersion: 1;
  name: string;
  page: PageStyle;
  components: Partial<Record<ComponentName, ComponentStyle>>;
  formats: FormatConfig;
}

/** Absolute native asset paths declared by the package for one format. */
export interface NativeAssets {
  referenceDocument?: string;
  template?: string;
  preamble?: string;
  engine?: PdfEngine;
}

/** Component properties the researcher changed relative to the shipped starter. */
export type ExplicitProps = ReadonlyMap<
  ComponentName,
  ReadonlySet<keyof ComponentStyle>
>;

function changedProps(
  starter: StyleDesign["components"],
  own: StyleDesign["components"],
): ExplicitProps {
  const changed = new Map<ComponentName, ReadonlySet<keyof ComponentStyle>>();
  for (const [key, props] of Object.entries(own)) {
    const component = key as ComponentName;
    const base = starter[component] ?? {};
    const keys = (Object.keys(props) as (keyof ComponentStyle)[]).filter(
      (prop) => props[prop] !== base[prop],
    );
    if (keys.length) changed.set(component, new Set(keys));
  }
  return changed;
}

export interface LoadedStyle {
  design: StyleDesign;
  /** Real path of the package directory. */
  dir: string;
  native: Partial<Record<StyleFormat, NativeAssets>>;
  /** Per component, the properties the researcher set to something other than the starter's value. */
  explicit: ExplicitProps;
}

export const STARTER_DIR = join(
  PACKAGE_ROOT,
  "templates",
  "document-styles",
  "academic-default",
);

const PAGE_KEYS = [
  "size",
  "orientation",
  "marginsMm",
  "headerDistanceMm",
  "footerDistanceMm",
];
const SIDES = ["top", "right", "bottom", "left"] as const;

function fail(name: string, field: string, correction: string): never {
  throw new Error(`Style package '${name}', ${field}: ${correction}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function readJsonObject(path: string, name: string, label: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(
      name,
      label,
      `create a valid JSON design file (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  if (!isObject(parsed)) fail(name, label, "use a JSON object");
  return parsed;
}

function checkProp(
  name: string,
  field: string,
  kind: PropKind,
  value: unknown,
): void {
  const valid =
    kind === "number"
      ? isNonNegative(value)
      : kind === "spacing"
        ? typeof value === "number" &&
          Number.isFinite(value) &&
          value > 0 &&
          value <= 3
        : kind === "boolean"
          ? typeof value === "boolean"
          : kind === "font"
            ? typeof value === "string" && /^[\w .-]+$/.test(value)
            : kind === "color"
              ? typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value)
              : typeof value === "string" &&
                ["left", "right", "center", "justify"].includes(value);
  if (!valid) fail(name, field, `use a valid value for this ${kind} property`);
}

function validateComponents(
  name: string,
  raw: unknown,
): Partial<Record<ComponentName, ComponentStyle>> {
  if (!isObject(raw)) fail(name, "components", "use an object");
  const out: Partial<Record<ComponentName, ComponentStyle>> = {};
  for (const [key, props] of Object.entries(raw)) {
    if (!(COMPONENT_NAMES as readonly string[]).includes(key)) {
      fail(
        name,
        `components.${key}`,
        "use only the documented component names",
      );
    }
    if (!isObject(props)) fail(name, `components.${key}`, "use an object");
    for (const [prop, value] of Object.entries(props)) {
      const kind = (PROP_KINDS as Record<string, PropKind | undefined>)[prop];
      if (!kind) {
        fail(name, `components.${key}.${prop}`, "remove the unknown property");
      }
      checkProp(name, `components.${key}.${prop}`, kind, value);
    }
    // Every key and value was validated against PROP_KINDS above.
    out[key as ComponentName] = props as ComponentStyle;
  }
  return out;
}

function validatePage(name: string, raw: unknown): Partial<PageStyle> {
  if (!isObject(raw)) fail(name, "page", "use an object");
  for (const key of Object.keys(raw)) {
    if (!PAGE_KEYS.includes(key))
      fail(name, `page.${key}`, "remove unknown keys");
  }
  if (
    raw.size !== undefined &&
    !["A4", "Letter", "Legal"].includes(String(raw.size))
  ) {
    fail(name, "page.size", "use A4, Letter, or Legal");
  }
  if (
    raw.orientation !== undefined &&
    !["portrait", "landscape"].includes(String(raw.orientation))
  ) {
    fail(name, "page.orientation", "use portrait or landscape");
  }
  const margins = raw.marginsMm ?? {};
  if (!isObject(margins)) fail(name, "page.marginsMm", "use an object");
  for (const [side, value] of Object.entries(margins)) {
    if (!(SIDES as readonly string[]).includes(side) || !isNonNegative(value)) {
      fail(
        name,
        `page.marginsMm.${side}`,
        "use a non-negative finite number and a known side",
      );
    }
  }
  for (const key of ["headerDistanceMm", "footerDistanceMm"]) {
    if (raw[key] !== undefined && !isNonNegative(raw[key])) {
      fail(name, `page.${key}`, "use a non-negative finite millimeter value");
    }
  }
  // Keys and value types were validated above.
  return raw as Partial<PageStyle>;
}

/** Resolve a relative asset inside the package; reject traversal and symlink escape. */
function resolveAsset(
  dir: string,
  name: string,
  field: string,
  value: unknown,
  suffix: string,
): string {
  if (
    typeof value !== "string" ||
    isAbsolute(value) ||
    value.split(/[\\/]/).includes("..") ||
    !value.endsWith(suffix)
  ) {
    fail(name, field, `use a relative ${suffix} file inside the package`);
  }
  const path = resolve(dir, value);
  let real: string;
  try {
    real = realpathSync(path);
    if (!statSync(real).isFile()) throw new Error("not a file");
  } catch {
    fail(name, field, "create the referenced file inside the package");
  }
  if (relative(dir, real).startsWith("..")) {
    fail(name, field, "the referenced file must stay inside the package");
  }
  return real;
}

function validateFormats(
  name: string,
  dir: string,
  raw: unknown,
  formats: ReadonlySet<StyleFormat>,
): Partial<Record<StyleFormat, NativeAssets>> {
  if (!isObject(raw)) fail(name, "formats", "use an object");
  for (const key of Object.keys(raw)) {
    if (!(STYLE_FORMATS as readonly string[]).includes(key)) {
      fail(name, "formats", "use only docx, odt, latex, and pdf");
    }
  }
  const options: Record<StyleFormat, Record<string, string | null>> = {
    docx: { referenceDocument: ".docx" },
    odt: { referenceDocument: ".odt" },
    latex: { template: ".tex", preamble: ".tex" },
    pdf: { template: ".tex", preamble: ".tex", engine: null },
  };
  const out: Partial<Record<StyleFormat, NativeAssets>> = {};
  const wanted = new Set(formats);
  if (wanted.has("pdf")) wanted.add("latex");
  for (const format of wanted) {
    const cfg = raw[format] ?? {};
    if (!isObject(cfg)) fail(name, `formats.${format}`, "use an object");
    for (const key of Object.keys(cfg)) {
      if (!(key in options[format])) {
        fail(name, `formats.${format}`, `remove unknown key '${key}'`);
      }
    }
    const assets: NativeAssets = {};
    for (const [key, suffix] of Object.entries(options[format])) {
      const value = cfg[key];
      if (value === undefined) continue;
      const field = `formats.${format}.${key}`;
      if (key === "engine") {
        if (value !== "xelatex" && value !== "tectonic") {
          fail(name, field, "use xelatex or tectonic");
        }
        assets.engine = value;
      } else if (suffix) {
        const path = resolveAsset(dir, name, field, value, suffix);
        if (key === "referenceDocument") assets.referenceDocument = path;
        else if (key === "template") assets.template = path;
        else assets.preamble = path;
      }
    }
    out[format] = assets;
  }
  // PDF inherits LaTeX template/preamble unless it declares its own.
  if (out.pdf && out.latex) {
    out.pdf = {
      template: out.latex.template,
      preamble: out.latex.preamble,
      ...Object.fromEntries(
        Object.entries(out.pdf).filter(([, v]) => v !== undefined),
      ),
    };
  }
  return out;
}

/** Load the shipped starter design, which supplies defaults for every package. */
export function loadStarterDesign(): StyleDesign {
  const raw = readJsonObject(
    join(STARTER_DIR, "design.json"),
    "academic-default",
    "starter design.json",
  );
  const page = validatePage("academic-default", raw.page);
  return {
    schemaVersion: 1,
    name: "academic-default",
    page: {
      size: page.size ?? "A4",
      orientation: page.orientation ?? "portrait",
      marginsMm: {
        top: 25.4,
        right: 25.4,
        bottom: 25.4,
        left: 25.4,
        ...page.marginsMm,
      },
      headerDistanceMm: page.headerDistanceMm,
      footerDistanceMm: page.footerDistanceMm,
    },
    components: validateComponents("academic-default", raw.components ?? {}),
    formats: {},
  };
}

/**
 * Validate `.academic-writer/styles/<name>/design.json` for the requested
 * formats and merge omitted properties from the shipped starter.
 */
export function loadStylePackage(
  projectRoot: string,
  name: string,
  formats: Iterable<StyleFormat>,
): LoadedStyle {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    fail(name, "name", "use lowercase letters, digits, and hyphens");
  }
  const stylesRoot = resolve(projectRoot, ".academic-writer", "styles");
  let dir: string;
  try {
    dir = realpathSync(join(stylesRoot, name));
    if (relative(realpathSync(stylesRoot), dir).startsWith("..")) {
      fail(
        name,
        "name",
        "package path must remain inside .academic-writer/styles",
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Style package")) {
      throw error;
    }
    return fail(
      name,
      "package",
      "create .academic-writer/styles/<name>/design.json",
    );
  }
  const raw = readJsonObject(join(dir, "design.json"), name, "design.json");
  const allowed = ["schemaVersion", "name", "page", "components", "formats"];
  if (
    Object.keys(raw).some((key) => !allowed.includes(key)) ||
    raw.schemaVersion !== 1 ||
    raw.name !== name
  ) {
    fail(
      name,
      "design.json",
      "use schemaVersion: 1, a matching name, and only page, components, and formats",
    );
  }
  const starter = loadStarterDesign();
  const page = validatePage(name, raw.page ?? {});
  const own = validateComponents(name, raw.components ?? {});
  const components: StyleDesign["components"] = { ...starter.components };
  for (const [key, props] of Object.entries(own)) {
    const component = key as ComponentName;
    components[component] = { ...components[component], ...props };
  }
  const native = validateFormats(
    name,
    dir,
    raw.formats ?? {},
    new Set(formats),
  );
  return {
    dir,
    native,
    explicit: changedProps(starter.components, own),
    design: {
      schemaVersion: 1,
      name,
      page: {
        size: page.size ?? starter.page.size,
        orientation: page.orientation ?? starter.page.orientation,
        marginsMm: { ...starter.page.marginsMm, ...page.marginsMm },
        headerDistanceMm:
          page.headerDistanceMm ?? starter.page.headerDistanceMm,
        footerDistanceMm:
          page.footerDistanceMm ?? starter.page.footerDistanceMm,
      },
      components,
      formats: (raw.formats ?? {}) as FormatConfig,
    },
  };
}

export const PAGE_DIMENSIONS_MM: Record<PageStyle["size"], [number, number]> = {
  A4: [210, 297],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};

/** Page width and height in millimeters after applying orientation. */
export function pageSizeMm(page: PageStyle): [number, number] {
  const [width, height] = PAGE_DIMENSIONS_MM[page.size];
  return page.orientation === "landscape" ? [height, width] : [width, height];
}
