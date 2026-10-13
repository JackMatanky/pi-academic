import type { SchemaViolation } from "../lib/schema.js";
import type { JsonObject, JsonValue } from "../lib/schema.js";
import type { Static } from "typebox";

import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import { Type } from "typebox";

import { errorMessage, isInside } from "../lib/fs-safe.js";
import { PACKAGE_ROOT } from "../lib/paths.js";
import {
  assertValid,
  firstViolation,
  isValid,
  JsonObjectSchema,
  parseJsonText,
} from "../lib/schema.js";

export type StyleFormat = "docx" | "odt" | "latex" | "pdf";

export type PdfEngine = "xelatex" | "tectonic";

export const STYLE_FORMATS: readonly StyleFormat[] = [
  "docx",
  "odt",
  "latex",
  "pdf",
];

const NonNegative = Type.Number({ minimum: 0 });

const Alignment = Type.Union([
  Type.Literal("left"),
  Type.Literal("right"),
  Type.Literal("center"),
  Type.Literal("justify"),
]);

/**
 * Properties a component may set; each value is checked by its kind.
 */
const ComponentStyleSchema = Type.Object(
  {
    fontFamily: Type.Optional(
      Type.String({ pattern: "^[\\p{L}\\p{N}_ .-]+$" }),
    ),
    fontSizePt: Type.Optional(NonNegative),
    lineSpacing: Type.Optional(
      Type.Number({ exclusiveMinimum: 0, maximum: 3 }),
    ),
    bold: Type.Optional(Type.Boolean()),
    italic: Type.Optional(Type.Boolean()),
    underline: Type.Optional(Type.Boolean()),
    color: Type.Optional(Type.String({ pattern: "^#[0-9A-Fa-f]{6}$" })),
    shading: Type.Optional(Type.String({ pattern: "^#[0-9A-Fa-f]{6}$" })),
    alignment: Type.Optional(Alignment),
    spaceBeforePt: Type.Optional(NonNegative),
    spaceAfterPt: Type.Optional(NonNegative),
    indentLeftMm: Type.Optional(NonNegative),
    indentRightMm: Type.Optional(NonNegative),
    firstLineIndentMm: Type.Optional(NonNegative),
    hangingIndentMm: Type.Optional(NonNegative),
    keepWithNext: Type.Optional(Type.Boolean()),
    pageBreakBefore: Type.Optional(Type.Boolean()),
    borderWidthPt: Type.Optional(NonNegative),
    borderColor: Type.Optional(Type.String({ pattern: "^#[0-9A-Fa-f]{6}$" })),
    cellPaddingMm: Type.Optional(NonNegative),
  },
  { additionalProperties: false },
);

/**
 * One component's style properties.
 */
export type ComponentStyle = Static<typeof ComponentStyleSchema>;

const ComponentsSchema = Type.Object(
  {
    title: Type.Optional(ComponentStyleSchema),
    subtitle: Type.Optional(ComponentStyleSchema),
    abstractHeading: Type.Optional(ComponentStyleSchema),
    abstractBody: Type.Optional(ComponentStyleSchema),
    body: Type.Optional(ComponentStyleSchema),
    heading1: Type.Optional(ComponentStyleSchema),
    heading2: Type.Optional(ComponentStyleSchema),
    heading3: Type.Optional(ComponentStyleSchema),
    heading4: Type.Optional(ComponentStyleSchema),
    heading5: Type.Optional(ComponentStyleSchema),
    heading6: Type.Optional(ComponentStyleSchema),
    blockQuote: Type.Optional(ComponentStyleSchema),
    footnoteReference: Type.Optional(ComponentStyleSchema),
    footnoteText: Type.Optional(ComponentStyleSchema),
    citation: Type.Optional(ComponentStyleSchema),
    bibliography: Type.Optional(ComponentStyleSchema),
    orderedList: Type.Optional(ComponentStyleSchema),
    bulletList: Type.Optional(ComponentStyleSchema),
    table: Type.Optional(ComponentStyleSchema),
    tableHeader: Type.Optional(ComponentStyleSchema),
    tableBody: Type.Optional(ComponentStyleSchema),
    caption: Type.Optional(ComponentStyleSchema),
    figure: Type.Optional(ComponentStyleSchema),
    header: Type.Optional(ComponentStyleSchema),
    footer: Type.Optional(ComponentStyleSchema),
    pageNumber: Type.Optional(ComponentStyleSchema),
    hyperlink: Type.Optional(ComponentStyleSchema),
    code: Type.Optional(ComponentStyleSchema),
  },
  { additionalProperties: false },
);

/**
 * Style properties by component.
 */
export type ComponentStyles = Static<typeof ComponentsSchema>;

/**
 * A component of the document that a style package can style.
 */
export type ComponentName = keyof ComponentStyles;

/**
 * Every styleable component, in document order.
 */
export const COMPONENT_NAMES: readonly ComponentName[] = [
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
];

/**
 * What kind of value each component property takes, for error messages.
 */
const PROP_KINDS = new Map<string, string>([
  ["fontFamily", "font"],
  ["lineSpacing", "spacing"],
  ["bold", "boolean"],
  ["italic", "boolean"],
  ["underline", "boolean"],
  ["color", "color"],
  ["shading", "color"],
  ["alignment", "alignment"],
  ["keepWithNext", "boolean"],
  ["pageBreakBefore", "boolean"],
  ["borderColor", "color"],
]);

const PageSchema = Type.Object(
  {
    size: Type.Optional(
      Type.Union([
        Type.Literal("A4"),
        Type.Literal("Letter"),
        Type.Literal("Legal"),
      ]),
    ),
    orientation: Type.Optional(
      Type.Union([Type.Literal("portrait"), Type.Literal("landscape")]),
    ),
    marginsMm: Type.Optional(
      Type.Object(
        {
          top: Type.Optional(NonNegative),
          right: Type.Optional(NonNegative),
          bottom: Type.Optional(NonNegative),
          left: Type.Optional(NonNegative),
        },
        { additionalProperties: false },
      ),
    ),
    headerDistanceMm: Type.Optional(NonNegative),
    footerDistanceMm: Type.Optional(NonNegative),
  },
  { additionalProperties: false },
);

type PageInput = Static<typeof PageSchema>;

export interface PageStyle {
  size: "A4" | "Letter" | "Legal";
  orientation: "portrait" | "landscape";
  marginsMm: { top: number; right: number; bottom: number; left: number };
  headerDistanceMm?: number;
  footerDistanceMm?: number;
}

/**
 * A style package's design: page setup and per-component style.
 */
export interface StyleDesign {
  schemaVersion: 1;
  name: string;
  page: PageStyle;
  components: ComponentStyles;
}

/**
 * Absolute native asset paths declared by the package for one format.
 */
export interface NativeAssets {
  referenceDocument?: string;
  template?: string;
  preamble?: string;
  engine?: PdfEngine;
}

/**
 * Component properties the researcher changed relative to the shipped starter.
 */
export type ExplicitProps = ReadonlyMap<ComponentName, ReadonlySet<string>>;

function changedProps(
  starter: ComponentStyles,
  own: ComponentStyles,
): ExplicitProps {
  const changed = new Map<ComponentName, ReadonlySet<string>>();

  for (const component of COMPONENT_NAMES) {
    const props = own[component];

    if (!props) continue;

    const base = new Map(Object.entries(starter[component] ?? {}));

    const keys = Object.entries(props)
      .filter(([key, value]) => base.get(key) !== value)
      .map(([key]) => key);

    if (keys.length > 0) changed.set(component, new Set(keys));
  }

  return changed;
}

export interface LoadedStyle {
  design: StyleDesign;
  /**
   * Real path of the package directory.
   */
  dir: string;
  native: Partial<Record<StyleFormat, NativeAssets>>;
  /**
   * Per component, the properties the researcher set to something other than
   * the starter's value.
   */
  explicit: ExplicitProps;
}

export const STARTER_DIR = join(PACKAGE_ROOT, "templates", "academic-default");

function fail(name: string, field: string, correction: string): never {
  throw new Error(`Style package '${name}', ${field}: ${correction}`);
}

/**
 * Reads `design.json` as a JSON object.
 */
function readDesignJson(path: string, name: string, label: string): JsonObject {
  let parsed: JsonValue;

  try {
    parsed = parseJsonText(readFileSync(path, "utf8"));
  } catch (cause) {
    return fail(
      name,
      label,
      `create a valid JSON design file (${errorMessage(cause)})`,
    );
  }

  if (!isValid(JsonObjectSchema, parsed))
    return fail(name, label, "use a JSON object");

  return parsed;
}

/**
 * A design field and what to change about it.
 */
interface Correction {
  field: string;
  correction: string;
}

/**
 * Turns a schema violation into the field path and correction a researcher can
 * act on.
 */
function describeViolation(
  violation: SchemaViolation,
  section: "page" | "components",
): Correction {
  const path = [section, ...violation.path.filter(Boolean)];
  const field = path.join(".");
  const unexpected = violation.unexpectedKeys[0] ?? "";

  if (violation.keyword === "additionalProperties") {
    if (section === "components" && path.length === 1)
      return {
        field: `components.${unexpected}`,
        correction: "use only the documented component names",
      };

    if (section === "components")
      return {
        field: `${field}.${unexpected}`,
        correction: "remove the unknown property",
      };

    if (path[1] === "marginsMm")
      return {
        field: `page.marginsMm.${unexpected}`,
        correction: "use a non-negative finite number and a known side",
      };

    return { field: `page.${unexpected}`, correction: "remove unknown keys" };
  }

  if (violation.keyword === "type" && violation.message === "must be object")
    return { field, correction: "use an object" };

  if (section === "components") {
    const kind = PROP_KINDS.get(path[2] ?? "") ?? "number";

    return {
      field,
      correction: `use a valid value for this ${kind} property`,
    };
  }

  switch (path[1]) {
    case "size":
      return { field, correction: "use A4, Letter, or Legal" };
    case "orientation":
      return { field, correction: "use portrait or landscape" };
    case "marginsMm":
      return {
        field,
        correction: "use a non-negative finite number and a known side",
      };
    default:
      return {
        field,
        correction: "use a non-negative finite millimeter value",
      };
  }
}

/**
 * Checks the `page` section of a design.
 */
function validatePage(name: string, raw: JsonValue | undefined): PageInput {
  const page = raw ?? {};
  const violation = firstViolation(PageSchema, page);

  if (violation) {
    const { field, correction } = describeViolation(violation, "page");

    return fail(name, field, correction);
  }

  assertValid(PageSchema, page, "page");

  return page;
}

/**
 * Checks the `components` section of a design.
 */
function validateComponents(
  name: string,
  raw: JsonValue | undefined,
): ComponentStyles {
  const components = raw ?? {};
  const violation = firstViolation(ComponentsSchema, components);

  if (violation) {
    const { field, correction } = describeViolation(violation, "components");

    return fail(name, field, correction);
  }

  assertValid(ComponentsSchema, components, "components");

  return components;
}

const StringSchema = Type.String();

/**
 * Resolve a relative asset inside the package; reject traversal and symlink
 * escape.
 */
function resolveAsset(
  dir: string,
  name: string,
  field: string,
  value: JsonValue,
  suffix: string,
): string {
  if (
    !isValid(StringSchema, value) ||
    isAbsolute(value) ||
    value.split(/[\\/]/).includes("..") ||
    !value.endsWith(suffix)
  ) {
    return fail(
      name,
      field,
      `use a relative ${suffix} file inside the package`,
    );
  }

  const path = resolve(dir, value);
  let real: string;

  try {
    real = realpathSync(path);

    if (!statSync(real).isFile()) throw new Error("not a file");
  } catch {
    return fail(name, field, "create the referenced file inside the package");
  }

  if (!isInside(dir, real)) {
    return fail(
      name,
      field,
      "the referenced file must stay inside the package",
    );
  }

  return real;
}

/**
 * The native asset keys each format accepts, with the suffix each file needs.
 */
const FORMAT_OPTIONS: Record<StyleFormat, Record<string, string | null>> = {
  docx: { referenceDocument: ".docx" },
  odt: { referenceDocument: ".odt" },
  latex: { template: ".tex", preamble: ".tex" },
  pdf: { template: ".tex", preamble: ".tex", engine: null },
};

function validateFormats(
  name: string,
  dir: string,
  raw: JsonValue | undefined,
  formats: ReadonlySet<StyleFormat>,
): Partial<Record<StyleFormat, NativeAssets>> {
  const configured = raw ?? {};

  if (!isValid(JsonObjectSchema, configured))
    return fail(name, "formats", "use an object");

  for (const key of Object.keys(configured)) {
    if (!STYLE_FORMATS.some((format) => format === key)) {
      return fail(name, "formats", "use only docx, odt, latex, and pdf");
    }
  }

  const out: Partial<Record<StyleFormat, NativeAssets>> = {};
  const wanted = new Set(formats);

  if (wanted.has("pdf")) wanted.add("latex");

  for (const format of wanted) {
    const cfg = configured[format] ?? {};

    if (!isValid(JsonObjectSchema, cfg))
      return fail(name, `formats.${format}`, "use an object");

    for (const key of Object.keys(cfg)) {
      if (!(key in FORMAT_OPTIONS[format])) {
        return fail(name, `formats.${format}`, `remove unknown key '${key}'`);
      }
    }

    const assets: NativeAssets = {};

    for (const [key, suffix] of Object.entries(FORMAT_OPTIONS[format])) {
      const value = cfg[key];

      if (value === undefined) continue;
      const field = `formats.${format}.${key}`;

      if (key === "engine") {
        if (value !== "xelatex" && value !== "tectonic") {
          return fail(name, field, "use xelatex or tectonic");
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
    const inherited: NativeAssets = {};

    if (out.latex.template) inherited.template = out.latex.template;

    if (out.latex.preamble) inherited.preamble = out.latex.preamble;
    out.pdf = { ...inherited, ...out.pdf };
  }

  return out;
}

/**
 * The page of a package merged over the starter's.
 */
function mergePage(page: PageInput, base: PageStyle): PageStyle {
  const merged: PageStyle = {
    size: page.size ?? base.size,
    orientation: page.orientation ?? base.orientation,
    marginsMm: { ...base.marginsMm, ...page.marginsMm },
  };

  const header = page.headerDistanceMm ?? base.headerDistanceMm;
  const footer = page.footerDistanceMm ?? base.footerDistanceMm;

  if (header !== undefined) merged.headerDistanceMm = header;

  if (footer !== undefined) merged.footerDistanceMm = footer;

  return merged;
}

/**
 * Load the shipped starter design, which supplies defaults for every package.
 */
export function loadStarterDesign(): StyleDesign {
  const raw = readDesignJson(
    join(STARTER_DIR, "design.json"),
    "academic-default",
    "starter design.json",
  );

  return {
    schemaVersion: 1,
    name: "academic-default",
    page: mergePage(validatePage("academic-default", raw.page), {
      size: "A4",
      orientation: "portrait",
      marginsMm: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
    }),
    components: validateComponents("academic-default", raw.components),
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

    if (!isInside(realpathSync(stylesRoot), dir)) {
      fail(
        name,
        "name",
        "package path must remain inside .academic-writer/styles",
      );
    }
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith("Style package")) {
      throw cause;
    }

    return fail(
      name,
      "package",
      "create .academic-writer/styles/<name>/design.json",
    );
  }

  const raw = readDesignJson(join(dir, "design.json"), name, "design.json");
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
  const page = validatePage(name, raw.page);
  const own = validateComponents(name, raw.components);
  const components: ComponentStyles = { ...starter.components };

  for (const component of COMPONENT_NAMES) {
    const props = own[component];

    if (props) components[component] = { ...components[component], ...props };
  }

  const native = validateFormats(name, dir, raw.formats, new Set(formats));

  return {
    dir,
    native,
    explicit: changedProps(starter.components, own),
    design: {
      schemaVersion: 1,
      name,
      page: mergePage(page, starter.page),
      components,
    },
  };
}

export const PAGE_DIMENSIONS_MM: Record<PageStyle["size"], [number, number]> = {
  A4: [210, 297],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};

/**
 * Page width and height in millimeters after applying orientation.
 */
export function pageSizeMm(page: PageStyle): [number, number] {
  const [width, height] = PAGE_DIMENSIONS_MM[page.size];

  return page.orientation === "landscape" ? [height, width] : [width, height];
}
