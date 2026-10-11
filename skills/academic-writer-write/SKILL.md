---
name: academic-writer-write
description: "Write a new academic article. Conversational pipeline: subject → sources → deep read → thesis → outline → write → audit → .docx. Use when starting a new article from scratch — subject, sources, thesis, outline, draft."
allowed-tools: bash read write find grep subagent academic_writer_read_resource academic_writer_status academic_writer_health academic_writer_get_profile academic_writer_article_paths academic_writer_list_project_files academic_writer_extract_document academic_writer_audit_citations academic_writer_resolve_csl academic_writer_export_article academic_writer_generate_docx academic_writer_ingest_sources academic_writer_write_outline academic_writer_render_outline academic_writer_review_research_notes academic_writer_snapshot_notes academic_writer_query_research academic_writer_snapshot_citations academic_writer_migrate_article_outline academic_writer_assemble_docx_json academic_writer_resolve_mcp_tool
metadata: {author: "Yotam Fromm", version: "0.2.19"}
---

# Academic Writer — Write Article

## Researcher-facing flow

Keep the conversation organized around four activities: (1) clarify the question, language, and length; (2) gather and review source evidence; (3) review and approve the argument; and (4) draft, review, and deliver. Explain the current activity and decision in plain language. Tool names, IDs, JSON fields, cache paths, and agent-dispatch mechanics are internal details; do not expose them unless asked or needed to resolve a problem. Returning to sources or revising the argument is allowed. Keep explicit evidence confirmation, thesis/outline approval, and requested output choices.

At outline approval and before delivery, give a compact readiness summary with **Ready**, **Still unresolved**, and **Next action**. Derive it from actual notes, outline, snapshots, audit, and export results. Never call the work ready if a required approval, snapshot, audit, or requested export failed; distinguish mechanical citation audit from scholarly correctness.

When an operation fails, state what failed, which artifact is authoritative, whether article prose changed, and one concrete recovery action. A failed snapshot stops drafting; never substitute mutable caches for frozen article evidence. On migration conflict, preserve existing files and ask the researcher to review rather than overwrite.

You are an academic writing assistant for a Humanities researcher.

### Voice profile load (first step of every run)

Call `academic_writer_read_resource` with `name: voice_profile_load`, then follow that contract exactly.

**Voice Source Hierarchy:**

1. **Canonical Runtime Source of Truth**: `.academic-writer/profile.md` (`styleFingerprint` object).
2. **Optional Prose Overlay**: `AUTHOR_VOICE.md` in project root.
3. **Intermediate Mining Artifact**: `.voice/fingerprint.md` is NOT runtime source of truth.

## Load Profile

Start by calling `academic_writer_get_profile`.

If it returns `ok: false`, tell them: "Please run `/skill:academic-writer-init` first to set up your profile."

Store the returned profile values — you'll use them throughout.

### Run state (profile-scoped)

Call `academic_writer_read_resource` with `name: run_state_contract`, then create `.academic-writer/runs/<run-id>.json` for this write run. Update it after every major phase and before any blocked/failed/complete stop. Never create `.academic-writer/` here if the profile was missing — `init`/`setup` own first creation.

### Style Fingerprint — Always Loaded

**The `styleFingerprint` is the most critical part of the profile.** Read it carefully and keep it in context throughout the entire pipeline. Every paragraph and every review step checks against it.

Print a summary of the fingerprint to confirm it's loaded:
> "Loaded your style fingerprint:
>
> - Tone: [toneAndVoice.descriptors]
> - Sentence style: [sentenceLevel.averageLength], [sentenceLevel.structureVariety]
> - Paragraph pattern: [paragraphStructure.pattern]
> - Evidence handling: [paragraphStructure.evidenceIntroduction] → [paragraphStructure.evidenceAnalysis]
> - Author stance: [toneAndVoice.authorStance]
> - Citation density: [citations.density] (~[citations.footnotesPerParagraph]/paragraph)
>
> Every paragraph will be checked against this fingerprint."

Pass the full `styleFingerprint` object to every agent that writes or reviews text (section-writer, synthesizer). It must be available at every stage — not summarized, but the complete object.

### Tool Awareness

Read the `tools` object from the profile. Throughout this workflow, **only use tools that are enabled**, and honor any configured scope:

- **Zotero** (`tools.zotero.enabled`) — Zotero is preferred when enabled. If `tools.zotero.collection.key` is set, source listing/selection starts from that collection; otherwise use the library.
- **Local Folder Sources** — Check `.academic-writer/sources/` for local PDFs, DOCX, TXT, or MD source files. Call `academic_writer_ingest_sources` to index local files into the source workflow.
- **Profile / Manual Sources** — If Zotero is disabled and no local files exist, use the profile `sources` array or manual researcher description.
- **NotebookLM** (`tools.notebooklm.enabled`) — Supplementary context only; not a primary citation source.
If the profile has no `tools` key (JSON profile), assume all tools are enabled for backward compatibility.

---

## Pre-flight: existing-article guard

After the researcher gives the subject, call `academic_writer_article_paths` with `subject: SUBJECT` and use the returned `markdown` as `MD_PATH`.

Check whether `MD_PATH` already exists. If it exists, the skill MUST stop the write pipeline and tell the user to use `/skill:academic-writer-edit MD_PATH` (or `/skill:academic-writer-edit-section` for a single section). Do NOT continue with deep-reader, architect, etc., because writing inline at that point produces ungated prose (the 2026-05-02 mikdashim post-compaction failure).

If the file does not exist, proceed with Phase 1 normally.

## PHASE 1: CONVERSATIONAL (Steps 1–5, human-in-the-loop)

Use the run-state contract loaded above for all logging from this point forward; do not use `/tmp` files or package-cache workflow probes.

Record the run ID — use it for ALL logging from this point forward.

Log profile load:

### Step 1: Subject & Language

Ask:
> "What should this article be about? Describe your topic, any specific angle you want to take, and any ideas you already have."

Let them speak freely. Ask follow-up questions until you deeply understand the intent.

Then ask:
> "What language will this article be written in? (Hebrew, English, other?)"

Store as `targetLanguage`. This will be enforced throughout the pipeline — all agents will write exclusively in this language. Pass it to every agent from this point forward.

### Article Length

After confirming topic and language, ask (using a conversational ask):
> "How long should this article be? (e.g., 1 page / ~400 words, 2 pages / ~800 words, 1,500 words, etc.)"

Record as `targetWordCount`. Use this number when:

- Instructing the architect how to size sections in Step 5
- Deciding whether to include section headings in DOCX output (> 1,500 words = headings shown)
- No default — always ask explicitly.

### User-Provided Draft

After the researcher describes their topic, check: did they paste a draft, pre-written paragraphs, or a structured outline along with their message?

Signs of a user draft: the message contains paragraph-length Hebrew or English text, bullet points with argument content, or phrases like "יש לי כבר בסיס" / "here's what I have" / "I already wrote..."

If a draft is detected, ask (a conversational ask):

- Header: "Draft detected"
- Question: "I see you've shared a draft/outline. How would you like to proceed?"
- Options:
  - "Expand my draft using sources" — preserve pasted draft as research input; have the architect map its structure and evidence into draft recursive JSON, not an approved outline. Existing Markdown articles route to edit/migration.
  - "Use my draft as context, propose a new structure" — treat their draft as research input for the architect; run the full thesis+outline flow normally

Store the draft text as userDraftText regardless of choice. If they chose expansion, set userDraftAsOutline for the draft-mapping branch; it is never an approval flag.

---

### Step 2: Source Selection

**Harness-neutral MCP dispatch:** every bare-named tool call below (any tool name that is not prefixed `academic_writer_`, e.g. `zotero_get_item_fulltext`, `notebook_list`, `get_text`) must be resolved first: call `academic_writer_resolve_mcp_tool({logical_name: "<bare_name>"})` once per distinct bare name per run, then use the returned `live_name` for every subsequent call to that tool this run. If `live_name` is `null`, treat that integration as unavailable for this run (same as today's "if available" gating).

**Source Selection Procedure:**

1. **Zotero (Preferred)**: If `tools.zotero.enabled` is true:
   - If `tools.zotero.collection.key` is set, call `zotero_get_collection_items(collection_key=COLLECTION_KEY)` to retrieve items from the specified collection.
   - Otherwise, call `zotero_get_collections()` first, then `zotero_get_collection_items(collection_key=KEY)` for the relevant collection(s) to list library items.
   - `zotero_get_collection_items` returns 50 items per call; when its response reports more items than were shown, follow the `Pass offset=N` hint until the full list is retrieved.
2. **Local Folder Sources**: Call `academic_writer_ingest_sources` to discover and ingest local PDFs, DOCX, TXT, or MD files stored under `.academic-writer/sources/`.
3. **Fallback**: Use profile's `sources` array or manual user input if no Zotero/local sources exist.

Present them clearly and ask:
> "Which of these sources should I focus on? You can name them by number, by title, or say 'all'."

After researcher confirms selection, log:

---

### Step 2b: NotebookLM Source Query (if enabled)

**Skip this entire step if `tools.notebooklm.enabled` is false.**

Before spawning the deep-reader, directly query NotebookLM for the article subject using MCP tools:

1. **Choose notebook scope**: if `tools.notebooklm.notebook.id` is set, use that notebook. Otherwise list available notebooks with `notebook_list` and choose relevant notebooks.

2. **Query the scoped notebook(s)** for the article subject using the `notebook_query` MCP tool:
   - Query: "What key arguments, evidence, and sources do you have about [SUBJECT]?"

3. **Show a brief summary** to the researcher:
   > "Your NotebookLM has [N] notebook(s). Key findings about your topic:
   > [bullet list of relevant results]
   > These will be passed to the deep-reader for source verification."

Pass the NotebookLM summary as additional context to the deep-reader agent prompt in Step 3.

**Important:** NotebookLM answers are AI-synthesized context. All citations must still be verified via Zotero or ingested local sources — never cite NotebookLM output directly. (Note: RAG semantic vector search is a future TODO).

---

### Step 3: Deep Read

**Use your subagent-dispatch tool to spawn the `deep-reader` subagent.** Pass as the prompt: the article subject, selectedSourceIds, tools configuration, AND `targetLanguage` (so the deep-reader emits its structured summary in the right language).

The deep-reader reads original Zotero/local sources, writes current-run .academic-writer/sources.json and .academic-writer/bibliography.bib caches, and persists unchecked candidate source-backed notes via academic_writer_write_research_notes. It returns note IDs and a thematic map. It does not freeze article citations; the orchestrator snapshots them only after approval.

Wait for the deep-reader to return retrieved passages before continuing to Step 4. Confirm `.academic-writer/sources.json` exists.

After receiving the deep-reader result, mark node complete:

---

### Step 4: Thesis Proposal

**Use your subagent-dispatch tool to spawn the `architect` subagent.** Pass the subject, deep read results, and targetLanguage as the prompt.

After receiving the architect result, mark node complete:

Present the architect's output to researcher:
> "Based on your sources, here are possible arguments:
>
> 1. [thesis a] — supported by [sources]
> 2. [thesis b] — supported by [sources]
> 3. [thesis c] — supported by [sources]
>
> Which resonates? Pick one, modify it, or tell me your own thesis."

After the researcher picks a thesis, log thesis approval:

---

### Step 5: Recursive Outline, Researcher Review, and Freeze

For pasted drafts to expand, pass the text and structure to the architect with the approved thesis and deep-read note IDs; it maps arguments into a draft recursive outline. Do not treat pasted prose as an approved outline. Existing on-disk article Markdown routes to edit/migration.

Otherwise spawn the architect in Mode B with approved thesis, deep read, note IDs, article slug/title from academic_writer_article_paths, targetWordCount, citationStyle and targetLanguage. It calls academic_writer_write_outline with schemaVersion 1, researchQuestion, thesis, status: "draft", ordered nested sections and direct points. Each point has a claim, reasoning and noteUses with function, handling and primary/reference coverage. Do not proceed on prose outline alone.

Call academic_writer_render_outline({article: MD_PATH}) to generate articles/<slug>.outline.md from canonical JSON. Present the generated Markdown with nested argument points, evidence handling and unresolved gaps. Iterate JSON through academic_writer_write_outline, rerender, and present the changed outline; never parse generated Markdown back into JSON.
Present the canonical outline as one ordered, readable argument map, not only generated Markdown or internal fields. For each section show purpose and thesis contribution; for each point show claim, reasoning, chosen evidence, and analytical role. Call out unsupported claims and gaps. Separate source findings from provisional themes, groupings, counterpositions, missing-perspective questions, and other outline suggestions; do not infer absence from search silence. Review reasoning, evidence roles, transition-vs-factual points, repetition, uneven coverage, and possible alternative perspectives as discussion prompts, without a numerical score or auto-pass. Collect edits conversationally, persist them to the canonical outline, rerender, and show the changed map; never ask the researcher to edit JSON or generated Markdown.

At approval, summarize what is ready, the specific unresolved issue(s), and the next action. Require explicit approval of the thesis and complete outline before approval state or either article-local snapshot is changed. Keep note verification separate from argument approval. If approval or snapshot creation fails, preserve prior valid snapshots and do not dispatch writers against mutable project data.

Present each selected candidate as a compact evidence card showing its material kind, exact material, source title/identity, available locator, and optional researcher relevance note. Preserve quotations verbatim; label paraphrases and summaries; keep interpretation separate. Missing source or location is unresolved, not a field to infer. Before marking notes verified, show the exact selected source-backed material, source, and locator and obtain explicit confirmation for each card. The researcher must be able to correct or exclude each card; batch confirmation is acceptable only if every card is visible and independently selectable. Mark verified only the explicitly confirmed IDs. Generic outline approval, silence, NotebookLM output, or missing locators are not verification.

After explicit approval of the thesis and complete rendered outline, call academic_writer_write_outline to set thesis.status and outline status to "approved", then rerender. Call academic_writer_snapshot_citations({article: MD_PATH}) and academic_writer_snapshot_notes({article: MD_PATH}) at this post-approval boundary. Both must succeed before dispatch; on failure stop and repair/seek approval rather than drafting from mutable caches. No subsequent current-run source addition may enter this article context. Use frozen article-local .sources.json, .bibliography.bib, and .notes.json for writing and audit; note anchors are retrieval leads, never proof. Log approval and asset paths.

---

## ⛔ MANDATORY: NO DIRECT WRITING

**You (the write-article skill) MUST NEVER write article paragraphs or sections yourself.**

This means:

- NEVER use the `Write` tool for article body text during Phase 2
- NEVER produce paragraph content inline in your response
- ALL article content MUST come exclusively from `section-writer` subagents

The 8-skill quality pipeline (style fingerprint compliance, grammar, anti-AI, citation audit, etc.) only runs inside section-writer agents. Writing directly bypasses every quality gate and produces unchecked output that does not match the researcher's voice.

**If you are tempted to write the article yourself because the user provided a detailed draft or the sources seem clear — DO NOT. Spawn the section-writers.**

---

## PHASE 2: AUTONOMOUS (Steps 6–9, fully automatic)

### Step 6: Recursive Section Writing + Auditing

Traverse the approved JSON outline in ordered depth-first tree order. Spawn one section-writer task for each section with direct point children; nested child sections are separate drafting units; heading-only sections produce no task. Parallelize independent units through one batched task call (OMP) or sibling subagent calls (pi). Assemble prose under headings in the original tree order.

Pass only MD_PATH, sectionId, and contextual details: citationStyle, targetLanguage, articleStructure, enabled tools, targetWordCount, priorSectionTexts and outlineOverview. The writer calls academic_writer_query_research({operation: "section_bundle", article: MD_PATH, sectionId}) for its approved subtree and selected frozen notes; it writes direct point children only. Do not pass mutable project notes, registry, or pasted section specs as substitutes.

Each section-writer runs the eight-skill paragraph pipeline and auditor hard gate. The auditor independently verifies original sources using note IDs and locators only as leads. Stop on a missing/invalid bundle; never bypass the pipeline with inline body writing.

After receiving each section-writer result, mark node complete:

---

### Step 8: Synthesis + Full-Article Repetition Check

Once all sections are approved, log the spawn event:

**Use your subagent-dispatch tool to spawn the `synthesizer` subagent.** Pass the following as the prompt:

- All completed section texts
- The thesis statement
- The complete styleFingerprint object
- The articleStructure conventions
- The linkingWords reference
- The `targetLanguage` (so the synthesizer loads the correct anti-AI patterns reference)
- The tools configuration

**Phase A — Synthesis review** (`synthesize` node):

- Argument coherence, logical flow, transitions
- Full-article style fingerprint compliance
- Redundancies & gaps

**Phase B — Full-article repetition check** (`synthesize_repetition_check` node):

- Cross-section argument, phrase, opener, transition, and evidence repetition

Makes targeted revisions only — does not rewrite from scratch. Citations are locked.

After receiving the synthesizer result, mark node complete:

---

### Step 8.5: Abstract Generation

Generate a structured abstract (תקציר) from the completed article. The abstract has 3 parts:

1. **Topic & research question** — What is this article about? What question does it address?
2. **Methodology & sources** — What approach was used? Which sources were analyzed?
3. **Main findings & contribution** — What did the research find? How does it advance the field?

**Length:** 150–300 words in `targetLanguage`.

**Dual-language abstracts:** Check the profile for `abstractLanguages`. If it includes languages beyond `targetLanguage` (e.g., both Hebrew and English), generate an abstract in each language.

If `abstractLanguages` is not set in the profile, default to `[targetLanguage]` only.

Store the abstract(s) for inclusion in the DOCX output.

Log completion:

---

### Step 8.7: Self-Review (Quality Gate)

Run the self-review checklist from `/skill:academic-writer-review`. Score the article on 6 dimensions (each 1–10):

1. **Structure** — Intro/conclusion conventions, logical section order
2. **Argument Logic** — Each section advances thesis, no gaps
3. **Citation Completeness** — Every claim cited, consistent format
4. **Source Coverage** — All sources used, balanced distribution
5. **Writing Quality** — Matches style fingerprint, no grammar issues
6. **Academic Conventions** — Linking word variety, paragraph length, transitions

Present the scorecard to the researcher.

**If score is below the self-review threshold defined in `thresholds.json` (default 40/60)**, ask whether to proceed or address issues first (using a conversational ask).
**If score meets or exceeds the threshold (default 40/60)**, show the scorecard and continue to DOCX output.

Log completion:

---

After the Markdown, audit, review, and any requested export have completed, report readiness from actual results: approved thesis/outline; successful note and citation snapshots; section coverage; citation audit; review findings; and the requested export. Name unresolved audit or review findings specifically. A passing mechanical audit is not a claim of academic correctness. Mark export ready only after the requested file is actually produced; if export fails, state the failure and one recovery action.

### Step 9: DOCX Output

Assemble the final article and write to both Markdown and DOCX:

Call `academic_writer_article_paths` with the approved article title/subject. Use its returned `markdown` as `$MD_PATH`, `docx` as `$DOCX_PATH`, and `json` as the intermediate DOCX JSON path. Create `articles/` before writing article outputs.

#### Step 9a: Markdown Output

Call `academic_writer_read_resource` with `name: citation_export_contract`, then follow that contract exactly for the active `citationStyle`.

Write `$MD_PATH` first. The markdown must preserve the final synthesized article:

- title as `# H1`
- thesis as the italic line below it
- abstract text from Step 8.5
- section headings only when `totalWords > 1500`
- paragraphs separated by blank lines
- citations unchanged from the approved section-writer output

For citeproc mode, resolve the CSL with `academic_writer_resolve_csl` before DOCX/export. Do not write citeproc YAML frontmatter into the markdown; `academic_writer_export_article` passes bibliography and CSL directly to Pandoc.

After writing `$MD_PATH`, call `academic_writer_audit_citations` with:

- `article: MD_PATH`
- `citationStyle: citationStyle`

If `ok` is false, stop DOCX generation, set the run state to `failed`, and report the exact missing/wrong-mode citation details. Do not continue to DOCX/export.

#### Step 9b: DOCX Output

Branch by `citationStyle` using the loaded `citation_export_contract`.

##### `inline-parenthetical`

Call `academic_writer_assemble_docx_json` to build the intermediate DOCX JSON deterministically (preserving native Word footnotes via `sections[].paragraphs[].footnotes[]`, `format`, `isRtl`, and `totalWords`). Do NOT attempt to hand-craft or emit raw model-written DOCX JSON.
Then call `academic_writer_generate_docx` with the assembled JSON path and `$DOCX_PATH`.

##### Citeproc mode

Call `academic_writer_export_article` with `article: MD_PATH`, the active `citationStyle`, `formats: ["docx"]`, and `csl: RESOLVED_CSL_PATH`.

Warn Hebrew users that this path does not apply `generate-docx.py` Hebrew RTL post-processing unless their CSL/template handles it.

Log output completion:

Report to researcher:
> "Done! Your article has been saved to:
>
> - `articles/FILEBASE.docx` (formatted document)
> - `articles/FILEBASE.md` (markdown)
>
> Word count: [N] words
> Citations: [N] ([citationStyle] format)
> Sections: [N]
> Language: [targetLanguage]
> [If citeproc mode: Bibliography — `.academic-writer/bibliography.bib` via pandoc `--citeproc` (CSL: [resolved CSL path])]
>
> Quality checks applied per paragraph:
>
> - Style fingerprint compliance: avg [N]/5 score, [N] adjustments
> - Hebrew grammar: [N] issues fixed
> - Language purity: [N] foreign-term violations fixed
> - Repetition: [N] instances fixed
> - Citation audits: [N] claims verified, [N] rejections resolved
>
