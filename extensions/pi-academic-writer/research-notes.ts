import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { Type } from "typebox";

import { withFileLock } from "../lib/fs-safe.js";
import {
  JsonValueSchema,
  parseWith,
  readJsonFile,
  type JsonValue,
} from "../lib/schema.js";
import {
  NoteInputSchema,
  NoteUpsertSchema,
  readSourceRefs,
  saveJson,
  type Note,
  type NoteInput,
  type SourceRef,
} from "./research-core.js";

const NoteLibrarySchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    notes: Type.Array(JsonValueSchema),
  },
  { additionalProperties: false },
);

/**
 * Returns the path of the project's research-note library.
 *
 * @param projectRoot - Root directory of the project.
 *
 * @returns Absolute path to `.academic-writer/research-notes.json`.
 */
export function noteFile(projectRoot: string): string {
  return join(projectRoot, ".academic-writer", "research-notes.json");
}

/**
 * Applies the evidence rules of each note kind and fills in defaults.
 *
 * @param input - Raw parsed note input data.
 *
 * @returns Validated, fully formed research note.
 * @throws When a quotation, paraphrase or summary lacks what it must carry.
 */
export function buildNote(input: NoteInput): Note {
  const { kind, sourceRef, anchor, researcherNote } = input;

  if (kind === "quotation" && !(sourceRef && anchor?.textQuote?.exact))
    throw new Error("Quotation requires sourceRef, locator, exact quote");

  if (kind === "paraphrase" && !(sourceRef && researcherNote))
    throw new Error("Paraphrase requires sourceRef and researcherNote");

  if (
    kind === "summary" &&
    !(sourceRef && researcherNote && /^synthesis:/i.test(researcherNote))
  )
    throw new Error("Summary requires researcherNote labeled Synthesis:");

  if (!Number.isFinite(Date.parse(input.createdAt)))
    throw new Error("createdAt must be ISO-8601 date-time");

  const note: Note = {
    id: input.id,
    kind,
    coreStatement: input.coreStatement,
    tags: input.tags ?? [],
    review: input.review ?? { state: "unchecked" },
    createdAt: input.createdAt,
  };

  if (sourceRef) note.sourceRef = sourceRef;

  if (anchor) note.anchor = anchor;

  if (researcherNote) note.researcherNote = researcherNote;

  return note;
}

/**
 * Decodes one stored note from raw JSON.
 *
 * @param value - Raw JSON value representing a note.
 *
 * @returns Validated research note.
 */
export function parseNote(value: JsonValue): Note {
  return buildNote(parseWith(NoteInputSchema, value, "note"));
}

/**
 * Loads the note library; a missing file is an empty library.
 *
 * @param projectRoot - Root directory of the project.
 *
 * @returns Array of loaded and decoded research notes.
 */
export function library(projectRoot: string): Note[] {
  const path = noteFile(projectRoot);

  if (!existsSync(path)) return [];

  const { notes } = readJsonFile(path, NoteLibrarySchema, "library");

  return notes.map(parseNote);
}

/**
 * Marks a note stale when its source's fingerprint no longer matches the one
 * the note was anchored to.
 *
 * @param note - Note to evaluate for staleness.
 * @param registry - Source reference records to compare fingerprints against.
 *
 * @returns Same note or fresh copy with `review.state` set to "stale".
 * @throws When the note cites a source missing from the registry, or a local
 *   source without a fingerprint.
 */
export function fresh(note: Note, registry: SourceRef[]): Note {
  if (!note.sourceRef) return note;

  const source = registry.find((entry) => entry.sourceId === note.sourceRef);

  if (!source) throw new Error("Unknown sourceRef: " + note.sourceRef);

  const fingerprint = source.sourceFingerprint ?? undefined;

  if (source.sourceType === "local-file" && !fingerprint)
    throw new Error("Source registry fingerprint is missing");

  return fingerprint && fingerprint !== note.anchor?.sourceFingerprint
    ? { ...note, review: { state: "stale" } }
    : note;
}

function saveLibrary(projectRoot: string, notes: Note[]): void {
  saveJson(noteFile(projectRoot), { schemaVersion: 1, notes });
}

/**
 * Creates or updates notes. Edited notes go back to `unchecked`; unchanged ones
 * keep their review state.
 *
 * @param projectRoot - Root directory of the project.
 * @param upserts - Raw note upsert payloads.
 *
 * @returns Array of successfully saved and merged notes.
 */
export async function writeResearchNotes(
  projectRoot: string,
  upserts: JsonValue[],
): Promise<Note[]> {
  return withFileLock(noteFile(projectRoot), async () => {
    const byId = new Map(library(projectRoot).map((note) => [note.id, note]));
    const seen = new Set<string>();
    const registry = readSourceRefs(projectRoot);
    const saved: Note[] = [];

    for (const raw of upserts) {
      const upsert = parseWith(NoteUpsertSchema, raw, "upsert");
      const id = upsert.id ?? randomUUID();
      const previous = byId.get(id);

      const candidate = buildNote({
        ...upsert,
        id,
        createdAt:
          upsert.createdAt ?? previous?.createdAt ?? new Date().toISOString(),
        review: { state: "unchecked" },
      });

      if (seen.has(id)) throw new Error("Duplicate note ID: " + id);
      seen.add(id);

      const unchanged =
        previous !== undefined &&
        JSON.stringify({ ...previous, review: undefined }) ===
          JSON.stringify({ ...candidate, review: undefined });

      const current = fresh(
        unchanged ? { ...candidate, review: previous.review } : candidate,
        registry,
      );

      byId.set(id, current);
      saved.push(current);
    }

    saveLibrary(projectRoot, [...byId.values()]);

    return saved;
  });
}

/**
 * Marks notes verified or unchecked; staleness is re-evaluated.
 *
 * @param projectRoot - Root directory of the project.
 * @param noteIds - Unique identifiers of notes to update.
 * @param state - New review state ("unchecked" or "verified").
 *
 * @returns Array of updated research notes.
 * @throws When any ID in `noteIds` is not found in the library.
 */
export async function reviewResearchNotes(
  projectRoot: string,
  noteIds: string[],
  state: "unchecked" | "verified",
): Promise<Note[]> {
  return withFileLock(noteFile(projectRoot), () => {
    const notes = library(projectRoot);
    const wanted = new Set(noteIds);

    if (notes.filter((note) => wanted.has(note.id)).length !== wanted.size)
      throw new Error("Unknown noteIds");

    const registry = readSourceRefs(projectRoot);

    const updated = notes.map((note) =>
      wanted.has(note.id)
        ? fresh({ ...note, review: { state } }, registry)
        : note,
    );

    saveLibrary(projectRoot, updated);

    return updated.filter((note) => wanted.has(note.id));
  });
}

/**
 * A source as re-read by ingestion: identity plus current fingerprint.
 */
export interface RefreshedSource {
  sourceId: string;
  sourceFingerprint?: string;
}

/**
 * Marks notes stale when their source vanished or its content changed.
 *
 * @param projectRoot - Root directory of the project.
 * @param refreshed - Current state and fingerprints of re-ingested sources.
 */
export async function markResearchNotesStale(
  projectRoot: string,
  refreshed: RefreshedSource[],
): Promise<void> {
  const path = noteFile(projectRoot);

  await withFileLock(path, () => {
    if (!existsSync(path)) return;

    const next = library(projectRoot).map((note): Note => {
      if (!note.sourceRef) return note;

      const source = refreshed.find(
        (entry) => entry.sourceId === note.sourceRef,
      );

      const changed =
        source?.sourceFingerprint !== undefined &&
        note.anchor?.sourceFingerprint !== source.sourceFingerprint;

      return !source || changed
        ? { ...note, review: { state: "stale" } }
        : note;
    });

    saveLibrary(projectRoot, next);
  });
}
