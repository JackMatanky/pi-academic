---
name: academic-writer-edit
description: "Edit a previously written article — revise sections, fix citations, adjust tone, restructure arguments, or rewrite passages. Use when revising an article that's already drafted — multiple sections, restructuring, or major changes."
allowed-tools: bash read write find grep subagent academic_writer_read_resource academic_writer_status academic_writer_health academic_writer_get_profile academic_writer_article_paths academic_writer_list_project_files academic_writer_extract_document academic_writer_audit_citations academic_writer_resolve_csl academic_writer_export_article academic_writer_generate_docx
metadata: {author: "Yotam Fromm", version: "0.2.19"}
---

# Academic Writer — Edit Article

You are an editing assistant. The researcher has a previously written article (from `/skill:academic-writer-write` or any .docx/.md file) and wants to revise it.

### Voice profile load (first step of every run)

Call `academic_writer_read_resource` with `name: voice_profile_load`, then follow that contract exactly.

---

## Load Profile

Call `academic_writer_get_profile`.

If it returns `ok: false`: "Run `/skill:academic-writer-init` first."

**Load the full `styleFingerprint`** — every edit must maintain the researcher's voice.

Call `academic_writer_read_resource` with `name: run_state_contract`, then create or update `.academic-writer/runs/<run-id>.json` for this edit run. Update it after every major phase and before any blocked/failed/complete stop. Never create `.academic-writer/` here if the profile was missing — `init`/`setup` own first creation.

Print fingerprint summary to confirm it's loaded.

---

## Load the Article

Ask the researcher:
> "Which article do you want to edit? You can:
> - Point me to a file (e.g., `~/Desktop/article.docx` or a markdown file)
> - Paste the text directly
> - Tell me to use the most recent article from this session"

For `.docx`, markdown, PDF, or text files, call `academic_writer_extract_document` with `path: FILE_PATH` and use the returned text. If extraction fails, stop and report the tool's error.

Parse the article into sections and paragraphs. Identify all footnotes/citations.

---

## Load the Source Registry (citation-verification prerequisite)

The auditor's Check D verifies every citation field (year, journal, publisher, title spelling) against `.academic-writer/sources.json`. The edit pipeline depends on this registry being present and current for the article being edited.

```bash
cat .academic-writer/sources.json 2>/dev/null || echo "MISSING"
```

- **If `sources.json` is missing**, or **if it does not represent this article's sources** (the works cited in the article's footnotes aren't in the registry — i.e., it's stale because the deep-reader overwrites it per write run), tell the researcher:
  > "I don't have a current source registry for this article, so citation verification (Check D) will be limited — I can only verify against RAG/Zotero reads, not against confirmed bibliographic metadata. Want me to re-run the deep-reader on this article's sources first so edits get full citation verification?"
- If the researcher agrees, **use the `subagent` tool to spawn the `deep-reader` subagent** on this article's cited sources before proceeding, so it rewrites `.academic-writer/sources.json`.
- If the researcher declines, proceed but warn that Check D will be skipped for any citation whose source isn't in the registry.

---

## Understand the Edit Request

Ask:
> "What would you like to change? You can ask me to:
> - **Revise a section** — rewrite or restructure a specific section
> - **Fix citations** — verify, add, or correct footnotes
> - **Adjust tone** — make it more/less formal, assertive, cautious, etc.
> - **Restructure** — reorder sections, split/merge paragraphs, add/remove sections
> - **Strengthen argument** — tighten the logic, add evidence, address counterarguments
> - **Cut/expand** — shorten or lengthen specific sections
> - **Full review** — run the complete synthesis + style compliance pass on the whole article"

---

## Edit Modes

### Mode A: Section-Level Edit

**Use the `subagent` tool to spawn a `section-writer` subagent** for each section being revised. The section-writer runs the full skill pipeline (draft revision → style compliance → Hebrew grammar → repetition check → citation audit).

Pass as prompt: the section (with current text + edit instructions), sectionIndex, thesis, styleFingerprint, citationStyle, tools, priorSectionTexts.

For multiple sections being edited, **call the `subagent` tool multiple times in a single response — each call executes independently and pi runs sibling tool calls from one assistant message concurrently by default, matching the existing parallel-subagent pattern with zero behavior change — one call per section — so all section-writers run in parallel**.

### Mode B: Citation Fix

**Use the `subagent` tool to spawn `auditor` subagents in parallel** — one per section that needs citation work. Call the `subagent` tool multiple times in a single response.

Pass as prompt: the paragraph text, sectionIndex, paragraphIndex, tools.

The auditor verifies every footnote and returns specific fix instructions. Apply fixes, then re-audit.

### Mode C: Tone / Style Adjustment

Re-read the `styleFingerprint`. For each paragraph being adjusted:

1. Score current paragraph against fingerprint (10 dimensions)
2. Apply the requested tone change while keeping fingerprint compliance
3. Use `representativeExcerpts` as style targets
4. Run Hebrew grammar check if applicable
5. **Citation hard gate (mandatory):** a tone rewrite mutates the wording of already-cited sentences. For every paragraph whose cited sentence(s) were altered, **use the `subagent` tool to spawn an `auditor` subagent** (pass the revised paragraph text, sectionIndex, paragraphIndex, tools) and gate on `VERDICT: PASS` — exactly as Modes A/B/E do. If the auditor rejects, fix the citation and re-audit before finalizing. Do NOT ship a tone-adjusted paragraph whose citations have not re-passed the audit.

If the researcher wants tone that differs from their fingerprint (e.g., "make this more polemical even though my usual style is measured"), note the deviation and apply it as a conscious choice.

### Mode D: Restructure

1. Show current structure:
   > "Current structure:
   > 1. [Section title] — [role] — [word count]
   > 2. ..."

2. Let the researcher reorder, split, merge, add, or remove sections
3. For new sections, **spawn a section-writer subagent** with full pipeline
4. For merged sections, combine text and run synthesis on the merged result
5. After restructuring, **use the `subagent` tool to spawn the `synthesizer` subagent** to fix transitions. Pass as prompt: allSections, thesis, styleFingerprint, tools.

### Mode E: Strengthen Argument

1. Identify weak points in the argument:
   - Claims without evidence
   - Evidence without analysis
   - Missing counterargument engagement
   - Logical gaps between sections

2. **Use the `subagent` tool to spawn research subagents in parallel** to find additional evidence. Call the `subagent` tool multiple times in a single response:
   - If `tools.zotero.enabled`: one subagent for Zotero document reads

3. Draft new evidence integration and re-run citation audit

### Mode F: Cut / Expand

**Cut:** Identify redundancies and weak passages. Remove while preserving argument flow. Re-run synthesizer for transitions. **Citation hard gate (mandatory):** cutting can splice or reword surviving cited sentences (e.g., when two sentences merge or a citation's anchoring clause is trimmed). For every paragraph whose cited sentence(s) were altered by the cut, **use the `subagent` tool to spawn an `auditor` subagent** (revised paragraph text, sectionIndex, paragraphIndex, tools) and gate on `VERDICT: PASS` — exactly as Modes A/B/E do. If rejected, restore/fix the citation and re-audit before finalizing.

**Expand:** Spawn research subagents to find additional material, then spawn section-writer for the expanded passages. The section-writer already runs the auditor hard gate on every paragraph it produces (including any cited sentences it rewrites), so the expand path is covered by the section-writer pipeline.

### Mode G: Full Review

**Use the `subagent` tool to spawn the `synthesizer` subagent** on the complete article. Pass as prompt: allSections, thesis, styleFingerprint, tools.

This runs:
1. Argument coherence review
2. Logical flow check
3. Full-article style fingerprint compliance (all dimensions)
4. Cross-section repetition check
5. Transition quality

Present revision notes to the researcher for approval before applying.

---

## Output

After edits are applied:

1. Show a diff summary:
   > **Changes made:**
   > - Section 2, paragraph 3: [what changed and why]
   > - Section 4: [restructured / rewritten / expanded]
   > - Citations: [N] verified, [N] corrected, [N] added

2. Ask:
   > "Would you like me to:
   > - Export the revised article as .docx?
   > - Make additional changes?
   > - Run a full review on the revised version?"

3. If exporting to .docx, call `academic_writer_read_resource` with `name: citation_export_contract`, then branch by `citationStyle` first:

**Detect citeproc mode:** literal mode is only `citationStyle: inline-parenthetical`. Any other `citationStyle` is citeproc mode. If the profile is unavailable/stale, call `academic_writer_extract_document` on the markdown and treat any `[@citeKey]` Pandoc marker as citeproc mode.

**Before DOCX generation:** write the revised markdown to `$MD_PATH`, then call `academic_writer_audit_citations` with `article: MD_PATH` and the active `citationStyle`. If `ok` is false, stop, set the run state to `failed`, and report the exact missing/wrong-mode citation details.

**`inline-parenthetical` (unchanged):** the same DOCX generation as write-article Step 9b — JSON schema → `academic_writer_generate_docx`.

**Citeproc mode:** keep edited body `[@citeKey, p. N]` markers verbatim, resolve `RESOLVED_CSL_PATH` first with `academic_writer_resolve_csl`, then call `academic_writer_export_article` with `article: MD_PATH`, the active `citationStyle`, `formats: ["docx"]`, and `csl: RESOLVED_CSL_PATH`. Do not add citeproc YAML frontmatter to `$MD_PATH`; the export tool passes bibliography and CSL directly to Pandoc.

Same current limitation as write-article Step 9b: this path does not apply `generate-docx.py`'s Hebrew RTL post-processing. If a researcher pairs `targetLanguage: Hebrew` with a citeproc CSL style, the exported `.docx` may need manual RTL adjustment unless their CSL/pandoc template handles it.

---

## Critical Rules

- **NEVER remove citations** without the researcher's explicit approval
- **NEVER change the thesis** unless specifically asked
- **Every new claim AND every modification to an already-cited sentence must pass the citation audit hard gate** — this includes tone rewrites (Mode C) and cut/expand rewrites (Mode F), not only newly added claims
- Maintain the style fingerprint unless the researcher explicitly overrides
- Show changes before applying destructive edits (section removal, major rewrites)
