---
name: academic-edit
description: "Edit a drafted article, from one narrowly scoped section to multiple sections or structural revisions. Use when revising, correcting, or restructuring existing article text."
allowed-tools: bash read write find grep subagent pi_academic_read_resource pi_academic_status pi_academic_health pi_academic_get_profile pi_academic_article_paths pi_academic_list_project_files pi_academic_extract_document pi_academic_import_docx pi_academic_audit_citations pi_academic_count_words pi_academic_resolve_csl pi_academic_export_article pi_academic_generate_docx pi_academic_ingest_sources pi_academic_migrate_article_outline pi_academic_write_outline pi_academic_render_outline pi_academic_review_research_notes pi_academic_snapshot_notes pi_academic_query_research pi_academic_snapshot_citations pi_academic_diagnose_outline pi_academic_lint_prose
metadata: { author: "Yotam Fromm", version: "0.2.21" }
---

# Academic Writer — Edit Article

## Single-section route

When the request is limited to one named section, read `references/section-mode.md` first and apply its scope clarification, preservation, failure-recovery, and routing rules. Continue through this skill’s edit and audit contracts; the reference is an entrypoint, not a separate writer or a bypass around the structured edit gate.

You are an editing assistant. The researcher has a previously written article (from `/skill:academic-write` or any .docx/.md file) and wants to revise it.

## Voice profile load (first step of every run)

Call `pi_academic_read_resource` with `name: voice_profile_load`, then follow that contract exactly.

---

## Load Profile

Call `pi_academic_get_profile`.

If it returns `ok: false`: "Run `/skill:academic-setup` first."

**Load the full `styleFingerprint`** — every edit must maintain the researcher's voice.

Call `pi_academic_read_resource` with `name: run_state_contract`, then create or update `.pi-academic/runs/<run-id>.json` for this edit run. Update it after every major phase and before any blocked/failed/complete stop. Never create `.pi-academic/` here if the profile was missing — `init`/`setup` own first creation.

Print fingerprint summary to confirm it's loaded.

### Voice Source Hierarchy

1. **Canonical Runtime Source of Truth**: `.pi-academic/profile.md` (`styleFingerprint` object).
2. **Optional Prose Overlay**: `.pi-academic/voice/profile.md` in project root.
3. **Intermediate Mining Artifact**: `.pi-academic/voice/fingerprint.md` is NOT runtime source of truth.

---

## Load the Article

Ask the researcher:

> "Which article do you want to edit? You can:
>
> - Point me to a file (e.g., `~/Desktop/article.docx` or a markdown file)
> - Paste the text directly
> - Tell me to use the most recent article from this session"

For a `.docx`, call `pi_academic_import_docx` (it keeps footnotes as `[^n]` definitions and writes `articles/<slug>.md`), then work from that markdown file; if the file is outside the project, ask the researcher to copy it in first. For markdown, PDF, or text files, call `pi_academic_extract_document` with `path: FILE_PATH` and use the returned text. If extraction or import fails, stop and report the tool's error.

An article may begin with a YAML metadata block (`pi_academic_read_resource`, `name: article_metadata`). Keep it as it is unless the researcher asks to change a field, and do not add the title again as a heading when the block already has `title:`.

Parse the article into sections and paragraphs. Identify all footnotes/citations.

## Make scope visible before editing

Classify the request as **local** (prose, citation, or style within existing argument) or **structural** (argument, evidence, section order, or outline). If unclear, ask one concise scope question before changing content. For local work, name the selected paragraphs/writing units and what will remain unchanged; do not rebuild the outline or refresh snapshots unless a required evidence/argument change makes it necessary. For structural work, present the proposed outline change and exact affected sections/units and obtain approval before refreshing article assets or dispatching rewrites. Regenerate only affected units and preserve untouched prose, headings, and citation assets.

For migration, show the draft mapping and unmapped paragraphs. Migration does not alter source Markdown, approve an outline, or trigger section rewrites; ask which units, if any, the researcher wants changed. If any operation fails, report what failed, the authoritative artifact, whether article text changed, and one concrete recovery action. Preserve artifacts on migration conflict; stop drafting if either snapshot fails.

## Structured Edit Gate

Resolve the article Markdown path. If `articles/<slug>.outline.json` exists, read its canonical recursive structure. Otherwise, for an existing Markdown article call `pi_academic_migrate_article_outline({article: MD_PATH, title, targetLanguage, citationStyle})`; it preserves Markdown and creates draft-only unmapped points containing exact existing paragraphs. For non-Markdown input first preserve a Markdown copy for migration; do not pretend conversion is a reviewed outline. A migration conflict means inspect the existing outline rather than overwrite it.

For structural or argument/evidence changes, edit the canonical outline JSON first using pi_academic_write_outline (draft status), mapping affected points to reviewed note IDs and direct claims/reasoning. Call pi_academic_render_outline({article: MD_PATH}), present generated Markdown and the exact selected note texts, original sources and locators. Require explicit researcher confirmation of selected source-backed notes before pi_academic_review_research_notes({noteIds, state: "verified"}). Count distinct mapped source-backed note IDs; below `thresholds.json:sources.minPerArticle` (default 3), resolve with the researcher before approval. Obtain explicit approval of the thesis/outline before setting both statuses approved and rerendering. Then snapshot citations and selected notes via pi_academic_snapshot_citations and pi_academic_snapshot_notes; if either fails, do not dispatch. No new current-run source may enter the article context after this freeze.
After rendering the revised outline and before researcher approval, call `pi_academic_diagnose_outline({article: MD_PATH})` and address its findings. If the current researcher evidence map includes `chapter_coverage`, pass that map as `evidenceMapJson`; coverage is not part of the canonical outline schema. The result is advisory only: it does not judge argument quality or approve the outline.

Dispatch only affected section IDs with direct point children (nested sections are independent tasks) via section_bundle. Provide each writer MD_PATH, sectionId, edit instructions, current target prose and contextual article details only; it reads frozen notes and source metadata itself. The existing article Markdown remains the preserved text source until the selected units actually pass the full paragraph/editor pipeline. Replace only those units; leave unaffected paragraphs, citations, and headings unchanged. Mechanical citation/tone-only edits that do not change the argument still use the editor gate for altered cited sentences and do not rewrite other paragraphs.

---

## Mandatory Edit Router (Step 0)

Before choosing an edit mode, ask the researcher:

> "Are you editing the **whole article** or **one specific section**?"

1. **If Whole Article**: Proceed to "Understand the Edit Request" across all sections.
2. **If One Specific Section**:
   - Ask: "Which section? (Provide section title, number, or paste the text)."
   - Scope all subsequent edits, writer spawns, and auditing strictly to that target section (plus adjacent section context for transition/repetition checks).

---

## Load the Source Registry (citation-verification prerequisite)

Citation verification checks bibliographic metadata against the article's source snapshot.

**Search Order for Source Snapshots:**

1. **Article-local snapshot (Primary)**: `articles/<slug>.sources.json` and `articles/<slug>.bibliography.bib` (via `pi_academic_snapshot_citations`).
2. **Current-run cache (Fallback)**: `.pi-academic/sources.json` and `.pi-academic/bibliography.bib`.
3. **Local Sources Ingest**: For unindexed local files, call `pi_academic_ingest_sources` to index `.pi-academic/sources/`.

```bash
cat articles/<slug>.sources.json 2>/dev/null || cat .pi-academic/sources.json 2>/dev/null || echo "MISSING"
```

- **If no snapshot is found**, tell the researcher:
  > "I don't have a current source registry for this article, so citation verification (Check D) will be limited — I can verify against Zotero/local source reads, but not against confirmed bibliographic metadata. Want me to re-run the researcher on this article's sources first?"
- If the researcher agrees, spawn the researcher on cited sources for current-run cache/unchecked candidates. Do not treat a newly populated cache as the article snapshot; after explicit outline/note approval the orchestrator freezes citations and notes together.
- If the researcher declines, proceed but warn that Check D will be skipped for unindexed sources.

---

## Understand the Edit Request

Ask:

> "What would you like to change? You can ask me to:
>
> - **Revise a section** — rewrite or restructure a specific section
> - **Fix citations** — verify, add, or correct footnotes
> - **Adjust tone** — make it more/less formal, assertive, cautious, etc.
> - **Restructure** — reorder sections, split/merge paragraphs, add/remove sections
> - **Strengthen argument** — tighten the logic, add evidence, address counterarguments
> - **Cut/expand** — shorten or lengthen specific sections
> - **Full review** — run the complete synthesis + style compliance pass on the whole article"

---

## Existing-Draft Audit Mode (Default Strategy)

When auditing or revising an existing draft:

1. **Preserve Paragraphs by Default**: Treat original paragraphs as valid prose unless an edit or audit failure requires changes.
2. **Spawn Editor per Paragraph**: Run an `editor` subagent in audit mode (`mode: "audit"`) on each paragraph to verify citations and anti-AI/quality guidelines.
3. **Selective Rewriting**: Keep original paragraph text intact if the editor returns `verdict: PASS`. Rewrite ONLY paragraphs that return `FAIL`/`PARTIAL` or passages the researcher explicitly requested to rewrite.
   For an English prose-style cleanup request, call `pi_academic_lint_prose({text: SELECTED_TEXT, language: targetLanguage})` on the selected writing units, then review matches in context. Preserve scope, evidence, citations, qualifications, and the researcher's voice; a match alone never authorizes a rewrite. Do not invoke this style check as part of mechanical proofreading.

---

## Edit Modes

### Mode A: Section-Level Edit

**Use your subagent-dispatch tool to spawn a `writer` subagent** for each section being revised. The writer runs the full skill pipeline (draft revision → style compliance → Hebrew grammar → repetition check → citation audit) and overwrites `articles/<slug>/sections/<sectionId>.md` via `pi_academic_write_section`.

Pass MD_PATH, sectionId, requested edit instructions, current target text, citationStyle, targetLanguage, tools, and the current text of unchanged adjacent sections (sections revised in the same wave may change; do not rely on their wording). The writer fetches its authoritative point/evidence bundle via pi_academic_query_research({operation: "section_bundle", article: MD_PATH, sectionId}). Do not pass a flat section spec or mutable project note library. After each writer returns, splice the written section file's content into `MD_PATH` in place of the existing section body — from the section heading to the next same-or-higher heading.

Read the `dispatch_contract` resource (`pi_academic_read_resource`) for the exact call shape on this harness.

For multiple sections being edited, **spawn one `writer` per section in parallel**: under OMP, one `task` call with a `tasks` entry per section; under pi, sibling `subagent` calls in one response.

### Mode B: Citation Fix

**Use your subagent-dispatch tool to spawn `editor` subagents in audit mode (`mode: "audit"`)** — one per section that needs citation work. Under OMP, batch them in one `task` call; under pi, issue sibling `subagent` calls.

Read the `dispatch_contract` resource (`pi_academic_read_resource`) for the exact call shape on this harness.

Pass as prompt: the paragraph text, sectionIndex, paragraphIndex, tools.

The editor verifies every footnote and returns specific fix instructions. Apply fixes, then re-audit. Pass the `auditor_result` schema as `outputSchema`.

### Mode C: Tone / Style Adjustment

Re-read the `styleFingerprint`. For each paragraph being adjusted:

1. Score current paragraph against fingerprint (10 dimensions)
2. Apply the requested tone change while keeping fingerprint compliance
3. Use `representativeExcerpts` as style targets
4. Run the Hebrew grammar check when Hebrew text changed.
   Before dispatching, read the `dispatch_contract` resource (`pi_academic_read_resource`) and pass its `auditor_result` schema as `outputSchema` (on omp use `schemaMode: "strict"`).

5. **Citation hard gate (mandatory):** a tone rewrite mutates the wording of already-cited sentences. For every paragraph whose cited sentence(s) were altered, **use your subagent-dispatch tool to spawn an `editor` subagent in audit mode (`mode: "audit"`)** (pass the revised paragraph text, sectionIndex, paragraphIndex, tools) and gate on `verdict: PASS` in the editor's structured result — exactly as Modes A/B/E do. If the editor rejects, fix the citation and re-audit before finalizing. Do NOT ship a tone-adjusted paragraph whose citations have not re-passed the audit.

If the researcher wants tone that differs from their fingerprint (e.g., "make this more polemical even though my usual style is measured"), note the deviation and apply it as a conscious choice.

### Mode D: Restructure

Show the current recursive outline and selected original paragraphs. Reorder, split, merge, add or remove nodes in the canonical JSON as a draft, preserving existing Markdown. Render and present the revised outline for explicit approval; verify selected notes and freeze article citation/note assets as in Structured Edit Gate. Dispatch only new or substantively changed sections with direct points. Do not rewrite headings-only sections or untouched paragraphs. Reassemble in outline order and ask the editor (review mode) to review transitions, keeping unaffected prose and citations intact.

### Mode E: Strengthen Argument

1. Identify weak points in the argument:
   - Claims without evidence
   - Evidence without analysis
   - Missing counterargument engagement
   - Logical gaps between sections

2. **Spawn research subagents in parallel** to find additional evidence (one batched `task` call under OMP; sibling `subagent` calls under pi; call shape in the `dispatch_contract` resource):
   - If `tools.zotero.enabled`: one `agent: "researcher"` dispatch for Zotero document reads, passing `tools.zotero.collection` when configured so searches stay in the project collection

3. Draft new evidence integration and re-run citation audit

### Mode F: Cut / Expand

**Cut:** Identify redundancies and weak passages. Remove while preserving argument flow. Re-run the editor (review mode) for transitions. **Citation hard gate (mandatory):** cutting can splice or reword surviving cited sentences (e.g., when two sentences merge or a citation's anchoring clause is trimmed). For every paragraph whose cited sentence(s) were altered by the cut, read the `dispatch_contract` resource and spawn an `editor` in audit mode (`mode: "audit"`) with the `auditor_result` schema as `outputSchema` (on omp also `schemaMode: "strict"`), pass revised paragraph text, sectionIndex, paragraphIndex, and tools, then gate on `verdict: PASS`. If rejected, restore/fix the citation and re-audit before finalizing.

**Expand:** Spawn research subagents to find additional material, then spawn the writer for the expanded passages. The writer already runs the editor hard gate (audit mode) on every paragraph it produces (including any cited sentences it rewrites), so the expand path is covered by the writer pipeline.

### Mode G: Full Review

**Use your subagent-dispatch tool to spawn the `editor` subagent in review mode (`mode: "review"`)** on the complete article. Pass as prompt: MD_PATH (the assembled article), thesis, the complete styleFingerprint, articleStructure conventions, the linkingWords reference, targetLanguage, tools.

Read the `dispatch_contract` resource (`pi_academic_read_resource`) for the exact call shape on this harness.

This runs:

1. Argument coherence review
2. Logical flow check
3. Full-article style fingerprint compliance (all dimensions)
4. Cross-section repetition check
5. Transition quality

Present revision notes to the researcher for approval before applying. On approval, write the editor's `revisedArticle` (from the `editor_review_result` schema) to `MD_PATH` verbatim — review revisions are applied unchanged, never re-drafted.

---

## Output

After edits are applied:

1. Show a diff summary:

   > **Changes made:**
   >
   > - Section 2, paragraph 3: [what changed and why]
   > - Section 4: [restructured / rewritten / expanded]
   > - Citations: [N] verified, [N] corrected, [N] added

2. Ask:

   > "Would you like me to:
   >
   > - Export the revised article as .docx?
   > - Make additional changes?
   > - Run a full review on the revised version?"

3. If exporting to .docx, call `pi_academic_read_resource` with `name: citation_export_contract`, then branch by `citationStyle` first:

**Detect citeproc mode:** literal mode is only `citationStyle: inline-parenthetical`. Any other `citationStyle` is citeproc mode. If the profile is unavailable/stale, call `pi_academic_extract_document` on the markdown and treat any `[@citeKey]` Pandoc marker as citeproc mode.

**Before DOCX generation:** write the revised markdown to `$MD_PATH`, then call `pi_academic_audit_citations` with `article: MD_PATH` and the active `citationStyle`. Continue only when `status` is `passed`; for `failed`, report the exact missing/wrong-mode citation details, and for `error`, report the operational error. In either case stop and set the run state to `failed`.

**`inline-parenthetical`:** Call `pi_academic_generate_docx` directly with `articles/<slug>.md` as `input` and `$DOCX_PATH` as `output`.

Same current limitation as write-article Step 9b: the citeproc export path (`pi_academic_export_article`) does not set right-to-left document direction. If a researcher pairs `targetLanguage: Hebrew` with a citeproc CSL style, the exported `.docx` may need manual RTL adjustment unless their CSL/pandoc template handles it.

---

## Critical Rules

- **NEVER remove citations** without the researcher's explicit approval
- **NEVER change the thesis** unless specifically asked
- **Every new claim AND every modification to an already-cited sentence must pass the citation audit hard gate** — this includes tone rewrites (Mode C) and cut/expand rewrites (Mode F), not only newly added claims
- Maintain the style fingerprint unless the researcher explicitly overrides
- Show changes before applying destructive edits (section removal, major rewrites)
