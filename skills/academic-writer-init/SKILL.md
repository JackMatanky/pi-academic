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

**If EXISTS**: Use `a conversational ask`:

Ask the researcher directly in chat (present as a numbered/lettered list):\nUpdate Mode\n───────────\n✓ Field of study preserved\n✓ Style fingerprint preserved\n✓ Sources preserved\n→ Re-run only the steps you choose\n```"
    },
    {
      "label": "Start fresh",
      "description": "Delete the current profile and rebuild from scratch.",
      "markdown": "```\nFresh Start\n───────────\n⚠ Existing profile will be replaced\n⚠ Style fingerprint will be cleared\n⚠ Sources will be cleared\n→ Walk through all 4 phases again\n```"
    }
  ],
  "multiSelect": false
}])
```

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

Per-tool detection commands, a conversational ask blocks, and port-fallback logic: see `references/integration-setup.md`.

After running detection (parallel batch), store the tool selection as the `tools` object for Phase 4.

---

## Phase 2: Researcher Profile

### Step 1 of 4 — Field of Study

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "What is your field of study and area of specialization?"
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

Show examples below the question:
> "The more specific, the better. Examples:
> - *Early Modern Jewish Philosophy*
> - *Talmudic Literature and Rabbinic Thought*
> - *Medieval Hebrew Poetry*
> - *Biblical Studies — Pentateuch*"

Record the free-text answer as `fieldOfStudy`.

---

### Step 2 of 4 — Article Language

Ask the researcher directly in chat (present as a numbered/lettered list):\nHebrew Mode\n───────────\nDirection:  RTL\nFont:       David 11pt\nCitations:  (מחבר, כותרת, עמ' N) in running text\nPurity:     Foreign terms must be transliterated\n```"
    },
    {
      "label": "English",
      "description": "Left-to-right, Times New Roman, Chicago/MLA/APA supported.",
      "markdown": "```\nEnglish Mode\n────────────\nDirection:  LTR\nFont:       Times New Roman 12pt\nCitations:  Chicago, MLA, or APA\n```"
    },
    {
      "label": "Other",
      "description": "You'll specify the language name.",
      "markdown": "```\nOther Language\n──────────────\n→ You'll type the language name\n→ RTL/LTR detected from language\n→ Citation style: your choice\n```"
    }
  ],
  "multiSelect": false
}])
```

Store as `targetLanguage`. If "Other", ask for the language name with a follow-up `a conversational ask`.

---

### Step 3 of 4 — Citation Style

Ask the researcher directly in chat (present as a numbered/lettered list):\nInline Parenthetical\n────────────────────\nExample:\n  כפי שטוען לוי (לוי, משנת הנפש, עמ' 42), הרעיון\n  המרכזי הוא...\n\nWhen to use:\n  ✓ Hebrew articles\n  ✓ Short citation format\n  ✓ Dense citation density\n```"
    },
    {
      "label": "Chicago / Turabian",
      "description": "Footnotes with full bibliography — most common in English Humanities.",
      "markdown": "```\nChicago / Turabian\n──────────────────\nExample footnote:\n  ¹ Levy, The Soul's Teaching, 42.\n\nWhen to use:\n  ✓ English Humanities articles\n  ✓ History, Philosophy, Literature\n  ✓ Requires bibliography section\n```"
    },
    {
      "label": "MLA",
      "description": "Parenthetical with Works Cited page.",
      "markdown": "```\nMLA\n───\nExample: (Levy 42)\n\nWhen to use:\n  ✓ Literature and language studies\n  ✓ Humanities with Works Cited\n```"
    },
    {
      "label": "APA",
      "description": "(Author, Year) style — more common in social sciences.",
      "markdown": "```\nAPA\n───\nExample: (Levy, 2019, p. 42)\n\nWhen to use:\n  ✓ Social sciences\n  ✓ Psychology, Education, Linguistics\n```"
    }
  ],
  "multiSelect": false
}])
```

Map selection: Inline → `inline-parenthetical`, Chicago → `chicago`, MLA → `mla`, APA → `apa`.

---

### Step 3b of 4 — Abstract Languages

Ask the researcher directly in chat (present as a numbered/lettered list):\nSingle Abstract\n───────────────\nAbstract in: [targetLanguage]\nCommon for: Most journals\n```"
    },
    {
      "label": "Hebrew + English",
      "description": "Dual-language abstracts — common for Israeli journals.",
      "markdown": "```\nDual Abstract\n─────────────\nAbstracts in: Hebrew + English\nCommon for: Israeli journals,\n            academic theses\n```"
    },
    {
      "label": "No abstract needed",
      "description": "Skip abstract generation.",
      "markdown": "```\nNo Abstract\n───────────\nAbstracts will not be generated.\nYou can enable later with\n/skill:academic-writer-init (Update)\n```"
    }
  ],
  "multiSelect": false
}])
```

Store as `abstractLanguages` array:
- Primary only → `["Hebrew"]` (or whatever `targetLanguage` is)
- Hebrew + English → `["Hebrew", "English"]`
- No abstract → `[]`

---

### Step 4 of 4 — Writing Style

Ask the researcher directly in chat (present as a numbered/lettered list):\nStyle Analysis\n──────────────\n→ Reads PDF and DOCX files in past-articles/\n→ Analyzes 25 style dimensions:\n   sentence length, structure, vocabulary,\n   paragraph patterns, transitions, citations,\n   rhetorical moves, tone, intro/conclusion style\n→ Shows you the fingerprint before saving\n→ You can correct anything before it's stored\n```"
    },
    {
      "label": "Skip for now",
      "description": "Profile will be saved without a style fingerprint. Articles will use generic academic style.",
      "markdown": "```\nSkip Style Analysis\n───────────────────\n⚠ Articles won't match your voice yet\n→ Add papers to past-articles/ anytime\n→ Re-run: /skill:academic-writer-init\n   (choose 'Update' → 'Style Analysis')\n```"
    }
  ],
  "multiSelect": false
}])
```

**If "Yes, my papers are ready"**, run:

```bash
ls past-articles/
```

**Step 1: Computational extraction** — Run the metrics extraction script to get hard numbers.

First fetch the **shared Hebrew baseline** from Zotero (book *Hebrew Linguistic Reference*, mirrored on GitHub at [JackMatanky/hebrew-linguistics-data](https://github.com/JackMatanky/hebrew-linguistics-data); the same book is read by the `hebrew-book-producer` plugin so both share one source of truth):

```bash
mkdir -p .ctx
Zotero tools get cmomjonvy0fdmk30zwef79c48 > .ctx/hebrew-linguistic-reference.md
```

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

Ask the researcher directly in chat (present as a numbered/lettered list):\nSource Indexing\n───────────────\n→ Lists all items in your library\n→ Runs zotero_get_item_metadata(format="json") on each\n   (extracts title, author, TOC)\n→ Saves minimal metadata to profile\n   (id, title, type only)\n```"
    },
    {
      "label": "Skip — I'll add sources later",
      "description": "Run /skill:academic-writer-init again (choose Update → Sources) after adding items.",
      "markdown": "```\nSkip Sources\n────────────\n⚠ Articles won't have source metadata yet\n→ Add sources with: Zotero tools add file.pdf\n→ Then re-run this step\n```"
    }
  ],
  "multiSelect": false
}])
```

If **"Yes"**: list and enrich all items:

```bash
zotero_get_collections() then zotero_get_collection_items() or zotero_get_recent()
```

For each item ID:
```bash
zotero_get_item_metadata(format="json") ITEM_ID
```

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
  "Zotero": { "enabled": true },
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

Ask the researcher directly in chat (present as a numbered/lettered list):\nWrite Article\n─────────────\n→ /skill:academic-writer-write\n→ Conversational pipeline:\n   subject → sources → thesis\n   → outline → write → .docx\n```"
    },
    {
      "label": "Check system health",
      "description": "Run /skill:academic-writer-health to verify everything is working.",
    },
    {
      "label": "I'm done for now",
      "description": "Profile saved. Run /skill:academic-writer-write anytime to start writing.",
      "markdown": "```\nProfile saved to:\n  .academic-helper/profile.md\n\nKey commands:\n  /skill:academic-writer-write         ← write an article\n  /skill:academic-writer-health  ← check everything\n  /skill:academic-writer-update-tools ← change integrations\n```"
    }
  ],
  "multiSelect": false
}])
```

Show a summary table:

> | Setting | Value |
> |---------|-------|
> | Field | [field] |
> | Language | [language] |
> | Citation style | [style] |
> | Style fingerprint | ✓ Analyzed / — Skipped |
> | Sources indexed | [N] documents |
> | Tools enabled | [list] |
