---
name: academic-writer-init
description: "First-time setup for the Academic Writer. Configures researcher profile, analyzes writing style from past articles, and indexes research sources. Use on first install or when redoing onboarding from scratch."
allowed-tools: bash read write find grep academic_writer_read_resource academic_writer_resolve_csl academic_writer_migrate_profile academic_writer_get_profile academic_writer_list_project_files academic_writer_extract_document academic_writer_ingest_sources
metadata: {author: "Yotam Fromm", version: "0.2.23"}
---

# Academic Writer — Initialization Wizard

Personalized onboarding that creates your researcher profile, detects available integrations, analyzes your writing style, and indexes your research sources.

## The Five Phases

| Phase | What | Output |
|-------|------|--------|
| 0. Preflight | Create folders, detect existing profile | Workspace ready |
| 1. Integrations | Auto-detect tools, let you choose | `tools` config |
| 2. Profile | Field, language, citation style | Core profile |
| 3. Style Analysis | Read past articles, build fingerprint | `styleFingerprint` + `articleStructure` |
| 4. Sources | Index Zotero or local source folder | `sources` array |

---

## Phase 0: Preflight

Run silently before saying anything:

```bash
mkdir -p past-articles .academic-writer .academic-writer/sources .academic-writer/logs
# If .academic-writer/thresholds.json is missing, call academic_writer_read_resource with name: thresholds, then write that content to .academic-writer/thresholds.json.
```

If `.academic-writer/profile.md` exists and its `## Tools` JSON block contains a `candlekeep` key but no `zotero` key, perform a one-time migration: rewrite the JSON block in-place to drop `candlekeep` and add `"zotero": {"enabled": <value of old candlekeep.enabled>, "mode": "local"}` before proceeding.

Profile schema and file format: see `references/profile-schema.md`.

Call `academic_writer_migrate_profile`, then check for existing profile by calling `academic_writer_get_profile`.

**If it returns `ok: true`**: Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "You already have an Academic Writer profile. What would you like to do?"
> 1. **Update my profile** — Keep existing data, modify selected fields only.
>    ```
>    Update Mode
>    ───────────
>    ✓ Field of study preserved
>    ✓ Style fingerprint preserved
>    ✓ Sources preserved
>    → Re-run only the steps you choose
>    ```
> 2. **Start fresh** — Delete the current profile and rebuild from scratch.
>    ```
>    Fresh Start
>    ───────────
>    ⚠ Existing profile will be replaced
>    ⚠ Style fingerprint will be cleared
>    ⚠ Sources will be cleared
>    → Walk through all 4 phases again
>    ```
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

If **Update**, ask which phases to re-run (multiSelect: true) with options: "Integrations", "Profile (field/language/citation)", "Style Analysis", "Sources". Run only selected phases, then save.

Then greet the user:
> "Welcome to Academic Writer! I'll walk you through setup in a few steps.
>
> Your workspace folders are ready:
> - **`past-articles/`** — drop 5–10 of your published papers here (PDF or DOCX) so I can learn your writing style
> - `.academic-writer/` — your profile (auto-managed)
>
> Let's start."

---

## Phase 1: Integration Detection

Per-tool detection commands, numbered-list prompts, and port-fallback logic: see `references/integration-setup.md`.

After running detection (parallel batch), store the tool selection as the `tools` object for Phase 4. Zotero is preferred but optional; Sefaria is optional and saved as `tools.sefaria` only when selected/detected.

---

## Phase 2: Researcher Profile

### Step 1 of 4 — Field of Study

Ask the researcher, as a free-text prompt (no fixed options — record whatever they say):
> "What is your field of study and area of specialization?"

Show examples below the question:
> "The more specific, the better. Examples:
> - *Early Modern Jewish Philosophy*
> - *Talmudic Literature and Rabbinic Thought*
> - *Medieval Hebrew Poetry*
> - *Biblical Studies — Pentateuch*"

Record the free-text answer as `fieldOfStudy`.

---

### Step 2 of 4 — Article Language

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "What language will you write your articles in?"
> 1. **Hebrew** — Right-to-left, David font, inline-parenthetical citations recommended.
>    ```
>    Hebrew Mode
>    ───────────
>    Direction:  RTL
>    Font:       David 11pt
>    Citations:  (מחבר, כותרת, עמ' N) in running text
>    Purity:     Foreign terms must be transliterated
>    ```
> 2. **English** — Left-to-right, Times New Roman, citeproc/CSL citations supported.
>    ```
>    English Mode
>    ────────────
>    Direction:  LTR
>    Font:       Times New Roman 12pt
>    Citations:  Any CSL style (popular alias, Zotero/CSL style id, URL, or custom .csl)
>    ```
> 3. **Other** — You'll specify the language name.
>    ```
>    Other Language
>    ──────────────
>    → You'll type the language name
>    → RTL/LTR detected from language
>    → Citation style: your choice
>    ```
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

Store as `targetLanguage`. If "Other", ask for the language name with a follow-up question.

---

### Step 3 of 4 — Citation Style

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "Which citation style do you use in your academic work?"
> 1. **Inline Parenthetical (Recommended for Hebrew)** — (Author, Title, Page) in running text — no footnotes required.
>    ```
>    Inline Parenthetical
>    ────────────────────
>    Example:
>      כפי שטוען לוי (לוי, משנת הנפש, עמ' 42), הרעיון
>      המרכזי הוא...
>
>    When to use:
>      ✓ Hebrew articles
>      ✓ Short citation format
>      ✓ Dense citation density
>    ```
> 2. **Popular citeproc style** — Pick a common style; Academic Writer downloads/caches it from Zotero/CSL on first use.
>    ```
>    Popular CSL aliases
>    ───────────────────
>      apa                  → APA 7th edition
>      mla                  → MLA 9th edition
>      chicago              → Chicago 18 notes + bibliography
>      chicago-author-date  → Chicago 18 author-date
>      turabian             → Turabian notes + bibliography
>      harvard              → Harvard Cite Them Right
>      ieee                 → IEEE
>      nature               → Nature
>      vancouver            → Vancouver
>      ama                  → American Medical Association
>      apsa                 → American Political Science Association
>      asa                  → American Sociological Association
>      mhra                 → Modern Humanities Research Association
>      elsevier-harvard     → Elsevier Harvard
>
>    If none match, choose option 3 or 4.
>    ```
> 3. **Zotero/CSL repository style** — Use a style id from https://www.zotero.org/styles or https://github.com/citation-style-language/styles.
>    ```
>    Zotero/CSL Repository
>    ─────────────────────
>    Example ids:
>      chicago-author-date
>      nature
>      modern-humanities-research-association
>
>    Academic Writer downloads/caches the .csl file to .academic-writer/csl/
>    ```
> 4. **Custom CSL file** — Use a `.csl` file you provide.
>    ```
>    Custom CSL
>    ──────────
>    Example paths:
>      .academic-writer/csl/my-journal.csl
>      /Users/me/styles/my-journal.csl
>
>    Best for: journal-specific or edited CSL files.
>    ```
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

Map selection:
- Inline → `citationStyle: inline-parenthetical`
- Popular alias → `citationStyle: STYLE_ALIAS` (e.g. `chicago`, `mla`, `apa`, `chicago-author-date`)
- Zotero/CSL repository style → `citationStyle: STYLE_ID` (e.g. `nature`) and store the same value under `outputFormatPreferences.csl`
- Custom CSL file → `citationStyle: custom-csl` and store the path under `outputFormatPreferences.cslPath`

For every citeproc selection (anything except `inline-parenthetical`), validate resolution before saving by calling `academic_writer_resolve_csl` with `style: STYLE_OR_PATH` and `download: true`.

If validation fails, show the error and ask for a different alias, style id, URL, or `.csl` path. Do not continue with an unresolved CSL style.

---

### Step 3b of 4 — Abstract Languages

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "Do your articles need abstracts? Some journals require dual-language abstracts."
> 1. **Primary language only** — Abstract in the article's language only.
>    ```
>    Single Abstract
>    ───────────────
>    Abstract in: [targetLanguage]
>    Common for: Most journals
>    ```
> 2. **Hebrew + English** — Dual-language abstracts — common for Israeli journals.
>    ```
>    Dual Abstract
>    ─────────────
>    Abstracts in: Hebrew + English
>    Common for: Israeli journals,
>                academic theses
>    ```
> 3. **No abstract needed** — Skip abstract generation.
>    ```
>    No Abstract
>    ───────────
>    Abstracts will not be generated.
>    You can enable later with
>    /skill:academic-writer-init (Update)
>    ```
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

Store as `abstractLanguages` array:
- Primary only → `["Hebrew"]` (or whatever `targetLanguage` is)
- Hebrew + English → `["Hebrew", "English"]`
- No abstract → `[]`

---

### Step 4 of 4 — Writing Style

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "To write articles that sound like you, I need to analyze your past work. Have you added papers to the past-articles/ folder?"
> 1. **Yes, my papers are ready** — Analyze them now to extract your writing fingerprint.
>    ```
>    Style Analysis
>    ──────────────
>    → Reads PDF and DOCX files in past-articles/
>    → Analyzes 25 style dimensions:
>       sentence length, structure, vocabulary,
>       paragraph patterns, transitions, citations,
>       rhetorical moves, tone, intro/conclusion style
>    → Shows you the fingerprint before saving
>    → You can correct anything before it's stored
>    ```
> 2. **Skip for now** — Profile will be saved without a style fingerprint. Articles will use generic academic style.
>    ```
>    Skip Style Analysis
>    ───────────────────
>    ⚠ Articles won't match your voice yet
>    → Add papers to past-articles/ anytime
>    → Re-run: /skill:academic-writer-init
>       (choose 'Update' → 'Style Analysis')
>    ```
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

**If "Yes, my papers are ready"**, run:

Call `academic_writer_list_project_files` with `kind: "past_articles"` and use the returned file list.

**Step 1: Computational extraction** — Run the voice-miner subagent on `past-articles/` with `.ctx/hebrew-linguistic-reference.md` as the baseline reference. Use its returned metrics directly in the confirmation step below; do not write `/tmp` metrics files.

First fetch the **shared Hebrew baseline** from Zotero (book *Hebrew Linguistic Reference*, mirrored on GitHub at [JackMatanky/hebrew-linguistics-data](https://github.com/JackMatanky/hebrew-linguistics-data); the same book is read by the `hebrew-book-producer` plugin so both share one source of truth):

```bash
mkdir -p .ctx
```

Call `zotero_get_item_fulltext(item_key="cmomjonvy0fdmk30zwef79c48")` and use the Write tool to save the returned text to `.ctx/hebrew-linguistic-reference.md`.

The extractor reads the baseline JSON code block embedded in the `08-style-fingerprint-baseline` chapter of the cached markdown, so there is no separate JSON file in the plugin's `references/` folder.

This gives you 30+ numerical metrics (sentence length, passive voice, transitions, etc.) and contrastive scores showing what's distinctive about this researcher vs. baseline academic Hebrew.

**Step 2: Text extraction for qualitative analysis** — For each file, call `academic_writer_extract_document` with that file path and use the returned text.

**Step 3: Qualitative analysis** — Read the text and computational metrics. Analyze across the qualitative dimensions (C–I below) that the script cannot compute: paragraph formula, tone, rhetorical patterns, templates, representative excerpts.

Show the combined fingerprint summary (computational + qualitative) and confirm before saving:

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "Here's the writing fingerprint I extracted. Is this accurate?"
> 1. **Looks good — save it** — Profile will be saved with this fingerprint.
> 2. **I'd like to adjust some things** — Tell me what to change and I'll update before saving.
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

### 25-Dimension Style Analysis

Full rubric (all 30 dimensions across 8 categories A–I): see `references/profile-schema.md`.

---

### Stage 1 voice fingerprint

After past-articles are scanned, invoke the `voice-miner` agent:

1. Run `voice-miner` agent on `past-articles/`. Output is `.voice/fingerprint.md`.
2. Run `voice-distiller --from-fingerprint` to seed the four-section `AUTHOR_VOICE.md` at root.
3. Print: "✓ Voice fingerprint created from N past articles. You can write articles now, or run
   `/skill:academic-writer-voice` for a deeper profile (recommended)."

The user is not required to run Stage 2. They can start writing immediately with the fingerprint.

---

## Phase 3: Research Sources

**If Zotero is enabled, prefer Zotero indexing. If Zotero is disabled or no items are selected, ingest local files from `.academic-writer/sources/` with `academic_writer_ingest_sources`:**

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "Let's index your research library. Have you added sources to Zotero yet?"
> 1. **Yes, index my sources now** — I'll enrich and index the configured Zotero collection, or the whole library if no collection was selected.
>    ```
>    Source Indexing
>    ───────────────
>    → Uses tools.zotero.collection when set
>    → Otherwise lists all items in your library
>    → Runs zotero_get_item_metadata(format="json") on each
>       (extracts title, author, TOC)
>    → Saves minimal metadata to profile
>       (id, title, type only)
>    ```
> 2. **Skip — I'll add sources later** — Run /skill:academic-writer-init again (choose Update → Sources) after adding items.
>    ```
>    Skip Sources
>    ────────────
>    ⚠ Articles won't have source metadata yet
>    → Add items via the Zotero desktop app, then re-run this step
>    ```
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

If **"Yes"**: list and enrich the configured scope:

If `tools.zotero.collection.key` is set, call `zotero_get_collection_items(collection_key=COLLECTION_KEY)` and enrich only those items. Otherwise call `zotero_get_collections()` first, then `zotero_get_collection_items(collection_key=KEY)` per collection to list all items (or `zotero_get_recent(limit=100)` for a flat recent-items view). `zotero_get_collection_items` pages at 50 items per call — when its response reports more items, follow the `Pass offset=N` hint until the listing is complete.

For each item ID, call `zotero_get_item_metadata(format="json")`.

Tell the researcher: "Enriching your sources — extracting titles, authors, and table of contents from each document. This may take a moment..."

After enrichment, re-list and build the sources array (id + title + type only — never raw JSON).

**If Zotero is NOT enabled**: set sources to `[]`.

---

## Phase 4: Save Profile + Register Workflows

Use the Write tool to save `.academic-writer/profile.md`:

```markdown
# Academic Writer Profile

---
fieldOfStudy: FIELD_HERE
citationStyle: SELECTED_CITATION_STYLE
targetLanguage: Hebrew
abstractLanguages:
  - Hebrew
analyzedArticles: []
createdAt: ISO_TIMESTAMP
updatedAt: ISO_TIMESTAMP
---

## Tools

```json
{
  "zotero": { "enabled": true, "mode": "mcp-config", "collection": { "key": "optional Zotero collection key", "name": "optional display name" } },
  "notebooklm": { "enabled": false, "mode": "mcp-config", "notebook": { "id": "optional NotebookLM notebook id", "name": "optional display name" } }
}
` ` `

## Output Format Preferences

```json
{ "csl": "optional CSL style id or popular alias", "cslPath": "optional custom .csl path or URL" }
` ` `

## Style Fingerprint

```json
{ ... full 25-dimension fingerprint object ... }
` ` `

## Article Structure

```json
{ ... article structure object ... }
` ` `

## Sources

```json
[]
` ` `
```

(Replace ` ` ` with actual backtick triplets when writing the file.)


---

## Completion

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "Setup is complete. What would you like to do next?"
> 1. **Write my first article** — Launch /skill:academic-writer-write to start writing.
>    ```
>    Write Article
>    ─────────────
>    → /skill:academic-writer-write
>    → Conversational pipeline:
>       subject → sources → thesis
>       → outline → write → .docx
>    ```
> 2. **Check system health** — Run /skill:academic-writer-health to verify everything is working.
> 3. **I'm done for now** — Profile saved. Run /skill:academic-writer-write anytime to start writing.
>    ```
>    Profile saved to:
>      .academic-writer/profile.md
>
>    Key commands:
>      /skill:academic-writer-write         ← write an article
>      /skill:academic-writer-health  ← check everything
>      /skill:academic-writer-update-tools ← change integrations
>    ```
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

Show a summary table:

> | Setting | Value |
> |---------|-------|
> | Field | [field] |
> | Language | [language] |
> | Citation style | [style] |
> | Style fingerprint | ✓ Analyzed / — Skipped |
> | Sources indexed | [N] documents |
> | Tools enabled | [list] |
