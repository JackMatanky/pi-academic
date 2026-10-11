import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { diagnoseChapterCoverage } from "./coverage.js";
type Note = {
  id: string;
  kind:
    | "quotation"
    | "paraphrase"
    | "summary"
    | "analysis"
    | "question"
    | "idea";
  coreStatement: string;
  sourceRef?: string;
  anchor?: {
    locator: { display: string };
    pdfPageIndex?: number;
    textQuote?: { exact: string; prefix?: string; suffix?: string };
    sourceFingerprint?: string;
  };
  researcherNote?: string;
  tags: string[];
  review: { state: "unchecked" | "verified" | "stale" };
  createdAt: string;
};
type Point = {
  id: string;
  role: string;
  kind: "point";
  claim?: string;
  reasoning?: string;
  noteUses: Array<{
    noteId: string;
    function: string;
    handling: string;
    coverage: "primary" | "reference";
  }>;
  targetParagraphCount?: number;
  draftText?: string;
};
type Section = {
  id: string;
  kind: "section";
  title: string;
  purpose: string;
  thesisContribution: string;
  targetWordCount?: number;
  items: Array<Section | Point>;
};
type Outline = {
  schemaVersion: 1;
  article: {
    slug: string;
    title: string;
    targetLanguage: string;
    citationStyle: string;
  };
  researchQuestion: string;
  thesis: { text: string; status: "proposed" | "approved" };
  status: "draft" | "approved";
  items: Array<Section | Point>;
};
const kinds = [
  "quotation",
  "paraphrase",
  "summary",
  "analysis",
  "question",
  "idea",
];
function obj(x: unknown, label: string): Record<string, unknown> {
  if (!x || typeof x !== "object" || Array.isArray(x))
    throw Error(label + " must be an object");
  return x as Record<string, unknown>;
}
function strict(
  x: Record<string, unknown>,
  allowed: string[],
  label: string,
): void {
  const bad = Object.keys(x).filter((k) => !allowed.includes(k));
  if (bad.length) throw Error(label + " unknown key(s): " + bad.join(", "));
}
function str(x: unknown, label: string): string {
  if (typeof x !== "string" || !x.trim())
    throw Error(label + " must be non-empty");
  return x;
}
function arr(x: unknown, label: string): unknown[] {
  if (!Array.isArray(x)) throw Error(label + " must be an array");
  return x;
}
function read(p: string): unknown {
  return JSON.parse(readFileSync(p, "utf8")) as unknown;
}
function save(p: string, x: unknown): void {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(x, null, 2) + "\n", "utf8");
}
function slug(a: string): string {
  return basename(a).replace(/\.[^.]+$/, "");
}
function noteFile(r: string): string {
  return join(r, ".academic-writer", "research-notes.json");
}
function sources(r: string): Array<Record<string, unknown>> {
  const p = join(r, ".academic-writer", "sources.json");
  if (!existsSync(p)) return [];
  const v = read(p);
  if (!Array.isArray(v)) throw Error("Source registry must be an array");
  return v.map((x) => obj(x, "source"));
}
function parseNote(x: unknown): Note {
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
function library(r: string): Note[] {
  const p = noteFile(r);
  if (!existsSync(p)) return [];
  const d = obj(read(p), "library");
  strict(d, ["schemaVersion", "notes"], "library");
  if (d.schemaVersion !== 1) throw Error("Unsupported note schema");
  return arr(d.notes, "notes").map(parseNote);
}
function fresh(n: Note, src: Array<Record<string, unknown>>): Note {
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
}
export function reviewResearchNotes(
  root: string,
  ids: string[],
  state: "unchecked" | "verified",
): Note[] {
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
}
function validateOutline(
  value: unknown,
  ns: Note[],
  sourceRegistry?: Array<Record<string, unknown>>,
  allowMigratedUnmapped = false,
): Outline {
  const d = obj(value, "outline");
  strict(
    d,
    [
      "schemaVersion",
      "article",
      "researchQuestion",
      "thesis",
      "status",
      "items",
    ],
    "outline",
  );
  if (d.schemaVersion !== 1) throw Error("Unsupported outline schemaVersion");
  const a = obj(d.article, "article");
  strict(a, ["slug", "title", "targetLanguage", "citationStyle"], "article");
  const article = {
    slug: str(a.slug, "slug"),
    title: str(a.title, "title"),
    targetLanguage: str(a.targetLanguage, "targetLanguage"),
    citationStyle: str(a.citationStyle, "citationStyle"),
  };
  const t = obj(d.thesis, "thesis");
  strict(t, ["text", "status"], "thesis");
  if (
    !["proposed", "approved"].includes(String(t.status)) ||
    !["draft", "approved"].includes(String(d.status))
  )
    throw Error("Invalid status");
  const ids = new Set<string>(),
    prim = new Set<string>(),
    refs = new Set<string>();
  let unmapped = false,
    unresolved = false;
  const nodes = (xs: unknown[]): Array<Section | Point> =>
    xs.map((raw) => {
      const n = obj(raw, "node");
      if (n.kind === "section") {
        strict(
          n,
          [
            "id",
            "kind",
            "title",
            "purpose",
            "thesisContribution",
            "targetWordCount",
            "items",
          ],
          "section",
        );
        const id = str(n.id, "section id");
        if (ids.has(id)) throw Error("Duplicate node id: " + id);
        ids.add(id);
        return {
          id,
          kind: "section",
          title: str(n.title, "title"),
          purpose: str(n.purpose, "purpose"),
          thesisContribution: str(n.thesisContribution, "thesisContribution"),
          ...(n.targetWordCount === undefined
            ? {}
            : { targetWordCount: Number(n.targetWordCount) }),
          items: nodes(arr(n.items, "items")) as Array<Section | Point>,
        };
      }
      if (n.kind !== "point") throw Error("Node kind must be section or point");
      strict(
        n,
        [
          "id",
          "kind",
          "role",
          "claim",
          "reasoning",
          "noteUses",
          "targetParagraphCount",
          "draftText",
        ],
        "point",
      );
      const id = str(n.id, "point id");
      if (ids.has(id)) throw Error("Duplicate node id: " + id);
      ids.add(id);
      const role = str(n.role, "role"),
        claim = n.claim === undefined ? undefined : str(n.claim, "claim"),
        reasoning =
          n.reasoning === undefined ? undefined : str(n.reasoning, "reasoning"),
        draftText =
          n.draftText === undefined ? undefined : str(n.draftText, "draftText");
      if (!claim || !reasoning) {
        if (
          claim ||
          reasoning ||
          !allowMigratedUnmapped ||
          d.status !== "draft" ||
          !draftText
        )
          throw Error("Claim/reasoning-free points are migration-only drafts");
        unmapped = true;
      }
      const noteUses = arr(n.noteUses, "noteUses").map((v) => {
        const u = obj(v, "note use");
        strict(u, ["noteId", "function", "handling", "coverage"], "note use");
        const nid = str(u.noteId, "noteId"),
          coverage = u.coverage;
        if (coverage !== "primary" && coverage !== "reference")
          throw Error("Invalid coverage");
        const note = ns.find((x) => x.id === nid),
          currentNote =
            note && sourceRegistry ? fresh(note, sourceRegistry) : note;
        if (!currentNote) {
          unresolved = true;
          if (d.status === "approved") throw Error("Unknown note: " + nid);
        } else if (
          !["quotation", "paraphrase", "summary"].includes(currentNote.kind)
        ) {
          throw Error("Non-citable note kind used as outline evidence: " + nid);
        } else if (currentNote.review.state !== "verified") {
          unresolved = true;
          if (d.status === "approved") throw Error("Note not verified: " + nid);
        }
        if (coverage === "primary") {
          if (prim.has(nid)) throw Error("Duplicate primary note use: " + nid);
          prim.add(nid);
        } else refs.add(nid);
        return {
          noteId: nid,
          function: str(u.function, "function"),
          handling: str(u.handling, "handling"),
          coverage: coverage as "primary" | "reference",
        };
      });
      if (!noteUses.length && role !== "transition") unresolved = true;
      if (role === "transition" && noteUses.length)
        throw Error("Transition cannot use notes");
      return {
        id,
        kind: "point",
        role,
        ...(claim ? { claim } : {}),
        ...(reasoning ? { reasoning } : {}),
        noteUses,
        ...(n.targetParagraphCount === undefined
          ? {}
          : { targetParagraphCount: Number(n.targetParagraphCount) }),
        ...(draftText ? { draftText } : {}),
      };
    });
  const items = nodes(arr(d.items, "items"));
  for (const id of refs)
    if (!prim.has(id)) throw Error("Reference use requires primary use: " + id);
  if (
    d.status === "approved" &&
    (t.status !== "approved" || unmapped || unresolved)
  )
    throw Error("Approval requires approved thesis and resolved evidence");
  return {
    schemaVersion: 1,
    article,
    researchQuestion: str(d.researchQuestion, "researchQuestion"),
    thesis: {
      text: str(t.text, "thesis"),
      status: t.status as Outline["thesis"]["status"],
    },
    status: d.status as Outline["status"],
    items,
  };
}
function outlinePath(r: string, a: string): string {
  return join(r, "articles", slug(a) + ".outline.json");
}
function frozenPath(r: string, a: string): string {
  return join(r, "articles", slug(a) + ".notes.json");
}
export function writeOutline(r: string, x: unknown): Outline {
  const d = obj(x, "outline"),
    ns = library(r),
    registry = d.status === "approved" ? sources(r) : undefined,
    o = validateOutline(x, ns, registry, true);
  const collectUnmapped = (outline: Outline): Point[] => {
    const found: Point[] = [];
    const walk = (items: Array<Section | Point>) =>
      items.forEach((node) =>
        node.kind === "section"
          ? walk(node.items)
          : node.role === "unmapped"
            ? found.push(node)
            : undefined,
      );
    walk(outline.items);
    return found;
  };
  const unmapped = collectUnmapped(o);
  if (unmapped.length) {
    const path = outlinePath(r, o.article.slug);
    if (!existsSync(path))
      throw Error("Unmapped points can only come from article migration");
    const previous = validateOutline(read(path), ns, undefined, true);
    const previousUnmapped = collectUnmapped(previous);
    if (previous.status !== "draft" || !previousUnmapped.length)
      throw Error("Unmapped points can only come from article migration");
    for (const point of unmapped)
      if (
        !previousUnmapped.some(
          (old) => JSON.stringify(old) === JSON.stringify(point),
        )
      )
        throw Error(
          "Unmapped points must be preserved from the migrated draft",
        );
  }
  save(outlinePath(r, o.article.slug), o);
  return o;
}
function getOutline(r: string, a: string): Outline {
  const p = outlinePath(r, a);
  if (!existsSync(p)) throw Error("Outline missing: " + p);
  const value = read(p);
  const raw = obj(value, "outline");
  let notes = library(r);
  const snapshot = frozenPath(r, a),
    hasSnapshot = raw.status === "approved" && existsSync(snapshot);
  if (hasSnapshot) {
    notes = arr(
      obj(read(snapshot), "notes snapshot").notes,
      "snapshot notes",
    ).map(parseNote);
  }
  return validateOutline(
    value,
    notes,
    raw.status === "approved" && !hasSnapshot ? sources(r) : undefined,
    true,
  );
}
export function renderOutline(r: string, a: string): string {
  const o = getOutline(r, a),
    lines = [
      "<!-- Generated from canonical outline JSON; do not edit. -->",
      "<!-- Status: " + o.status + " -->",
      "# " + o.article.title,
      "",
      "Research question: " + o.researchQuestion,
      "",
      "Thesis (" + o.thesis.status + "): " + o.thesis.text,
      "",
    ];
  const walk = (items: Array<Section | Point>, d: number) => {
    let sectionIndex = 0;
    items.forEach((n) => {
      if (n.kind === "section") {
        lines.push(
          "#".repeat(Math.min(d + 1, 6)) +
            " " +
            ++sectionIndex +
            ". " +
            n.title,
          "",
          "<!-- " + n.purpose + " | " + n.thesisContribution + " -->",
          "",
        );
        walk(n.items, d + 1);
      } else {
        lines.push("- " + n.role + (n.claim ? ": " + n.claim : " (unmapped)"));
        if (n.reasoning) lines.push("  - Reasoning: " + n.reasoning);
        for (const u of n.noteUses)
          lines.push(
            "  - Note " +
              u.noteId +
              " (" +
              u.coverage +
              "): " +
              u.function +
              "; " +
              u.handling,
          );
        if (n.draftText) lines.push("  - Draft text: " + n.draftText);
      }
    });
  };
  walk(o.items, 1);
  const p = join(r, "articles", slug(a) + ".outline.md");
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, lines.join("\n").trimEnd() + "\n", "utf8");
  return p;
}
export function snapshotNotes(r: string, a: string): string {
  const o = getOutline(r, a);
  if (o.status !== "approved") throw Error("Outline must be approved");
  const ids = new Set<string>();
  const walk = (xs: Array<Section | Point>) =>
    xs.forEach((n) =>
      n.kind === "section"
        ? walk(n.items)
        : n.noteUses.forEach((u) => ids.add(u.noteId)),
    );
  walk(o.items);
  const ns = library(r),
    chosen = [...ids].map((id) => {
      const n = ns.find((x) => x.id === id);
      if (!n) throw Error("Missing note: " + id);
      const c = fresh(n, sources(r));
      if (c.review.state !== "verified")
        throw Error("Stale or unchecked note: " + id);
      return c;
    });
  const p = frozenPath(r, a);
  save(p, { schemaVersion: 1, article: o.article, notes: chosen });
  return p;
}
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
export function migrateArticleOutline(
  r: string,
  a: string,
  m: { title?: string; targetLanguage?: string; citationStyle?: string },
): Outline {
  const out = outlinePath(r, a);
  if (existsSync(out)) throw Error("Outline already exists: " + out);
  const md = join(r, a);
  if (!existsSync(md)) throw Error("Article Markdown missing: " + a);
  const source = readFileSync(md, "utf8"),
    roots: Array<Section | Point> = [],
    stack: Array<{ level: number; section: Section }> = [];
  let pending: string[] = [],
    seq = 0;
  const flush = () => {
    const text = pending.join("\n");
    pending = [];
    if (text.trim()) {
      const point: Point = {
        id: "unmapped-" + ++seq,
        kind: "point",
        role: "unmapped",
        noteUses: [],
        draftText: text,
      };
      if (stack.length) stack[stack.length - 1]!.section.items.push(point);
      else roots.push(point);
    }
  };
  for (const line of source.split(/\r?\n/)) {
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      flush();
      const level = h[1]!.length,
        s: Section = {
          id: "section-" + ++seq,
          kind: "section",
          title: h[2]!,
          purpose: "Requires researcher review",
          thesisContribution: "Unassigned",
          items: [],
        };
      while (stack.length && stack[stack.length - 1]!.level >= level)
        stack.pop();
      if (stack.length) stack[stack.length - 1]!.section.items.push(s);
      else roots.push(s);
      stack.push({ level, section: s });
    } else if (!line.trim()) flush();
    else pending.push(line);
  }
  flush();
  const value: Outline = {
    schemaVersion: 1,
    article: {
      slug: slug(a),
      title: m.title ?? basename(a).replace(/\.[^.]+$/, ""),
      targetLanguage: m.targetLanguage ?? "unknown",
      citationStyle: m.citationStyle ?? "unknown",
    },
    researchQuestion: "Requires researcher input",
    thesis: { text: "Requires researcher input", status: "proposed" },
    status: "draft",
    items: roots,
  };
  save(out, value);
  return value;
}
export function markResearchNotesStale(
  root: string,
  refreshed: Array<{ sourceId: string; sourceFingerprint?: string }>,
): void {
  const path = noteFile(root);
  if (!existsSync(path)) return;
  const current = library(root);
  const next = current.map((note) => {
    if (!note.sourceRef) return note;
    const source = refreshed.find((entry) => entry.sourceId === note.sourceRef);
    if (
      !source ||
      (source.sourceFingerprint &&
        note.anchor?.sourceFingerprint !== source.sourceFingerprint)
    )
      return { ...note, review: { state: "stale" as const } };
    return note;
  });
  save(path, { schemaVersion: 1, notes: next });
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
      reason: error instanceof Error ? error.message : String(error),
      findings: [],
    };
  }
}
