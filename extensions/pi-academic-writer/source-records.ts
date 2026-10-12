import type { JsonObject, JsonValue } from "../lib/schema.js";
import type { Static } from "typebox";

import { Type } from "typebox";

import { isValid, JsonObjectSchema } from "../lib/schema.js";

const StringSchema = Type.String();

/**
 * A source record generated from one project-local source file.
 */
export const LocalSourceRecordSchema = Type.Object({
  sourceId: Type.String(),
  sourceFingerprint: Type.String(),
  citeKey: Type.String(),
  sourceType: Type.Literal("local-file"),
  path: Type.String(),
  fileType: Type.String(),
  author: Type.Null(),
  workTitle: Type.String(),
  year: Type.Union([Type.String(), Type.Null()]),
  extractionConfidence: Type.Object({
    author: Type.Literal("low"),
    workTitle: Type.Literal("medium"),
    year: Type.Union([Type.Literal("medium"), Type.Literal("low")]),
  }),
  extractionNotes: Type.String(),
  pages: Type.Optional(
    Type.Array(
      Type.Object({
        pdfPageIndex: Type.Integer({ minimum: 0 }),
        text: Type.String(),
      }),
    ),
  ),
});

/**
 * A source record generated from one project-local source file.
 */
export type LocalSourceRecord = Static<typeof LocalSourceRecordSchema>;

/**
 * What ingestion needs from an existing local-file entry. Everything else in
 * the entry is preserved untouched.
 */
export const StoredLocalSourceSchema = Type.Object({
  sourceType: Type.Literal("local-file"),
  sourceId: Type.String(),
  citeKey: Type.String(),
  path: Type.String(),
  workTitle: Type.Optional(Type.String()),
  year: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

/**
 * An existing local-file entry in `sources.json`.
 */
export type StoredLocalSource = Static<typeof StoredLocalSourceSchema>;

const ZoteroKindSchema = Type.Object({ sourceType: Type.Literal("zotero") });

const LocalKindSchema = Type.Object({ sourceType: Type.Literal("local-file") });

/**
 * Structured boundary for current-run source cache records; identity rules
 * remain in normalization.
 */
export const SourceCacheRecordSchema = Type.Object({
  sourceType: Type.Union([Type.Literal("zotero"), Type.Literal("local-file")]),
  sourceId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  sourceFingerprint: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  libraryId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  itemKey: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  extractionConfidence: Type.Optional(
    Type.Record(
      Type.String(),
      Type.Union([
        Type.Literal("high"),
        Type.Literal("medium"),
        Type.Literal("low"),
      ]),
    ),
  ),
});

/**
 * Reads a string-valued field of an opaque registry entry.
 */
export function stringField(
  entry: JsonObject,
  key: string,
): string | undefined {
  const value = entry[key];

  return isValid(StringSchema, value) ? value : undefined;
}

/**
 * Reads a field of an opaque registry entry, whatever its JSON type.
 */
function rawField(entry: JsonObject, key: string): JsonValue | undefined {
  return entry[key];
}

function nonBlank(value: string | undefined): string | undefined {
  return value?.trim() ? value : undefined;
}

/**
 * Checks one source record handed over by the deep-reader and fills in the
 * derived `sourceId` for Zotero records.
 *
 * @throws When the record is not an object, has an unknown `sourceType`, or its
 *   `sourceId` does not match the identity fields.
 */
export function normalizeSourceCacheRecord(value: JsonValue): JsonObject {
  if (!isValid(JsonObjectSchema, value))
    throw new Error("Each source cache record must be an object");

  if (isValid(ZoteroKindSchema, value)) {
    const libraryId = nonBlank(stringField(value, "libraryId"));
    const itemKey = nonBlank(stringField(value, "itemKey"));
    const declared = rawField(value, "sourceId");
    const hasDeclared = declared !== undefined && declared !== null;

    if (libraryId && itemKey) {
      const sourceId = `zotero:${libraryId}:${itemKey}`;

      if (hasDeclared && declared !== sourceId)
        throw new Error("Zotero sourceId must match libraryId and itemKey");

      return { ...value, sourceId };
    }

    if (hasDeclared)
      throw new Error(
        "Zotero sourceId requires confirmed libraryId and itemKey",
      );

    return { ...value, sourceId: null };
  }

  if (isValid(LocalKindSchema, value)) {
    const fingerprint = stringField(value, "sourceFingerprint");

    if (
      fingerprint === undefined ||
      rawField(value, "sourceId") !== `local:${fingerprint}`
    )
      throw new Error("Local sourceId must match its sourceFingerprint");

    return value;
  }

  throw new Error("Source record needs sourceType zotero or local-file");
}
