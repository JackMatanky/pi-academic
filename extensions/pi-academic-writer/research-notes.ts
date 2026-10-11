import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { withFileLock } from "../lib/fs-safe.js";
import {
  kinds,
  obj,
  strict,
  str,
  arr,
  read,
  save,
  sources,
  type Note,
} from "./research-core.js";

export function noteFile(r: string): string {
  return join(r, ".academic-writer", "research-notes.json");
}

export function parseNote(x: unknown): Note {
  const n = obj(x, "note");
  strict(
    n,
    [
      "id",
      "kind",
      "coreStatement",
      "sourceRef",
      "anchor",
      "researcherNote",
      "tags",
      "review",
      "createdAt",
    ],
    "note",
  );
  const kind = str(n.kind, "kind");

  if (!kinds.includes(kind)) throw Error("Invalid note kind");

  const sourceRef =
    n.sourceRef === undefined ? undefined : str(n.sourceRef, "sourceRef");

  let anchor: Note["anchor"];

  if (n.anchor !== undefined) {
    const a = obj(n.anchor, "anchor");
    strict(
      a,
      ["locator", "pdfPageIndex", "textQuote", "sourceFingerprint"],
      "anchor",
    );
    const l = obj(a.locator, "locator");
    strict(l, ["display"], "locator");
    anchor = { locator: { display: str(l.display, "locator.display") } };

    if (a.pdfPageIndex !== undefined) {
      if (!Number.isInteger(a.pdfPageIndex) || (a.pdfPageIndex as number) < 0)
        throw Error("pdfPageIndex must be zero-based");
      anchor.pdfPageIndex = a.pdfPageIndex as number;
    }

    if (a.textQuote !== undefined) {
      const q = obj(a.textQuote, "textQuote");
      strict(q, ["exact", "prefix", "suffix"], "textQuote");
      anchor.textQuote = {
        exact: str(q.exact, "quote"),
        ...(q.prefix === undefined ? {} : { prefix: str(q.prefix, "prefix") }),
        ...(q.suffix === undefined ? {} : { suffix: str(q.suffix, "suffix") }),
      };
    }

    if (a.sourceFingerprint !== undefined)
      anchor.sourceFingerprint = str(a.sourceFingerprint, "fingerprint");
  }

  const researcherNote =
    n.researcherNote === undefined
      ? undefined
      : str(n.researcherNote, "researcherNote");

  if (
    kind === "quotation" &&
    (!sourceRef || !anchor?.locator || !anchor.textQuote?.exact)
  )
    throw Error("Quotation requires sourceRef, locator, exact quote");

  if (kind === "paraphrase" && (!sourceRef || !researcherNote))
    throw Error("Paraphrase requires sourceRef and researcherNote");

  if (
    kind === "summary" &&
    (!sourceRef || !researcherNote || !/^synthesis:/i.test(researcherNote))
  )
    throw Error("Summary requires researcherNote labeled Synthesis:");
  const tags = arr(n.tags ?? [], "tags").map((t) => str(t, "tag"));
  const rv = obj(n.review ?? { state: "unchecked" }, "review");
  strict(rv, ["state"], "review");

  if (!["unchecked", "verified", "stale"].includes(String(rv.state)))
    throw Error("Invalid review state");
  const createdAt = str(n.createdAt, "createdAt");

  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      createdAt,
    ) ||
    !Number.isFinite(Date.parse(createdAt))
  )
    throw Error("createdAt must be ISO-8601 date-time");

  return {
    id: str(n.id, "id"),
    kind: kind as Note["kind"],
    coreStatement: str(n.coreStatement, "coreStatement"),
    ...(sourceRef ? { sourceRef } : {}),
    ...(anchor ? { anchor } : {}),
    ...(researcherNote ? { researcherNote } : {}),
    tags,
    review: { state: rv.state as Note["review"]["state"] },
    createdAt,
  };
}

export function library(r: string): Note[] {
  const p = noteFile(r);

  if (!existsSync(p)) return [];
  const d = obj(read(p), "library");
  strict(d, ["schemaVersion", "notes"], "library");

  if (d.schemaVersion !== 1) throw Error("Unsupported note schema");

  return arr(d.notes, "notes").map(parseNote);
}

export function fresh(n: Note, src: Array<Record<string, unknown>>): Note {
  if (!n.sourceRef) return n;
  const s = src.find((x) => x.sourceId === n.sourceRef);

  if (!s) throw Error("Unknown sourceRef: " + n.sourceRef);

  const fp =
      typeof s.sourceFingerprint === "string" ? s.sourceFingerprint : undefined,
    nfp = n.anchor?.sourceFingerprint;

  if (s.sourceType === "local-file" && !fp)
    throw Error("Source registry fingerprint is missing");

  return fp && fp !== nfp ? { ...n, review: { state: "stale" } } : n;
}

export function writeResearchNotes(root: string, input: unknown[]): Note[] {
  return withFileLock(noteFile(root), () => {
    const old = library(root),
      map = new Map(old.map((n) => [n.id, n])),
      batch = new Set<string>(),
      src = sources(root),
      saved: Note[] = [];

    for (const v of input) {
      const x = obj(v, "upsert"),
        id = x.id === undefined ? randomUUID() : str(x.id, "id"),
        prev = map.get(id),
        n = parseNote({
          ...x,
          id,
          createdAt: x.createdAt ?? prev?.createdAt ?? new Date().toISOString(),
          review: { state: "unchecked" },
        });

      if (batch.has(id)) throw Error("Duplicate note ID: " + id);
      batch.add(id);

      const unchanged =
        prev !== undefined &&
        JSON.stringify({ ...prev, review: undefined }) ===
          JSON.stringify({ ...n, review: undefined });

      const current = fresh(
        unchanged && prev ? { ...n, review: prev.review } : n,
        src,
      );

      map.set(id, current);
      saved.push(current);
    }

    save(noteFile(root), { schemaVersion: 1, notes: [...map.values()] });

    return saved;
  });
}

export function reviewResearchNotes(
  root: string,
  ids: string[],
  state: "unchecked" | "verified",
): Note[] {
  return withFileLock(noteFile(root), () => {
    const ns = library(root),
      set = new Set(ids),
      found = ns.filter((n) => set.has(n.id));

    if (found.length !== set.size) throw Error("Unknown noteIds");

    const src = sources(root),
      updated = ns.map((n) =>
        set.has(n.id) ? fresh({ ...n, review: { state } }, src) : n,
      );

    save(noteFile(root), { schemaVersion: 1, notes: updated });

    return updated.filter((n) => set.has(n.id));
  });
}

export function markResearchNotesStale(
  root: string,
  refreshed: Array<{ sourceId: string; sourceFingerprint?: string }>,
): void {
  const path = noteFile(root);
  withFileLock(path, () => {
    if (!existsSync(path)) return;
    const current = library(root);

    const next = current.map((note) => {
      if (!note.sourceRef) return note;

      const source = refreshed.find(
        (entry) => entry.sourceId === note.sourceRef,
      );

      if (
        !source ||
        (source.sourceFingerprint &&
          note.anchor?.sourceFingerprint !== source.sourceFingerprint)
      )
        return { ...note, review: { state: "stale" as const } };

      return note;
    });

    save(path, { schemaVersion: 1, notes: next });
  });
}
