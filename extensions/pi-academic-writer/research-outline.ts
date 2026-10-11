import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { resolveInside, writeFileAtomic } from "../lib/fs-safe.js";
import { fenceAfter } from "../lib/markdown.js";
import {
  obj,
  strict,
  str,
  arr,
  read,
  save,
  slug,
  sources,
  type Note,
  type Point,
  type Section,
  type Outline,
} from "./research-core.js";
import { parseNote, library, fresh } from "./research-notes.js";

export function validateOutline(
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

export function outlinePath(r: string, a: string): string {
  return join(r, "articles", slug(a) + ".outline.json");
}

export function frozenPath(r: string, a: string): string {
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

export function getOutline(r: string, a: string): Outline {
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
  writeFileAtomic(p, lines.join("\n").trimEnd() + "\n");

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

export function migrateArticleOutline(
  r: string,
  a: string,
  m: { title?: string; targetLanguage?: string; citationStyle?: string },
): Outline {
  const out = outlinePath(r, a);

  if (existsSync(out)) throw Error("Outline already exists: " + out);
  const md = resolveInside(r, a);

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

  let fence: string | null = null;

  for (const line of source.split(/\r?\n/)) {
    const inCode = fence !== null;
    fence = fenceAfter(line, fence);

    const h =
      inCode || fence !== null ? null : /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);

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
    } else if (!line.trim() && fence === null) flush();
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
