import type { Static } from "typebox";

import { existsSync } from "node:fs";
import { basename, join } from "node:path";

import { Type } from "typebox";

import { writeFileAtomic } from "../lib/fs-safe.js";
import { JsonValueSchema, readJsonFile } from "../lib/schema.js";

/**
 * A string with at least one non-whitespace character.
 */
const NonBlank = Type.String({ pattern: "\\S" });

const ISO_DATE_TIME =
  "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$";

/**
 * Evidence kinds a research note can have.
 */
export const NOTE_KINDS = [
  "quotation",
  "paraphrase",
  "summary",
  "analysis",
  "question",
  "idea",
] as const;

/**
 * Note kinds that may be cited as outline evidence.
 */
export const CITABLE_NOTE_KINDS: readonly string[] = [
  "quotation",
  "paraphrase",
  "summary",
];

const NoteKindSchema = Type.Union([
  Type.Literal("quotation"),
  Type.Literal("paraphrase"),
  Type.Literal("summary"),
  Type.Literal("analysis"),
  Type.Literal("question"),
  Type.Literal("idea"),
]);

const ReviewSchema = Type.Object(
  {
    state: Type.Union([
      Type.Literal("unchecked"),
      Type.Literal("verified"),
      Type.Literal("stale"),
    ]),
  },
  { additionalProperties: false },
);

const AnchorSchema = Type.Object(
  {
    locator: Type.Object(
      { display: NonBlank },
      { additionalProperties: false },
    ),
    pdfPageIndex: Type.Optional(Type.Integer({ minimum: 0 })),
    textQuote: Type.Optional(
      Type.Object(
        {
          exact: NonBlank,
          prefix: Type.Optional(NonBlank),
          suffix: Type.Optional(NonBlank),
        },
        { additionalProperties: false },
      ),
    ),
    sourceFingerprint: Type.Optional(NonBlank),
  },
  { additionalProperties: false },
);

const noteContent = {
  kind: NoteKindSchema,
  coreStatement: NonBlank,
  sourceRef: Type.Optional(NonBlank),
  anchor: Type.Optional(AnchorSchema),
  researcherNote: Type.Optional(NonBlank),
  tags: Type.Optional(Type.Array(NonBlank)),
  review: Type.Optional(ReviewSchema),
};

/**
 * A stored note as it may appear in JSON: `tags` and `review` default.
 */
export const NoteInputSchema = Type.Object(
  {
    id: NonBlank,
    ...noteContent,
    createdAt: Type.String({ pattern: ISO_DATE_TIME }),
  },
  { additionalProperties: false },
);

/**
 * A note to create or update; omitted identity fields are generated.
 */
export const NoteUpsertSchema = Type.Object(
  {
    id: Type.Optional(NonBlank),
    ...noteContent,
    createdAt: Type.Optional(Type.String({ pattern: ISO_DATE_TIME })),
  },
  { additionalProperties: false },
);

/**
 * A note as it may appear in JSON, before defaults are applied.
 */
export type NoteInput = Static<typeof NoteInputSchema>;

/**
 * A note ready to use: `tags` and `review` are always present.
 */
export type Note = Omit<NoteInput, "tags" | "review"> & {
  tags: string[];
  review: Static<typeof ReviewSchema>;
};

const NoteUseSchema = Type.Object(
  {
    noteId: NonBlank,
    function: NonBlank,
    handling: NonBlank,
    coverage: Type.Union([Type.Literal("primary"), Type.Literal("reference")]),
  },
  { additionalProperties: false },
);

/**
 * An argument point in an outline.
 */
export const PointSchema = Type.Object(
  {
    id: NonBlank,
    kind: Type.Literal("point"),
    role: NonBlank,
    claim: Type.Optional(NonBlank),
    reasoning: Type.Optional(NonBlank),
    noteUses: Type.Array(NoteUseSchema),
    targetParagraphCount: Type.Optional(Type.Number()),
    draftText: Type.Optional(NonBlank),
  },
  { additionalProperties: false },
);

/**
 * A section whose children are decoded node by node.
 */
export const SectionShellSchema = Type.Object(
  {
    id: NonBlank,
    kind: Type.Literal("section"),
    title: NonBlank,
    purpose: NonBlank,
    thesisContribution: NonBlank,
    targetWordCount: Type.Optional(Type.Number()),
    items: Type.Array(JsonValueSchema),
  },
  { additionalProperties: false },
);

/**
 * The outline without its (recursively decoded) items.
 */
export const OutlineShellSchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    article: Type.Object(
      {
        slug: NonBlank,
        title: NonBlank,
        targetLanguage: NonBlank,
        citationStyle: NonBlank,
      },
      { additionalProperties: false },
    ),
    researchQuestion: NonBlank,
    thesis: Type.Object(
      {
        text: NonBlank,
        status: Type.Union([
          Type.Literal("proposed"),
          Type.Literal("approved"),
        ]),
      },
      { additionalProperties: false },
    ),
    status: Type.Union([Type.Literal("draft"), Type.Literal("approved")]),
    items: Type.Array(JsonValueSchema),
  },
  { additionalProperties: false },
);

/**
 * An argument point in an outline.
 */
export type Point = Static<typeof PointSchema>;

/**
 * An outline section containing sections and points.
 */
export interface Section {
  id: string;
  kind: "section";
  title: string;
  purpose: string;
  thesisContribution: string;
  targetWordCount?: number;
  items: OutlineItem[];
}

/**
 * A child of an outline or section.
 */
export type OutlineItem = Section | Point;

/**
 * The canonical argument map for one article.
 */
export type Outline = Omit<Static<typeof OutlineShellSchema>, "items"> & {
  items: OutlineItem[];
};

/**
 * The minimum a source registry entry must expose to the research library.
 */
const SourceRefSchema = Type.Object({
  sourceId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  sourceType: Type.Optional(Type.String()),
  sourceFingerprint: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

/**
 * A source registry entry as the research library reads it.
 */
export type SourceRef = Static<typeof SourceRefSchema>;

/**
 * Writes JSON with a trailing newline, atomically.
 */
export function saveJson<Value>(path: string, value: Value): void {
  writeFileAtomic(path, JSON.stringify(value, null, 2) + "\n");
}

/**
 * Article file name without its extension, used to name its outline files.
 */
export function articleSlug(article: string): string {
  return basename(article).replace(/\.[^.]+$/, "");
}

/**
 * Reads `.academic-writer/sources.json`, or an empty registry when absent.
 */
export function readSourceRefs(projectRoot: string): SourceRef[] {
  const path = join(projectRoot, ".academic-writer", "sources.json");

  if (!existsSync(path)) return [];

  return readJsonFile(path, Type.Array(SourceRefSchema), "Source registry");
}
