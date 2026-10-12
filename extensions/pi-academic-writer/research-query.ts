import type { Static } from "typebox";

import { existsSync, readFileSync } from "node:fs";

import { Type } from "typebox";

import { errorMessage } from "../lib/fs-safe.js";
import {
  isValid,
  JsonValueSchema,
  parseJsonText,
  readJsonFile,
  stringEnum,
  type JsonValue,
} from "../lib/schema.js";
import { diagnoseChapterCoverage, type CoverageFinding } from "./coverage.js";
import {
  readSourceRefs,
  type Note,
  type Outline,
  type OutlineItem,
  type Point,
  type Section,
} from "./research-core.js";
import { fresh, library, parseNote } from "./research-notes.js";
import { frozenPath, getOutline, outlinePath } from "./research-outline.js";

/**
 * Parameters of `academic_writer_query_research`.
 */
export const ResearchQuerySchema = Type.Object({
  operation: stringEnum([
    "section_bundle",
    "note_by_id",
    "notes_by_source",
    "notes_by_tag",
    "outline_summary",
  ] as const),
  article: Type.Optional(Type.String()),
  sectionId: Type.Optional(Type.String()),
  noteId: Type.Optional(Type.String()),
  sourceId: Type.Optional(Type.String()),
  tag: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
});

/**
 * A research query: one operation plus the parameters that operation takes.
 */
export type ResearchQuery = Static<typeof ResearchQuerySchema>;

/**
 * Counts and structure of an outline, without its content.
 */
export interface OutlineSummary {
  thesis: { text: string; status: "proposed" | "approved" };
  status: "draft" | "approved";
  sections: Array<{ id: string; title: string; depth: number }>;
  pointCount: number;
  evidenceUseCount: number;
}

/**
 * One section with its direct points and the frozen notes it cites.
 */
export interface SectionBundle {
  section: Section;
  directPoints: Point[];
  notes: Note[];
}

/**
 * What `queryResearch` returns for each operation.
 */
export type ResearchQueryResult =
  | Note
  | Note[]
  | OutlineSummary
  | SectionBundle;

const ALLOWED_PARAMETERS: Record<ResearchQuery["operation"], string[]> = {
  section_bundle: ["operation", "article", "sectionId"],
  note_by_id: ["operation", "noteId"],
  notes_by_source: ["operation", "sourceId", "limit"],
  notes_by_tag: ["operation", "tag", "limit"],
  outline_summary: ["operation", "article"],
};

const NoteSnapshotSchema = Type.Object({ notes: Type.Array(JsonValueSchema) });

function summarizeOutline(outline: Outline): OutlineSummary {
  const sections: OutlineSummary["sections"] = [];
  let pointCount = 0;
  let evidenceUseCount = 0;

  const walk = (items: OutlineItem[], depth: number) => {
    for (const item of items) {
      if (item.kind === "section") {
        sections.push({ id: item.id, title: item.title, depth });
        walk(item.items, depth + 1);
      } else {
        pointCount += 1;
        evidenceUseCount += item.noteUses.length;
      }
    }
  };

  walk(outline.items, 0);

  return {
    thesis: outline.thesis,
    status: outline.status,
    sections,
    pointCount,
    evidenceUseCount,
  };
}

function findSection(items: OutlineItem[], id: string): Section | undefined {
  for (const item of items) {
    if (item.kind !== "section") continue;

    if (item.id === id) return item;

    const nested = findSection(item.items, id);

    if (nested) return nested;
  }

  return undefined;
}

function citedNoteIds(items: OutlineItem[], ids: Set<string>): Set<string> {
  for (const item of items) {
    if (item.kind === "section") citedNoteIds(item.items, ids);
    else for (const use of item.noteUses) ids.add(use.noteId);
  }

  return ids;
}

/**
 * Answers a fixed-scope query over the note library and outlines.
 *
 * @throws When a parameter is missing or irrelevant to the operation, or when
 *   the requested note, section or frozen snapshot does not exist.
 */
export function queryResearch(
  projectRoot: string,
  query: ResearchQuery,
): ResearchQueryResult {
  const allowed = ALLOWED_PARAMETERS[query.operation];

  for (const [key, value] of Object.entries(query))
    if (value !== undefined && !allowed.includes(key))
      throw new Error("Irrelevant parameter: " + key);

  if (query.operation === "note_by_id") {
    if (!query.noteId) throw new Error("noteId required");

    const note = library(projectRoot).find(
      (candidate) => candidate.id === query.noteId,
    );

    if (!note) throw new Error("Unknown noteId");

    return note;
  }

  if (
    query.operation === "notes_by_source" ||
    query.operation === "notes_by_tag"
  ) {
    const { sourceId, tag } = query;

    if (query.operation === "notes_by_source" && !sourceId)
      throw new Error("sourceId required");

    if (query.operation === "notes_by_tag" && !tag)
      throw new Error("tag required");

    const limit = Math.min(100, Math.max(1, Math.floor(query.limit ?? 20)));

    return library(projectRoot)
      .filter((note) =>
        query.operation === "notes_by_source"
          ? note.sourceRef === sourceId
          : tag !== undefined && note.tags.includes(tag),
      )
      .slice(0, limit);
  }

  if (!query.article) throw new Error("article required");

  const outline = getOutline(projectRoot, query.article);

  if (query.operation === "outline_summary") return summarizeOutline(outline);

  if (!query.sectionId) throw new Error("sectionId required");

  if (outline.status !== "approved")
    throw new Error("section_bundle requires approved outline");

  const snapshotPath = frozenPath(projectRoot, query.article);

  if (!existsSync(snapshotPath))
    throw new Error("Frozen notes snapshot missing");

  const frozen = readJsonFile(
    snapshotPath,
    NoteSnapshotSchema,
    "snapshot",
  ).notes.map(parseNote);

  const section = findSection(outline.items, query.sectionId);

  if (!section) throw new Error("Unknown sectionId");

  const directPoints = section.items.filter(
    (item): item is Point => item.kind === "point",
  );

  const ids = citedNoteIds([section], new Set());
  const notes = frozen.filter((note) => ids.has(note.id));

  if (notes.length !== ids.size)
    throw new Error("Frozen note reference missing");

  return { section, directPoints, notes };
}

/**
 * One advisory finding about an outline.
 */
export interface OutlineFinding extends CoverageFinding {
  nodeId?: string;
}

/**
 * The result of diagnosing an outline: findings, or why it could not be read.
 */
export type OutlineDiagnosis =
  | { status: "advisory"; artifact: string; findings: OutlineFinding[] }
  | { status: "error"; artifact: string; reason: string; findings: [] };

/**
 * An outline node read leniently, so incomplete drafts can be diagnosed.
 */
const DraftNodeSchema = Type.Object({
  id: Type.Optional(Type.String()),
  kind: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
  purpose: Type.Optional(Type.String()),
  thesisContribution: Type.Optional(Type.String()),
  role: Type.Optional(Type.String()),
  claim: Type.Optional(Type.String()),
  reasoning: Type.Optional(Type.String()),
  items: Type.Optional(Type.Array(JsonValueSchema)),
  noteUses: Type.Optional(Type.Array(JsonValueSchema)),
});

const DraftNoteUseSchema = Type.Object({
  noteId: Type.Optional(Type.String()),
  function: Type.Optional(Type.String()),
  handling: Type.Optional(Type.String()),
});

const DraftOutlineSchema = Type.Object({
  items: Type.Optional(Type.Array(JsonValueSchema)),
});

/**
 * Reports missing fields and unresolved, unverified or stale note links in an
 * outline. Findings are advisory; they never change approval.
 */
export function diagnoseOutline(
  projectRoot: string,
  article: string,
  evidenceMapJson?: string,
): OutlineDiagnosis {
  const path = outlinePath(projectRoot, article);

  try {
    const draft = parseJsonText(readFileSync(path, "utf8"));

    if (!isValid(DraftOutlineSchema, draft))
      throw new Error("outline must be a JSON object with an items array");

    const notesById = new Map(
      library(projectRoot).map((note) => [note.id, note]),
    );

    const registry = readSourceRefs(projectRoot);
    const findings: OutlineFinding[] = [];

    const add = (
      code: string,
      at: string,
      explanation: string,
      nodeId?: string,
    ) => {
      const finding: OutlineFinding = { code, path: at, explanation };

      if (nodeId) finding.nodeId = nodeId;
      findings.push(finding);
    };

    const requireFields = (
      fields: Record<string, string | undefined>,
      kind: string,
      at: string,
      nodeId: string | undefined,
    ) => {
      for (const [field, value] of Object.entries(fields))
        if (!value)
          add(
            "missing-required-field",
            `${at}.${field}`,
            `${kind} is missing ${field}.`,
            nodeId,
          );
    };

    const diagnoseNoteUse = (
      raw: JsonValue,
      at: string,
      nodeId: string | undefined,
    ) => {
      if (!isValid(DraftNoteUseSchema, raw)) return;

      requireFields(
        { function: raw.function, handling: raw.handling },
        "Note use",
        at,
        nodeId,
      );

      const note = raw.noteId ? notesById.get(raw.noteId) : undefined;

      if (!note) {
        add(
          "unresolved-note-reference",
          `${at}.noteId`,
          `No research note resolves noteId ${String(raw.noteId)}.`,
          nodeId,
        );

        return;
      }

      const { state } = fresh(note, registry).review;

      if (state !== "verified")
        add(
          state === "stale" ? "stale-note-link" : "unverified-note-link",
          `${at}.noteId`,
          `Linked note ${note.id} is ${state}.`,
          nodeId,
        );
    };

    const walk = (items: JsonValue[], at: string): void => {
      items.forEach((raw, index) => {
        if (!isValid(DraftNodeSchema, raw)) return;

        const nodePath = `${at}[${index}]`;

        if (raw.kind === "section") {
          requireFields(
            {
              title: raw.title,
              purpose: raw.purpose,
              thesisContribution: raw.thesisContribution,
            },
            "Section",
            nodePath,
            raw.id,
          );
          walk(raw.items ?? [], `${nodePath}.items`);

          return;
        }

        if (raw.kind !== "point") return;

        requireFields(
          { role: raw.role, claim: raw.claim, reasoning: raw.reasoning },
          "Point",
          nodePath,
          raw.id,
        );

        const noteUses = raw.noteUses;

        if (noteUses === undefined) {
          if (raw.role !== "transition")
            add(
              "missing-note-use",
              `${nodePath}.noteUses`,
              "Argument point has no note-use list.",
              raw.id,
            );

          return;
        }

        if (noteUses.length === 0 && raw.role !== "transition")
          add(
            "missing-note-use",
            `${nodePath}.noteUses`,
            "Argument point has no linked evidence note.",
            raw.id,
          );

        noteUses.forEach((use, useIndex) =>
          diagnoseNoteUse(use, `${nodePath}.noteUses[${useIndex}]`, raw.id),
        );
      });
    };

    walk(draft.items ?? [], "$.items");

    const coverage =
      evidenceMapJson === undefined
        ? []
        : diagnoseChapterCoverage(evidenceMapJson);

    return {
      status: "advisory",
      artifact: path,
      findings: [...findings, ...coverage],
    };
  } catch (cause) {
    return {
      status: "error",
      artifact: path,
      reason: errorMessage(cause),
      findings: [],
    };
  }
}
