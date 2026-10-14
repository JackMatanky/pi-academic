import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { Type, type Static, type TSchema } from "typebox";

import { stringEnum } from "../../lib/schema.js";
import { NoteUpsertSchema, OutlineShellSchema } from "../research-core.js";
import { reviewResearchNotes, writeResearchNotes } from "../research-notes.js";
import {
  migrateArticleOutline,
  renderOutline,
  snapshotNotes,
  writeOutline,
} from "../research-outline.js";
import {
  decodeResearchQuery,
  diagnoseOutline,
  queryResearch,
  ResearchQuerySchema,
} from "../research-query.js";
import { reverseOutline } from "../reverse-outline.js";
import { registerTool, type ToolEffect } from "../tool-kit.js";

/**
 * A research-library tool: runs `run` and returns its value as JSON.
 */
function registerResearchTool<S extends TSchema, Result>(
  pi: ExtensionAPI,
  spec: {
    name: string;
    label: string;
    description: string;
    parameters: S;
    effect: ToolEffect;
    core?: boolean | undefined;
    run: (params: Static<S>, cwd: string) => Result | Promise<Result>;
  },
): void {
  registerTool(pi, {
    name: spec.name,
    label: spec.label,
    description: spec.description,
    parameters: spec.parameters,
    effect: spec.effect,
    core: spec.core,
    failure: `${spec.label} failed`,
    run: async (params, { cwd }) => {
      const value = await spec.run(params, cwd);

      return {
        text: JSON.stringify(value),
        details: { ok: true, value },
      };
    },
  });
}

/**
 * Registers research-note library, argument-outline, and reverse-outline tools.
 *
 * @param pi - Pi extension API used to register tools.
 */
export function registerResearchTools(pi: ExtensionAPI): void {
  registerResearchTool(pi, {
    name: "academic_writer_write_research_notes",
    effect: "write",
    label: "Write Research Notes",
    description:
      "Validate and merge note upserts into the project research-notes library.",
    parameters: Type.Object({ notesJson: Type.Array(NoteUpsertSchema) }),
    run: ({ notesJson }, cwd) => writeResearchNotes(cwd, notesJson),
  });
  registerResearchTool(pi, {
    name: "academic_writer_review_research_notes",
    effect: "write",
    label: "Review Research Notes",
    description:
      "Mark selected notes verified or unchecked after researcher confirmation.",
    parameters: Type.Object({
      noteIds: Type.Array(Type.String()),
      state: stringEnum(["unchecked", "verified"] as const),
    }),
    run: ({ noteIds, state }, cwd) => reviewResearchNotes(cwd, noteIds, state),
  });
  registerResearchTool(pi, {
    name: "academic_writer_write_outline",
    effect: "write",
    label: "Write Article Outline",
    description: "Validate and save a canonical recursive article outline.",
    parameters: Type.Object({ outlineJson: OutlineShellSchema }),
    run: ({ outlineJson }, cwd) => writeOutline(cwd, outlineJson),
  });
  registerResearchTool(pi, {
    name: "academic_writer_render_outline",
    effect: "write",
    label: "Render Article Outline",
    description: "Render generated Markdown from the canonical outline JSON.",
    parameters: Type.Object({ article: Type.String({ minLength: 1 }) }),
    run: ({ article }, cwd) => ({ path: renderOutline(cwd, article) }),
  });
  registerResearchTool(pi, {
    name: "academic_writer_snapshot_notes",
    effect: "write",
    label: "Snapshot Article Notes",
    description: "Freeze only outline-selected notes after outline approval.",
    parameters: Type.Object({ article: Type.String({ minLength: 1 }) }),
    run: async ({ article }, cwd) => ({
      path: await snapshotNotes(cwd, article),
    }),
  });
  registerResearchTool(pi, {
    name: "academic_writer_query_research",
    effect: "read",
    core: true,
    label: "Query Research Notes",
    description: "Retrieve fixed-scope research note and outline bundles.",
    parameters: ResearchQuerySchema,
    run: (params, cwd) => queryResearch(cwd, decodeResearchQuery(params)),
  });
  registerResearchTool(pi, {
    name: "academic_writer_diagnose_outline",
    effect: "read",
    label: "Diagnose Article Outline",
    description:
      "Read-only advisory checks for outline fields and linked note freshness; does not assess argument quality or change approval.",
    parameters: Type.Object({
      article: Type.String({ minLength: 1 }),
      evidenceMapJson: Type.Optional(Type.String()),
    }),
    run: ({ article, evidenceMapJson }, cwd) =>
      diagnoseOutline(cwd, article, evidenceMapJson),
  });
  registerResearchTool(pi, {
    name: "academic_writer_reverse_outline",
    effect: "read",
    label: "Reverse Outline Article",
    description:
      "Segment project article Markdown into exact heading/paragraph units as a read-only review index; interpretations remain advisory.",
    parameters: Type.Object({ article: Type.String({ minLength: 1 }) }),
    run: ({ article }, cwd) => reverseOutline(cwd, article),
  });
  registerResearchTool(pi, {
    name: "academic_writer_migrate_article_outline",
    effect: "write",
    label: "Migrate Article Outline",
    description:
      "Convert existing Markdown headings and paragraphs into a draft-only outline without changing the article.",
    parameters: Type.Object({
      article: Type.String({ minLength: 1 }),
      title: Type.Optional(Type.String()),
      targetLanguage: Type.Optional(Type.String()),
      citationStyle: Type.Optional(Type.String()),
    }),
    run: ({ article, title, targetLanguage, citationStyle }, cwd) =>
      migrateArticleOutline(cwd, article, {
        title,
        targetLanguage,
        citationStyle,
      }),
  });
}
