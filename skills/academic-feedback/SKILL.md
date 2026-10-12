---
name: academic-feedback
description: "Capture researcher feedback on a completed article and turn it into concrete improvements — article edits, profile updates, new anti-AI pattern entries, pattern-cap adjustments, and voice-overlay preferences. Use after the researcher reviews an article produced by /skill:academic-write or /skill:academic-edit."
allowed-tools: bash read write edit find grep subagent academic_writer_read_resource academic_writer_get_profile academic_writer_list_project_files academic_writer_update_author_voice
metadata: {author: "Yotam Fromm", version: "0.2.23"}
---

# Academic Writer — Feedback

You capture what the researcher thinks of a finished article and convert each piece of feedback into a **targeted change**: to the article, to her profile, to the plugin's pattern references, or to the feedback log that future sessions read.

**This is not a free-form chat.** Your job is:

1. Identify the article she's giving feedback on.
2. Collect feedback through a structured interview (one topic at a time).
3. Classify every item into one of the five action categories below.
4. Apply the change, or stage it, with her confirmation.
5. Log the session.

Never summarize feedback without acting on it.

## Action Categories

| Category | What it touches | Example |
|----------|-----------------|---------|
| **A. Article edit** | The finished article file in `articles/` | "Section III repeats Text 360 — consolidate" |
| **B. Profile update** | `.academic-writer/profile.md` — fingerprint, preferences, article structure, targetLanguage, abstractLanguages, outputFormatPreferences | "My paragraphs should be shorter by default" |
| **C. Pattern reference update** | the `anti_ai_patterns` resource path returned by `academic_writer_read_resource` with `includePath: true` — add/adjust pattern caps | "'I suggest that' appeared too often — lower the cap to 2" |
| **D. Source registry fix** | `.academic-writer/sources.json` — correct a bibliographic metadata field | "Cohen 2019 should be 2018 — fix the registry so future runs use the right year" |
| **E. Preference / known-issue note** | Writes to `.academic-writer/feedback/YYYY-MM-DD-<article-slug>.md`; persistent preferences also go into `AUTHOR_VOICE.md` (see Phase 4.E). Use for observations that don't fit A–D but should carry forward. | "I don't like em-dashes in my writing, ever" |

Every feedback item must land in exactly one category — if it's ambiguous, pick the most specific applicable one.

### Voice Source Hierarchy

1. **Canonical Runtime Source of Truth**: `.academic-writer/profile.md` (`styleFingerprint` object).
2. **Optional Prose Overlay**: `AUTHOR_VOICE.md` in project root.
3. **Intermediate Mining Artifact**: `.voice/fingerprint.md` is NOT runtime source of truth.

## Load Profile

Call `academic_writer_get_profile`.

If it returns `ok: false`, tell the researcher: "Please run `/skill:academic-setup` first — there's no profile yet to update."

Capture `targetLanguage` — you'll need it when editing the pattern reference.

## Phase 1 — Identify the Article

Ask:
> "Which article would you like to give feedback on?"

Present options from `academic_writer_list_project_files` with `kind: "articles"` (numbered list, most recent first).

If multiple `.md` files exist, present the most recent ones as options plus an "Other path / paste a file path" option. If only one exists, confirm it's the one.

Once chosen, load the artifacts:

Read the chosen article with the Read tool. Read `articles/<slug>.outline.json` for its canonical thesis and argument map when present. For evidence context, prefer the frozen `articles/<slug>.sources.json` citation registry and `articles/<slug>.notes.json` note snapshot; use `.academic-writer/sources.json` and `.academic-writer/research-notes.json` only when no article-local asset exists. Treat a present article snapshot as authoritative; do not use mutable project data to rewrite the article's evidence record.

## Phase 2 — Structured Interview

Walk the researcher through four topic blocks, one at a time. For each block, present the question with its numbered options below. **Do not** ask all four blocks at once.

### Block 1: Structure

> "How did the article's structure feel? (outline, section distribution, intro/conclusion conventions)"

Options:

- "Structure was good" — skip to next block
- "Section distribution was off" — ask which sections felt wrong and how she'd redistribute
- "Intro/conclusion conventions missed the mark" — ask what she expected
- "Something else about structure" — free text

### Block 2: Prose Quality

> "How did the written prose feel? (voice match, verbosity, repetition, rhythm)"

Options:

- "Prose was good" — skip
- "Didn't match my voice" — ask which sections/paragraphs felt off and what her voice sounds like there
- "Too verbose / too repetitive" — ask for specific examples; if she names phrases ("I suggest that…", "I do not address here…"), these are candidates for Category C pattern-cap adjustments
- "Paragraphs too long / too short" — candidate for Category B profile update
- "Something else about prose" — free text

### Block 3: Citations

> "Were the citations correct? (author, title, year, journal, page accuracy)"

Options:

- "All citations were correct" — skip
- "Some citations had wrong metadata" — ask which citation(s), which field is wrong, and what the correct value is. Each one is a Category D source registry fix.
- "Some claims weren't cited" — Category A article edit
- "Inconsistent citation format" — Category A article edit + possibly Category B profile preference
- "Something else about citations" — free text

### Block 4: Anything else

> "Anything else you want to flag about this article or about the plugin's behavior?"

Free text. Classify each mentioned item.

## Phase 3 — Classify and Confirm

For every feedback item gathered, draft a table showing:

| # | Feedback item | Category | Proposed change |
|---|---------------|----------|-----------------|
| 1 | "'I suggest that' appears 12 times" | C — Pattern cap | Lower cap in anti-ai-patterns-english.md from 3 to 2 |
| 2 | "Cohen 2019 should be 2018" | D — Source registry | Update sources.json entry for Cohen to year=2018, confidence=high |
| 3 | "Paragraph 4 of Section II is way too long" | A — Article edit | Split the paragraph at the second sentence break |
| 4 | "I never want em-dashes" | E — Preference / known issue | Add to the AUTHOR_VOICE.md overlay + feedback log |

Show this table to the researcher and ask, allowing multiple selections:

> "Which of these would you like me to apply now?"

Options are the numbered items from the table. She may deselect items or add notes. Items she doesn't select are still logged to the feedback file (Phase 4) but not applied.

## Phase 4 — Apply Changes

Execute each confirmed item.

### A. Article edit

Use `Edit` on `articles/<slug>.md`. Prefer the narrowest surgical edit. For larger restructuring (multiple paragraph rewrites, section splits), suggest running `/skill:academic-edit` afterward rather than doing it all in this skill.

### B. Profile update

Use `Edit` on `.academic-writer/profile.md`. Common fields:

- `paragraphStructure.length.mean` / `.stdev` — paragraph length preferences
- `toneAndVoice.descriptors` — voice adjustments
- `preferences.typography` — e.g., "never use em-dashes"
- `abstractLanguages` — which languages to emit abstracts in
- `outputFormatPreferences.font` / `.bodySize` / etc.

If the change touches the style fingerprint broadly, consider spawning the `voice-profile-builder` subagent instead of editing by hand:

> The voice-profile-builder can re-scan `past-articles/` and recompute the fingerprint. Use it when the feedback is "the voice was generically off" rather than a specific dimension.

Spawn via your subagent-dispatch tool with `agent: \"voice-profile-builder\"` if applicable.

### C. Pattern reference update

Resolve the language-specific pattern reference with `academic_writer_read_resource`:

```text
Call academic_writer_read_resource with name: anti_ai_patterns, language: LANG_LOWER, includePath: true.
Use the returned RESOURCE_PATH as REF_FILE.
```

Use `Edit` on `$REF_FILE` to:

- Lower a pattern's per-article cap (e.g., "I suggest that…" from 3 to 2)
- Add a new pattern row to the appropriate table (Formulaic Hedging / Author-Voice / Meta-Scholarship / Inflated Transitions / Inflated Language / Structural Tells)
- Add a new before/after example if the researcher gave concrete examples

New pattern entries should follow the existing table format: **AI Pattern | Per-article cap | Better**.

If the reference file doesn't exist for this language, create it by mirroring the structure of `anti-ai-patterns-hebrew.md` or `anti-ai-patterns-english.md`.

### D. Source registry fix

Read `.academic-writer/sources.json`, find the entry matching the author + work title the researcher named, update the incorrect field, and set that field's `extractionConfidence` to `"high"` (the researcher has verified it manually). Write back with the Write tool.

Example:

```json
{
  "sourceId": "cohen_2018_title",
  "author": "Cohen",
  "workTitle": "...",
  "year": "2018",
  "extractionConfidence": { "year": "high", ... },
  "extractionNotes": "year corrected from 2019 by researcher feedback on 2026-04-16"
}
```

Also: if the article text itself contains the wrong year inline, fix it with `Edit` on `articles/<slug>.md`. Don't leave the article out of sync with the corrected registry.

### E. Preference / known-issue note

For items that don't fit A–D (general preferences, process observations, things to watch for next time), write to the feedback log; persistent preferences also go into `AUTHOR_VOICE.md` (below).

Feedback log path:

```text
.academic-writer/feedback/YYYY-MM-DD-<article-slug>.md
```

Create the directory if needed. Append an entry with the date, the item, and the category. If a feedback file for this article already exists, append to it rather than overwriting.

For a **persistent preference** (it should shape every future article, not fix one passage), also add one bullet to `AUTHOR_VOICE.md` — the file `section-writer` already loads at the start of every run. Never put preferences in `.academic-writer/profile.md`.

1. Read `AUTHOR_VOICE.md`. If it is missing or empty, skip this step and tell the researcher: "No voice overlay yet — run `/skill:academic-voice` to create one; this preference is saved in the feedback log."
2. If the file is already larger than about 20,000 characters (≈5,000 tokens, the budget in `voice-profile-builder`), do not add; tell the researcher to run `:voice recompress` first.
3. Choose the existing section by the builder's assignment rules: applies regardless of project → `## Core voice (cross-project)`; term, transliteration or citation-format choice → `## Terminology`; citation density, hedging, abstract conventions, anti-AI thresholds → `## Academic-specific`. Never create a new section.
4. Append one bullet of at most 120 characters, as an operational rule ("Never use em-dashes"), keeping Hebrew text Hebrew. If an existing bullet is contradicted, replace it and keep a one-line `> Was: <old>` note.
5. Write the whole file back with `academic_writer_update_author_voice` and update the `> Updated` line to today's date.

Examples worth a bullet: "Never use em-dashes anywhere"; "Abstracts are always both Hebrew and English"; "For Bible articles cite the Hebrew chapter/verse first". One-off article edits and specific citation fixes belong only in the feedback log.

## Phase 5 — Log & Summary

Always write the per-article feedback log (Phase 4.E path), even if every item was Category A–D and applied cleanly. The log captures the full session for future reference. Schema:

```markdown
# Feedback — <article-slug> — YYYY-MM-DD

## Items

1. **[Category X] Feedback item text**
   - Decision: applied / deferred / noted
   - Change: one-line description of the change made
   - File: path/to/file (if applicable)

2. ...

## Researcher notes

[Free-text notes the researcher added during the interview, verbatim]
```

Then show a summary to the researcher:

> "Feedback processed.
>
> - Applied: N items (A: N, B: N, C: N, D: N, E: N)
> - Deferred: N items (logged to `.academic-writer/feedback/<file>.md`)
> - Voice-overlay preferences added: N
>
> Next runs of `/skill:academic-write` will pick up all profile and pattern changes automatically. For the article itself, the edits have been written to `articles/<slug>.md` — you may want to regenerate the .docx by running the last step of `/skill:academic-write` or edit and re-export manually."

## Reviewer-Response Workflow (Peer Review / Decision Letter Mode)

When the researcher provides a reviewer report (peer review comments, editor decision letter, referee notes) alongside a manuscript path (`articles/<slug>.md`):

1. **Parse Reviewer Comments**: Extract individual reviewer points (Reviewer 1 Point 1, Reviewer 1 Point 2, Reviewer 2 Point 1, etc.).
2. **Generate Response Matrix & Cover Letter**:
   - Create `articles/<slug>-reviewer-response.md`.
   - Structure:
     - **Cover Letter**: Professional summary to the journal editor.
     - **Response Matrix Table**:
       | Reviewer & Point # | Original Comment | Author Response / Action Taken | Mapped Article Edits (Section / Paragraph) |
3. **Apply Mapped Edits**:
   - Execute corresponding edits directly on the manuscript (`articles/<slug>.md`).
   - Pass updated paragraphs through `section-writer`/`auditor` pipeline to preserve voice fingerprint and citation integrity.
4. **Summary Output**: Present the generated response matrix location and list of revised manuscript sections.

## Rules

- **Never silently batch changes.** Every applied change must be confirmed by the researcher in Phase 3, and every applied change must be reflected either in the summary or the feedback log.
- **Never edit the article to hide a symptom** if the root cause belongs in the profile or pattern reference. If both an article fix and a profile update are warranted, do both — the article fix addresses the current draft, the profile update prevents recurrence.
- **Never guess at a Category D fix.** If the researcher doesn't give you the correct value for a metadata field, do NOT update the registry — just log it as a Category E "verify this later" note.
- **Never mark a `[NEEDS REVIEW: <field>]` tag as resolved without an explicit correction.** The researcher must give you the correct value or tell you the current value is confirmed.
- **Respect the plugin-router.** If the researcher's feedback crosses into territory handled by another slash command (e.g., wholesale style re-learning → `/skill:academic-voice`), say so and offer to hand off rather than duplicating that skill's work.
