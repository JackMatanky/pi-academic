import { existsSync } from "node:fs";
import { errorMessage } from "../lib/fs-safe.js";
import { diagnoseChapterCoverage } from "./coverage.js";
import {
  obj,
  arr,
  read,
  sources,
  type Point,
  type Section,
} from "./research-core.js";
import { parseNote, library, fresh } from "./research-notes.js";
import { outlinePath, frozenPath, getOutline } from "./research-outline.js";

export function queryResearch(
  r: string,
  args: {
    operation: string;
    article?: string;
    sectionId?: string;
    noteId?: string;
    sourceId?: string;
    tag?: string;
    limit?: number;
  },
): unknown {
  const allowed: Record<string, string[]> = {
    section_bundle: ["operation", "article", "sectionId"],
    note_by_id: ["operation", "noteId"],
    notes_by_source: ["operation", "sourceId", "limit"],
    notes_by_tag: ["operation", "tag", "limit"],
    outline_summary: ["operation", "article"],
  };

  const valid = allowed[args.operation];

  if (!valid) throw Error("Unsupported operation");

  for (const [k, v] of Object.entries(args))
    if (v !== undefined && !valid.includes(k))
      throw Error("Irrelevant parameter: " + k);

  if (args.operation === "note_by_id") {
    if (!args.noteId) throw Error("noteId required");
    const n = library(r).find((x) => x.id === args.noteId);

    if (!n) throw Error("Unknown noteId");

    return n;
  }

  if (
    args.operation === "notes_by_source" ||
    args.operation === "notes_by_tag"
  ) {
    if (args.operation === "notes_by_source" && !args.sourceId)
      throw Error("sourceId required");

    if (args.operation === "notes_by_tag" && !args.tag)
      throw Error("tag required");
    const limit = Math.min(100, Math.max(1, Math.floor(args.limit ?? 20)));

    return library(r)
      .filter((n) =>
        args.operation === "notes_by_source"
          ? n.sourceRef === args.sourceId
          : n.tags.includes(args.tag!),
      )
      .slice(0, limit);
  }

  if (!args.article) throw Error("article required");
  const o = getOutline(r, args.article);

  if (args.operation === "outline_summary") {
    const sections: Array<{ id: string; title: string; depth: number }> = [];

    let points = 0,
      evidence = 0;

    const walk = (xs: Array<Section | Point>, d: number) =>
      xs.forEach((n) =>
        n.kind === "section"
          ? (sections.push({ id: n.id, title: n.title, depth: d }),
            walk(n.items, d + 1))
          : (points++, (evidence += n.noteUses.length)),
      );

    walk(o.items, 0);

    return {
      thesis: o.thesis,
      status: o.status,
      sections,
      pointCount: points,
      evidenceUseCount: evidence,
    };
  }

  if (!args.sectionId) throw Error("sectionId required");

  if (o.status !== "approved")
    throw Error("section_bundle requires approved outline");
  const sp = frozenPath(r, args.article);

  if (!existsSync(sp)) throw Error("Frozen notes snapshot missing");

  const snap = obj(read(sp), "snapshot"),
    frozen = arr(snap.notes, "snapshot notes").map(parseNote);

  let target: Section | undefined;

  const find = (xs: Array<Section | Point>) =>
    xs.forEach((n) => {
      if (n.kind === "section") {
        if (n.id === args.sectionId) target = n;
        find(n.items);
      }
    });

  find(o.items);

  if (!target) throw Error("Unknown sectionId");

  const points = target.items.filter((n): n is Point => n.kind !== "section"),
    ids = new Set<string>();

  const collect = (xs: Array<Section | Point>) =>
    xs.forEach((n) =>
      n.kind === "section"
        ? collect(n.items)
        : n.noteUses.forEach((u) => ids.add(u.noteId)),
    );

  collect([target]);
  const notes = frozen.filter((n) => ids.has(n.id));

  if (notes.length !== ids.size) throw Error("Frozen note reference missing");

  return { section: target, directPoints: points, notes };
}

export function diagnoseOutline(
  r: string,
  a: string,
  evidenceMapJson?: string,
): Record<string, unknown> {
  const path = outlinePath(r, a);

  try {
    const raw = read(path) as Record<string, unknown>;
    const notes = library(r);
    const registry = sources(r);
    const byId = new Map(notes.map((note) => [note.id, note]));

    const findings: Array<{
      code: string;
      path: string;
      nodeId?: string;
      explanation: string;
    }> = [];

    const add = (
      code: string,
      at: string,
      explanation: string,
      nodeId?: string,
    ) =>
      findings.push({
        code,
        path: at,
        ...(nodeId ? { nodeId } : {}),
        explanation,
      });

    const walk = (items: unknown, at: string): void => {
      if (!Array.isArray(items)) return;
      items.forEach((value, index) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return;
        const node = value as Record<string, unknown>;
        const nodePath = `${at}[${index}]`;
        const id = typeof node.id === "string" ? node.id : undefined;

        if (node.kind === "section") {
          for (const field of ["title", "purpose", "thesisContribution"])
            if (typeof node[field] !== "string" || !node[field])
              add(
                "missing-required-field",
                `${nodePath}.${field}`,
                `Section is missing ${field}.`,
                id,
              );
          walk(node.items, `${nodePath}.items`);
        } else if (node.kind === "point") {
          for (const field of ["role", "claim", "reasoning"])
            if (typeof node[field] !== "string" || !node[field])
              add(
                "missing-required-field",
                `${nodePath}.${field}`,
                `Point is missing ${field}.`,
                id,
              );

          if (!Array.isArray(node.noteUses)) {
            if (node.role !== "transition")
              add(
                "missing-note-use",
                `${nodePath}.noteUses`,
                "Argument point has no note-use list.",
                id,
              );

            return;
          }

          const noteUses = node.noteUses;

          if (noteUses.length === 0 && node.role !== "transition")
            add(
              "missing-note-use",
              `${nodePath}.noteUses`,
              "Argument point has no linked evidence note.",
              id,
            );
          noteUses.forEach((use, useIndex) => {
            if (!use || typeof use !== "object" || Array.isArray(use)) return;
            const fields = use as Record<string, unknown>;

            for (const field of ["function", "handling"])
              if (typeof fields[field] !== "string" || !fields[field])
                add(
                  "missing-required-field",
                  `${nodePath}.noteUses[${useIndex}].${field}`,
                  `Note use is missing ${field}.`,
                  id,
                );
            const noteId = (use as Record<string, unknown>).noteId;
            const usePath = `${nodePath}.noteUses[${useIndex}].noteId`;

            const note =
              typeof noteId === "string" ? byId.get(noteId) : undefined;

            if (!note)
              add(
                "unresolved-note-reference",
                usePath,
                `No research note resolves noteId ${String(noteId)}.`,
                id,
              );
            else {
              const current = fresh(note, registry);

              if (current.review.state !== "verified")
                add(
                  current.review.state === "stale"
                    ? "stale-note-link"
                    : "unverified-note-link",
                  usePath,
                  `Linked note ${note.id} is ${current.review.state}.`,
                  id,
                );
            }
          });
        }
      });
    };

    walk(raw.items, "$.items");

    const coverageFindings =
      evidenceMapJson === undefined
        ? []
        : diagnoseChapterCoverage(evidenceMapJson);

    return {
      status: "advisory",
      artifact: path,
      findings: [...findings, ...coverageFindings],
    };
  } catch (error) {
    return {
      status: "error",
      artifact: path,
      reason: errorMessage(error),
      findings: [],
    };
  }
}
