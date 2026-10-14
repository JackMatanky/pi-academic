import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import { Type } from "typebox";

import {
  resolveInside,
  writeFileAtomic,
  withFileLock,
} from "../lib/fs-safe.js";
import { fenceAfter } from "../lib/markdown.js";
import {
  isValid,
  JsonValueSchema,
  parseJsonText,
  parseWith,
  readJsonFile,
  type JsonValue,
} from "../lib/schema.js";
import {
  articleSlug,
  CITABLE_NOTE_KINDS,
  OutlineShellSchema,
  PointSchema,
  readSourceRefs,
  saveJson,
  SectionShellSchema,
  type Note,
  type Outline,
  type OutlineItem,
  type Point,
  type Section,
  type SourceRef,
} from "./research-core.js";
import { fresh, library, parseNote } from "./research-notes.js";

const SectionKind = Type.Object({ kind: Type.Literal("section") });

const PointKind = Type.Object({ kind: Type.Literal("point") });

const NoteSnapshotSchema = Type.Object({
  notes: Type.Array(JsonValueSchema),
});

/**
 * Discriminates an outline's raw JSON value by its approval status.
 */
const StatusProbe = Type.Object({ status: Type.Literal("approved") });

/**
 * Decodes an outline and checks it against the note library.
 *
 * Approved outlines must have an approved thesis and only cite verified,
 * citable notes; drafts may leave evidence unresolved. Points without claim and
 * reasoning are accepted only as migrated drafts.
 *
 * @param value - Raw outline JSON payload.
 * @param notes - Loaded note library to validate citations against.
 * @param sourceRegistry - Optional source registry for freshness verification.
 * @param allowMigratedUnmapped - Whether to accept unmapped points from
 *   migrated drafts.
 *
 * @returns Validated canonical outline.
 * @throws With the first rule the outline breaks.
 */
export function validateOutline(
  value: JsonValue,
  notes: Note[],
  sourceRegistry?: SourceRef[],
  allowMigratedUnmapped = false,
): Outline {
  const shell = parseWith(OutlineShellSchema, value, "outline");
  const approved = shell.status === "approved";
  const nodeIds = new Set<string>();
  const primaryNotes = new Set<string>();
  const referencedNotes = new Set<string>();
  let hasUnmapped = false;
  let hasUnresolved = false;

  const decodePoint = (raw: JsonValue): Point => {
    const point = parseWith(PointSchema, raw, "point");

    if (nodeIds.has(point.id))
      throw new Error("Duplicate node id: " + point.id);
    nodeIds.add(point.id);

    if (!point.claim || !point.reasoning) {
      if (
        point.claim ||
        point.reasoning ||
        !allowMigratedUnmapped ||
        shell.status !== "draft" ||
        !point.draftText
      )
        throw new Error(
          "Claim/reasoning-free points are migration-only drafts",
        );
      hasUnmapped = true;
    }

    for (const use of point.noteUses) {
      const note = notes.find((candidate) => candidate.id === use.noteId);

      const current =
        note && sourceRegistry ? fresh(note, sourceRegistry) : note;

      if (!current) {
        hasUnresolved = true;

        if (approved) throw new Error("Unknown note: " + use.noteId);
      } else if (!CITABLE_NOTE_KINDS.includes(current.kind)) {
        throw new Error(
          "Non-citable note kind used as outline evidence: " + use.noteId,
        );
      } else if (current.review.state !== "verified") {
        hasUnresolved = true;

        if (approved) throw new Error("Note not verified: " + use.noteId);
      }

      if (use.coverage === "primary") {
        if (primaryNotes.has(use.noteId))
          throw new Error("Duplicate primary note use: " + use.noteId);
        primaryNotes.add(use.noteId);
      } else {
        referencedNotes.add(use.noteId);
      }
    }

    if (point.noteUses.length === 0 && point.role !== "transition")
      hasUnresolved = true;

    if (point.role === "transition" && point.noteUses.length > 0)
      throw new Error("Transition cannot use notes");

    return point;
  };

  const decodeItems = (raws: JsonValue[]): OutlineItem[] =>
    raws.map((raw): OutlineItem => {
      if (isValid(SectionKind, raw)) {
        const section = parseWith(SectionShellSchema, raw, "section");

        if (nodeIds.has(section.id))
          throw new Error("Duplicate node id: " + section.id);
        nodeIds.add(section.id);

        return { ...section, items: decodeItems(section.items) };
      }

      if (isValid(PointKind, raw)) return decodePoint(raw);

      throw new Error("Node kind must be section or point");
    });

  const items = decodeItems(shell.items);

  for (const noteId of referencedNotes)
    if (!primaryNotes.has(noteId))
      throw new Error("Reference use requires primary use: " + noteId);

  if (
    approved &&
    (shell.thesis.status !== "approved" || hasUnmapped || hasUnresolved)
  )
    throw new Error("Approval requires approved thesis and resolved evidence");

  return { ...shell, items };
}

/**
 * Path of an article's canonical outline JSON.
 *
 * @param projectRoot - Root directory of the project.
 * @param article - Article file name or relative path.
 *
 * @returns Absolute path to `articles/<slug>.outline.json`.
 */
export function outlinePath(projectRoot: string, article: string): string {
  return join(projectRoot, "articles", articleSlug(article) + ".outline.json");
}

/**
 * Path of an article's frozen note snapshot.
 *
 * @param projectRoot - Root directory of the project.
 * @param article - Article file name or relative path.
 *
 * @returns Absolute path to `articles/<slug>.notes.json`.
 */
export function frozenPath(projectRoot: string, article: string): string {
  return join(projectRoot, "articles", articleSlug(article) + ".notes.json");
}

function collectUnmapped(items: OutlineItem[]): Point[] {
  return items.flatMap((item) => {
    if (item.kind === "section") return collectUnmapped(item.items);

    return item.role === "unmapped" ? [item] : [];
  });
}

function readOutlineJson(path: string): JsonValue {
  return parseWith(
    JsonValueSchema,
    parseJsonText(readFileSync(path, "utf8")),
    path,
  );
}

/**
 * Validates and saves an outline. Unmapped points are only accepted when they
 * are preserved from a migrated draft.
 *
 * @param projectRoot - Root directory of the project.
 * @param value - Raw outline JSON payload.
 *
 * @returns Validated and persisted canonical outline.
 * @throws When outline validation fails or unmapped points are unpreserved.
 */
export async function writeOutline(
  projectRoot: string,
  value: JsonValue,
): Promise<Outline> {
  const notes = library(projectRoot);

  const registry = isValid(StatusProbe, value)
    ? readSourceRefs(projectRoot)
    : undefined;

  const outline = validateOutline(value, notes, registry, true);
  const unmapped = collectUnmapped(outline.items);
  const path = outlinePath(projectRoot, outline.article.slug);

  return withFileLock(path, () => {
    if (unmapped.length > 0) {
      if (!existsSync(path))
        throw new Error("Unmapped points can only come from article migration");

      const previous = validateOutline(
        readOutlineJson(path),
        notes,
        undefined,
        true,
      );

      const previousUnmapped = collectUnmapped(previous.items);

      if (previous.status !== "draft" || previousUnmapped.length === 0)
        throw new Error("Unmapped points can only come from article migration");

      for (const point of unmapped)
        if (
          !previousUnmapped.some(
            (old) =>
              old.id === point.id &&
              old.role === point.role &&
              old.draftText === point.draftText &&
              old.claim === point.claim &&
              old.reasoning === point.reasoning,
          )
        )
          throw new Error(
            "Unmapped points must be preserved from the migrated draft",
          );
    }

    saveJson(path, outline);

    return outline;
  });
}

/**
 * Loads an article's outline, validating approved ones against the frozen note
 * snapshot when one exists.
 *
 * @param projectRoot - Root directory of the project.
 * @param article - Article file name or relative path.
 *
 * @returns Validated canonical outline.
 * @throws When the outline is missing or invalid.
 */
export function getOutline(projectRoot: string, article: string): Outline {
  const path = outlinePath(projectRoot, article);

  if (!existsSync(path)) throw new Error("Outline missing: " + path);

  const value = readOutlineJson(path);
  const approved = isValid(StatusProbe, value);
  const snapshot = frozenPath(projectRoot, article);
  const hasSnapshot = approved && existsSync(snapshot);

  const notes = hasSnapshot
    ? readJsonFile(snapshot, NoteSnapshotSchema, "notes snapshot").notes.map(
        parseNote,
      )
    : library(projectRoot);

  return validateOutline(
    value,
    notes,
    approved && !hasSnapshot ? readSourceRefs(projectRoot) : undefined,
    true,
  );
}

/**
 * Renders the outline as read-only Markdown next to the article.
 *
 * @param projectRoot - Root directory of the project.
 * @param article - Article file name or relative path.
 *
 * @returns Path to the generated markdown file.
 */
export function renderOutline(projectRoot: string, article: string): string {
  const outline = getOutline(projectRoot, article);

  const lines = [
    "<!-- Generated from canonical outline JSON; do not edit. -->",
    "<!-- Status: " + outline.status + " -->",
    "# " + outline.article.title,
    "",
    "Research question: " + outline.researchQuestion,
    "",
    "Thesis (" + outline.thesis.status + "): " + outline.thesis.text,
    "",
  ];

  const walk = (items: OutlineItem[], depth: number) => {
    let sectionIndex = 0;

    for (const item of items) {
      if (item.kind === "section") {
        sectionIndex += 1;
        lines.push(
          "#".repeat(Math.min(depth + 1, 6)) +
            ` ${sectionIndex}. ${item.title}`,
          "",
          `<!-- ${item.purpose} | ${item.thesisContribution} -->`,
          "",
        );
        walk(item.items, depth + 1);
        continue;
      }

      lines.push(
        "- " + item.role + (item.claim ? ": " + item.claim : " (unmapped)"),
      );

      if (item.reasoning) lines.push("  - Reasoning: " + item.reasoning);

      for (const use of item.noteUses)
        lines.push(
          `  - Note ${use.noteId} (${use.coverage}): ${use.function}; ${use.handling}`,
        );

      if (item.draftText) lines.push("  - Draft text: " + item.draftText);
    }
  };

  walk(outline.items, 1);

  const path = join(
    projectRoot,
    "articles",
    articleSlug(article) + ".outline.md",
  );

  mkdirSync(dirname(path), { recursive: true });
  writeFileAtomic(path, lines.join("\n").trimEnd() + "\n");

  return path;
}

/**
 * Freezes the notes an approved outline cites into an article-local file.
 *
 * @param projectRoot - Root directory of the project.
 * @param article - Article file name or relative path.
 *
 * @returns Path to the generated snapshot file.
 * @throws When the outline is not in "approved" status.
 */
export async function snapshotNotes(
  projectRoot: string,
  article: string,
): Promise<string> {
  const outline = getOutline(projectRoot, article);

  if (outline.status !== "approved")
    throw new Error("Outline must be approved");

  const noteIds = new Set<string>();

  const collect = (items: OutlineItem[]) => {
    for (const item of items) {
      if (item.kind === "section") collect(item.items);
      else for (const use of item.noteUses) noteIds.add(use.noteId);
    }
  };

  collect(outline.items);

  const notes = library(projectRoot);
  const registry = readSourceRefs(projectRoot);

  const chosen = [...noteIds].map((id) => {
    const note = notes.find((candidate) => candidate.id === id);

    if (!note) throw new Error("Missing note: " + id);

    const current = fresh(note, registry);

    if (current.review.state !== "verified")
      throw new Error("Stale or unchecked note: " + id);

    return current;
  });

  const path = frozenPath(projectRoot, article);

  return withFileLock(outlinePath(projectRoot, outline.article.slug), () => {
    saveJson(path, {
      schemaVersion: 1,
      article: outline.article,
      notes: chosen,
    });

    return path;
  });
}

/**
 * Optional article metadata for a migrated outline.
 */
export interface OutlineMigrationOptions {
  title?: string | undefined;
  targetLanguage?: string | undefined;
  citationStyle?: string | undefined;
}

/**
 * Turns an article's headings and paragraphs into a draft outline of unmapped
 * points, leaving the article untouched.
 *
 * @param projectRoot - Root directory of the project.
 * @param article - Article file name or relative path.
 * @param options - Outline options including title, language, and citation
 *   style.
 *
 * @returns Generated draft outline with unmapped points.
 * @throws When the outline already exists or the article is missing.
 */
export function migrateArticleOutline(
  projectRoot: string,
  article: string,
  options: OutlineMigrationOptions,
): Outline {
  const outputPath = outlinePath(projectRoot, article);

  if (existsSync(outputPath))
    throw new Error("Outline already exists: " + outputPath);

  const articlePath = resolveInside(projectRoot, article);

  if (!existsSync(articlePath))
    throw new Error("Article Markdown missing: " + article);

  const roots: OutlineItem[] = [];
  const stack: Array<{ level: number; section: Section }> = [];
  let pending: string[] = [];
  let sequence = 0;

  const place = (item: OutlineItem) => {
    const parent = stack.at(-1);

    if (parent) parent.section.items.push(item);
    else roots.push(item);
  };

  const flush = () => {
    const text = pending.join("\n");

    pending = [];

    if (!text.trim()) return;

    sequence += 1;
    place({
      id: `unmapped-${sequence}`,
      kind: "point",
      role: "unmapped",
      noteUses: [],
      draftText: text,
    });
  };

  let fence: string | null = null;

  for (const line of readFileSync(articlePath, "utf8").split(/\r?\n/)) {
    const inCode = fence !== null;

    fence = fenceAfter(line, fence);

    const heading =
      inCode || fence !== null ? null : /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);

    if (heading?.[1] && heading[2]) {
      flush();
      sequence += 1;

      const level = heading[1].length;

      const section: Section = {
        id: `section-${sequence}`,
        kind: "section",
        title: heading[2],
        purpose: "Requires researcher review",
        thesisContribution: "Unassigned",
        items: [],
      };

      while ((stack.at(-1)?.level ?? 0) >= level && stack.length > 0)
        stack.pop();
      place(section);
      stack.push({ level, section });
    } else if (!line.trim() && fence === null) {
      flush();
    } else {
      pending.push(line);
    }
  }

  flush();

  const outline: Outline = {
    schemaVersion: 1,
    article: {
      slug: articleSlug(article),
      title: options.title ?? basename(article).replace(/\.[^.]+$/, ""),
      targetLanguage: options.targetLanguage ?? "unknown",
      citationStyle: options.citationStyle ?? "unknown",
    },
    researchQuestion: "Requires researcher input",
    thesis: { text: "Requires researcher input", status: "proposed" },
    status: "draft",
    items: roots,
  };

  saveJson(outputPath, outline);

  return outline;
}
