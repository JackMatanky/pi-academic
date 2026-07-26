---
name: academic-writer-init
description: "First-time setup for the Academic Writer. Configures researcher profile, analyzes writing style from past articles, and indexes research sources. Use on first install or when redoing onboarding from scratch."
allowed-tools: bash read write glob grep
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
| 4. Sources | Index Zotero library | `sources` array |

---

## Phase 0: Preflight

Run silently before saying anything:

```bash
mkdir -p past-articles .academic-helper .academic-helper/logs && cp -n ""$ACADEMIC_WRITER_ROOT"/thresholds.json" .academic-helper/ 2>/dev/null || true
```

If `.academic-helper/profile.md` exists and its `## Tools` JSON block contains a `candlekeep` key but no `zotero` key, perform a one-time migration: rewrite the JSON block in-place to drop `candlekeep` and add `"zotero": {"enabled": <value of old candlekeep.enabled>, "mode": "local"}` before proceeding.

Profile schema, file format, and legacy migration script: see `references/profile-schema.md`.

Check for existing profile:

```bash
cat .academic-helper/profile.md 2>/dev/null && echo "EXISTS" || echo "NOT_FOUND"
```

**If EXISTS**: Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
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
> - `.academic-helper/` — your profile (auto-managed)
>
> Let's start."

---

## Phase 1: Integration Detection

Per-tool detection commands, AskUserQuestion-equivalent asks, and port-fallback logic: see `references/integration-setup.md`.

After running detection (parallel batch), store the tool selection as the `tools` object for Phase 4.

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
> 2. **English** — Left-to-right, Times New Roman, Chicago/MLA/APA supported.
>    ```
>    English Mode
>    ────────────
>    Direction:  LTR
>    Font:       Times New Roman 12pt
>    Citations:  Chicago, MLA, or APA
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
> 2. **Chicago / Turabian** — Footnotes with full bibliography — most common in English Humanities.
>    ```
>    Chicago / Turabian
>    ──────────────────
>    Example footnote:
>      ¹ Levy, The Soul's Teaching, 42.
>
>    When to use:
>      ✓ English Humanities articles
>      ✓ History, Philosophy, Literature
>      ✓ Requires bibliography section
>    ```
> 3. **MLA** — Parenthetical with Works Cited page.
>    ```
>    MLA
>    ───
>    Example: (Levy 42)
>
>    When to use:
>      ✓ Literature and language studies
>      ✓ Humanities with Works Cited
>    ```
> 4. **APA** — (Author, Year) style — more common in social sciences.
>    ```
>    APA
>    ───
>    Example: (Levy, 2019, p. 42)
>
>    When to use:
>      ✓ Social sciences
>      ✓ Psychology, Education, Linguistics
>    ```
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

Map selection: Inline → `inline-parenthetical`, Chicago → `chicago`, MLA → `mla`, APA → `apa`.

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

```bash
ls past-articles/
```

**Step 1: Computational extraction** — Run the metrics extraction script to get hard numbers.

First fetch the **shared Hebrew baseline** from Zotero (book *Hebrew Linguistic Reference*, mirrored on GitHub at [JackMatanky/hebrew-linguistics-data](https://github.com/JackMatanky/hebrew-linguistics-data); the same book is read by the `hebrew-book-producer` plugin so both share one source of truth):

```bash
mkdir -p .ctx
```

Call `zotero_get_item_fulltext(item_key="cmomjonvy0fdmk30zwef79c48")` and use the Write tool to save the returned text to `.ctx/hebrew-linguistic-reference.md`.

Then run the extractor:

```bash
python3 "$ACADEMIC_WRITER_ROOT"/scripts/extract-style-metrics.py \
  --input past-articles/ \
  --aggregate \
  --baseline .ctx/hebrew-linguistic-reference.md \
  --contrastive \
  --json \
  --output /tmp/style-metrics.json
```

The extractor reads the baseline JSON code block embedded in the `08-style-fingerprint-baseline` chapter of the cached markdown, so there is no separate JSON file in the plugin's `references/` folder.

Read the results:
```bash
cat /tmp/style-metrics.json
```

This gives you 30+ numerical metrics (sentence length, passive voice, transitions, etc.) and contrastive scores showing what's distinctive about this researcher vs. baseline academic Hebrew.

**Step 2: Text extraction for qualitative analysis** — For each file, extract text:
- PDF: `python3 -c "import sys; import pdfplumber; [print(p.extract_text()) for p in pdfplumber.open(sys.argv[1]).pages]" past-articles/FILENAME 2>/dev/null || strings past-articles/FILENAME | head -500`
- DOCX: `python3 -c "import docx; d=docx.Document('past-articles/FILENAME'); [print(p.text) for p in d.paragraphs]" 2>/dev/null`

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

**If Zotero is enabled:**

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "Let's index your research library. Have you added sources to Zotero yet?"
> 1. **Yes, index my sources now** — I'll enrich and index everything in your Zotero library.
>    ```
>    Source Indexing
>    ───────────────
>    → Lists all items in your library
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

If **"Yes"**: list and enrich all items:

Call `zotero_get_collections()` + `zotero_get_collection_items()` to list all items (or `zotero_get_recent()` for a flat recent-items view).

For each item ID, call `zotero_get_item_metadata(format="json")`.

Tell the researcher: "Enriching your sources — extracting titles, authors, and table of contents from each document. This may take a moment..."

After enrichment, re-list and build the sources array (id + title + type only — never raw JSON).

**If Zotero is NOT enabled**: set sources to `[]`.

---

## Phase 4: Save Profile + Register Workflows

Use the Write tool to save `.academic-helper/profile.md`:

```markdown
# Academic Writer Profile

---
fieldOfStudy: FIELD_HERE
citationStyle: inline-parenthetical
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
  "zotero": { "enabled": true, "mode": "local" },
  "notebooklm": { "enabled": false }
}
` ` `

## Output Format Preferences

```json
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
>      .academic-helper/profile.md
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
