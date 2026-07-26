---
name: academic-writer-write
description: "Write a new academic article. Conversational pipeline: subject → sources → deep read → thesis → outline → write → audit → .docx. Use when starting a new article from scratch — subject, sources, thesis, outline, draft."
allowed-tools: bash read write glob grep subagent
metadata: {author: "Yotam Fromm", version: "0.2.19"}
---

# Academic Writer — Write Article

You are an academic writing assistant for a Humanities researcher.


### Voice profile load (first step of every run)

1. Read `AUTHOR_VOICE.md` from project root. Whole file goes into the section-writer system prompt.
2. The section writer is instructed to weight `## Academic-specific` rules higher when they
   conflict with `## Core voice` rules; everything else applies as written.

If `AUTHOR_VOICE.md` is missing or empty, warn once: "No voice profile. Run `/skill:academic-writer-init`
to seed it." Do not block writing.

## Load Profile

Start by loading the researcher's profile:

```bash
cat .academic-helper/profile.md
```

If the profile doesn't exist, tell them: "Please run `/skill:academic-writer-init` first to set up your profile."

Store the profile values — you'll use them throughout.

### Style Fingerprint — Always Loaded

**The `styleFingerprint` is the most critical part of the profile.** Read it carefully and keep it in context throughout the entire pipeline. Every paragraph and every review step checks against it.

Print a summary of the fingerprint to confirm it's loaded:
> "Loaded your style fingerprint:
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

Read the `tools` object from the profile. Throughout this workflow, **only use tools that are enabled**:

- **Zotero** (`tools.zotero.enabled`) — If disabled, skip Zotero tool calls. Source listing/selection steps should use any available sources from the profile's `sources` array instead.
- **NotebookLM** (`tools.notebooklm.enabled`) — If disabled, skip notebook queries and AI summaries. NotebookLM is supplementary — it does not replace Vectorless/Zotero for citation verification.

If the profile has no `tools` key (legacy profile), assume all tools are enabled for backward compatibility.

---

## Pre-flight: existing-article guard

After computing the candidate slug from the user-supplied subject, check whether the article already exists:

```bash
SLUG="$(echo "$SUBJECT" | python3 -c "import sys,re; t=sys.stdin.read().strip().lower(); print(re.sub(r'[^a-z0-9]+', '-', t).strip('-')[:60])")"
MD_PATH="articles/${SLUG}.md"

if [ -f "$MD_PATH" ]; then
  echo "An article already exists at $MD_PATH."
  echo "Switching to edit mode — running /skill:academic-writer-edit instead of overwriting."
  echo "If you intended to start over, delete $MD_PATH first."
  # Hand off to the edit skill rather than continuing the write pipeline.
  exit 0
fi
```

If the file exists, the skill MUST stop the write pipeline and tell the user to use `/skill:academic-writer-edit articles/${SLUG}.md` (or `/skill:academic-writer-edit-section` for a single section). Do NOT continue with deep-reader, architect, etc., because writing inline at that point produces ungated prose (the 2026-05-02 mikdashim post-compaction failure).

If the file does not exist, proceed with Phase 1 normally.

## PHASE 1: CONVERSATIONAL (Steps 1–5, human-in-the-loop)


```bash
# Validate wf_write_article has nodes — if empty, re-register from plugin cache
if [ "$_AW_NODES" -eq 0 ]; then
  _AW_DIR=$(find ~/.claude/plugins/cache -name "wf_write_article.json" -path "*/workflows/*" 2>/dev/null | head -1 | xargs dirname 2>/dev/null)
fi
echo '{"subject": "pending", "phase": "conversational"}' > /tmp/aw-run-input.json
```

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
  - "Expand my draft using sources" — use their structure as the approved outline; skip the architect's outline generation (Step 5); pass their draft text to each section-writer as the starting point to expand and anchor in sources
  - "Use my draft as context, propose a new structure" — treat their draft as research input for the architect; run the full thesis+outline flow normally

Store the draft text as `userDraftText` regardless of which option is chosen. If the researcher chose "Expand my draft", set `userDraftAsOutline = true`.


---

### Step 2: Source Selection


**If Zotero is enabled**, enrich all items then list them:

Call `zotero_get_collections()` + `zotero_get_collection_items()` to list all items.

**If Zotero is NOT enabled**, use the `sources` array from the profile (indexed during init) to present available sources. If the sources array is empty, ask the researcher to describe their sources manually.

Present them clearly and ask:
> "Which of these sources should I focus on? You can name them by number, by title, or say 'all'."

After researcher confirms selection, log:

---

### Step 2b: NotebookLM Source Query (if enabled)

**Skip this entire step if `tools.notebooklm.enabled` is false.**

Before spawning the deep-reader, directly query NotebookLM for the article subject using MCP tools:

1. **List available notebooks** using the `notebook_list` MCP tool (no parameters needed).

2. **Query each relevant notebook** for the article subject using the `notebook_query` MCP tool:
   - Query: "What key arguments, evidence, and sources do you have about [SUBJECT]?"

3. **Show a brief summary** to the researcher:
   > "Your NotebookLM has [N] notebook(s). Key findings about your topic:
   > [bullet list of relevant results]
   > These will be passed to the deep-reader for source verification."

Pass the NotebookLM summary as additional context to the deep-reader agent prompt in Step 3.

**Important:** NotebookLM answers are AI-synthesized context. All citations must still be verified via Zotero or RAG — never cite NotebookLM output directly.

---

### Step 3: Deep Read


**Use the `subagent` tool to spawn the `deep-reader` subagent.** Pass as the prompt: the article subject, selectedSourceIds, tools configuration, AND `targetLanguage` (so the deep-reader emits its structured summary in the right language).

The deep-reader runs:
- **Step 1**: Read source content from Zotero
- **Step 1b**: Extract structured bibliographic metadata per source and write `.academic-helper/sources.json`. This registry is the ONLY trusted source for citation metadata in Step 7. Fields the deep-reader cannot confirm are marked `null` with `extractionConfidence: "low"` — never guessed.
- **Step 2**: Query NotebookLM notebooks (if enabled) for thematic context


Wait for the deep-reader to return retrieved passages before continuing to Step 4. Confirm `.academic-helper/sources.json` exists.

After receiving the deep-reader result, mark node complete:

---

### Step 4: Thesis Proposal


**Use the `subagent` tool to spawn the `architect` subagent.** Pass the subject, deep read results, and targetLanguage as the prompt.


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

### Step 5: Outline + Approval

**If the researcher chose "Expand my draft" in the draft detection step (`userDraftAsOutline = true`):**

- Do NOT skip the architect entirely. The outline comes from the user's draft, but the architect is still the sole writer of `.academic-helper/evidence-ownership.json` — and without it the per-paragraph thesis-drift guard and the cross-section evidence-dedup both silently no-op. **Use the `subagent` tool to spawn the `architect` subagent in a lightweight "ownership-only" mode**: pass `userDraftText`, the deep-read results / `sources.json`, and `targetLanguage`, and instruct it to produce ONLY `evidence-ownership.json` (the `thesisAnchor` derived from the draft plus the `evidenceOwners` assignment for shared evidence) — it must NOT generate a new outline or thesis options, since those come from the user's draft.
- Parse `userDraftText` into sections: use the user's existing section headings and paragraph structure as the outline
- Present the extracted outline to the researcher:
  > "Using your draft structure:
  > [list extracted sections]
  > Each section-writer will expand these using source material. Confirm or adjust."
- Get approval, then proceed directly to Step 6 (ingestion sync) and Step 7 (section-writers)
- Pass `userDraftText` sections as `userDraftParagraphs` in each section-writer's prompt, so agents expand existing content rather than writing from scratch
- Log outline approval:

**If no draft (normal flow):**


**Use the `subagent` tool to spawn the `architect` subagent again** with the approved thesis, deep read results, targetWordCount, and targetLanguage.

The architect runs in Mode B:
- Produces the outline (titles, roles, suggested sources, word counts, paragraph counts) in `targetLanguage`
- Writes `.academic-helper/evidence-ownership.json` — for every evidence anchor (source, passage, dataset) appearing in more than one section, assigns exactly ONE section as the owner of the full description. Other sections must back-reference.
- Enforces a conciseness budget: body-section descriptions ≤ 2 sentences, intro/conclusion ≤ 3 sentences, no 5+ word phrase repeated across descriptions.


After receiving the architect result, mark node complete:

Present the outline and invite refinement:
> "Here's my proposed structure:
> [outline sections with titles and roles]
>
> What would you change? Add, remove, or reorder sections?"

Iterate until the researcher says something like "go", "looks good", or "start writing".


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

### Step 6: Parallel Section Writing + Auditing

**CRITICAL: Use the `subagent` tool to spawn one `section-writer` subagent per section. Call the `subagent` tool multiple times in a single response — one call per section — so all sections write in parallel.**


For each section in the approved outline, the `subagent` tool prompt must include:
- `section`: the section spec (title, description, argument role, suggested sources, paragraph count)
- `sectionIndex`: the section number
- `totalSections`: total section count
- `thesis`: the article thesis
- `articleStructure`: the researcher's structure conventions
- `citationStyle`: from the profile
- `targetLanguage`: from the profile
- `targetWordCount`: the requested article length (so each section is sized proportionally)
- `tools`: the enabled tools
- `priorSectionTexts`: text of all previously completed sections (for repetition awareness)
- `outlineOverview`: full outline titles and roles
- `userDraftParagraphs`: (if `userDraftAsOutline = true`) the user's draft text for this section — agents expand this rather than writing from scratch

**NOTE:** Do NOT pass `styleFingerprint`, `linkingWords`, `sourcesRegistry`, or `evidenceOwnership` in the prompt — section-writer agents load all four directly from disk to reduce context size:
- Fingerprint from `.academic-helper/profile.md`
- Linking words from `"$ACADEMIC_WRITER_ROOT"/words.md`
- Source registry from `.academic-helper/sources.json` (deep-reader output)
- Evidence ownership map from `.academic-helper/evidence-ownership.json` (architect output)

Each section-writer handles a **per-paragraph 8-skill pipeline** internally — in order: Draft → Style Compliance → Hebrew Grammar → Academic Language → Language Purity → Anti-AI → Repetition Check → Citation Audit (logged per paragraph as `section_N_p_M_<skill>`). The authoritative contract for that pipeline — exact skill behavior, the 220-word ceiling, the `thresholds.json`-driven anti-AI gate, and the auditor hard gate (Citation Audit / Skill 8) — lives in the `section-writer` agent definition (`src/agents/section-writer.md`). Do not duplicate or override it here; the orchestrator only spawns section-writers and waits for their results.

After receiving each section-writer result, mark node complete:

---

### Step 8: Synthesis + Full-Article Repetition Check

Once all sections are approved, log the spawn event:

**Use the `subagent` tool to spawn the `synthesizer` subagent.** Pass the following as the prompt:
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

### Step 9: DOCX Output


Assemble the final article and write to both Markdown and DOCX:

```bash
# Output to project's articles/ directory (created if needed)
mkdir -p articles
FILEBASE="$(echo 'SUBJECT' | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | head -c 50)"
MD_PATH="articles/${FILEBASE}.md"
DOCX_PATH="articles/${FILEBASE}.docx"
```

#### Step 9a: Markdown Output

Branch by `citationStyle` (from the profile). Both branches below share the `$MD_PATH` / `$DOCX_PATH` variables set above.

##### `inline-parenthetical` (unchanged)

Use the `Write` tool to write the article as markdown to `$MD_PATH`. Structure:

```markdown
# ARTICLE_TITLE

*ARTICLE_THESIS*

## תקציר

[Abstract text from Step 8.5]

[If dual-language: second abstract under its own heading]

## Section Title (only if totalWords > 1500)

Paragraph 1 text with inline citations...

Paragraph 2 text...

## Next Section Title

...
```

**Rules:**
- Title as `# H1`, thesis as italic line below it
- Section headings as `## H2` — but only include them if `totalWords > 1500` (same rule as DOCX)
- Paragraphs separated by blank lines
- Keep all inline citations exactly as they appear (e.g., `(Author, Title, p. N)`)
- No extra formatting beyond what the article text already contains

##### Citeproc mode (any `citationStyle` except `inline-parenthetical`)

Citeproc-mode articles no longer carry literal citation text in the body — section-writer emits pandoc-markdown citation markers instead: `[@citeKeyA, p. N]` for a single citation, `[@citeKeyA; @citeKeyB, p. N]` for co-located citations, where each `citeKey` matches a `citeKey` value in `.academic-helper/sources.json` (never invented). Step 9a must prepend YAML frontmatter before the `# ARTICLE_TITLE` heading so pandoc's citeproc can resolve them in Step 9b.

Resolve the active CSL style to a local file path before writing frontmatter. The profile may provide:
- a bundled alias: `apa`, `mla`, `chicago`
- a bundled filename: `apa.csl`, `modern-language-association.csl`, `chicago-notes-bibliography.csl`
- a project/user `.csl` path
- a Citation Style Language repository id such as `chicago-author-date` or `nature` (download/cache on demand)

Run:

```bash
CSL_PATH=$(python3 "$ACADEMIC_WRITER_ROOT"/scripts/resolve-csl.py "$CITATION_STYLE" --download)
echo "$CSL_PATH"
```

If the researcher supplied a separate custom CSL reference in the profile (for example under `outputFormatPreferences.csl`, `outputFormatPreferences.cslPath`, or a `citation.csl` object), pass that value instead of `citationStyle`. Backward-compatible aliases still work: `chicago` resolves to `chicago-notes-bibliography.csl`, `mla` to `modern-language-association.csl`, and `apa` to `apa.csl`.

Use the `Write` tool to write `$MD_PATH` with this frontmatter, followed by the same body structure as the `inline-parenthetical` branch above (title, thesis, abstract, sections, paragraphs):

```markdown
---
title: "ARTICLE_TITLE"
lang: "he"  # or "en", from targetLanguage
bibliography: .academic-helper/bibliography.bib
csl: "RESOLVED_CSL_PATH"
---

# ARTICLE_TITLE

*ARTICLE_THESIS*

## תקציר

[Abstract text from Step 8.5]

## Section Title (only if totalWords > 1500)

Paragraph 1 text with [@citeKeyA, p. N] markers inline...
```

**Rules:**
- `lang` — the ISO code for `targetLanguage`: `"he"` for Hebrew, `"en"` for English (same source value that drives `isRtl` in the `inline-parenthetical` branch's JSON schema below)
- `bibliography` is always the literal path `.academic-helper/bibliography.bib` — the Phase-1 deep-reader output (Step 3)
- `csl` — replace `RESOLVED_CSL_PATH` with the literal output of `resolve-csl.py` above (an absolute path to a local `.csl` file)
- `bibliography:` and `csl:` are the only pandoc-citeproc frontmatter keys needed — pandoc reads them automatically at export time, no extra `--bibliography`/`--csl` CLI flags required
- Title as `# H1`, thesis as italic line below it, section headings only if `totalWords > 1500` — otherwise identical to the `inline-parenthetical` structure above
- Citations in the body are the raw `[@citeKeyA, p. N]` markers exactly as section-writer produced them — do NOT strip, reformat, or convert them to plain parenthetical or footnote text; pandoc's citeproc renders them at export time (Step 9b)
- `inline-parenthetical` articles get no frontmatter at all — this block is exclusive to citeproc mode

#### Step 9b: DOCX Output

Branch by `citationStyle` — same branch as Step 9a.

##### `inline-parenthetical` (unchanged)

Write the article data to a JSON file, then run the standalone DOCX generator script:

1. **Write the article JSON** using the Write tool to `/tmp/aw-article-data.json`. Use this exact schema — do NOT write inline Python to construct it:

```json
{
  "title": "ARTICLE_TITLE from synthesizer",
  "thesis": "ARTICLE_THESIS or null",
  "abstract": {
    "primary": "Abstract text in targetLanguage (from Step 8.5)",
    "secondary": "Optional abstract in second language, or null"
  },
  "sections": [
    {
      "title": "Section title",
      "paragraphs": [
        {
          "text": "Paragraph body with NO inline parenthetical citations.",
          "footnotes": [
            { "after": "substring in text to anchor the superscript marker", "text": "Author, Title (Pub, 2024), p. 42." }
          ]
        }
      ]
    }
  ],
  "format": {
    "font": "from profile.outputFormatPreferences.font or David",
    "bodySize": 11,
    "titleSize": 16,
    "headingSize": 13,
    "lineSpacing": 1.5,
    "margins": 1.0,
    "isRtl": true
  },
  "totalWords": 0
}
```

**Rules:**
- Use the `Write` tool to write this file — never use Python heredoc or `python3 -c` to construct JSON (Hebrew text causes UTF-8 encoding errors in heredocs)
- Populate `sections` from the synthesizer output — each section's title and paragraph list
- Paragraphs use the structured form `{text, footnotes[]}`. Strip the parenthetical citations out of `text` and move each citation into `footnotes[]` with `after` set to a unique substring in `text` where the marker should appear. The DOCX generator renders them as native Word footnotes (superscript in body, text at page bottom). Plain strings are still accepted for backward compatibility (no footnotes)
- Dependency: requires `lxml` (`pip install lxml`) in addition to `python-docx`
- Read `outputFormatPreferences` from the profile and fill in the `format` object
- Set `totalWords` to the actual word count (controls section title visibility — hidden when under 1500 words)
- Set `isRtl` based on `targetLanguage` (true for Hebrew, false for English)

2. **Generate the DOCX:**

```bash
python3 "$ACADEMIC_WRITER_ROOT"/scripts/generate-docx.py --input /tmp/aw-article-data.json --output "$DOCX_PATH"
```

The script handles all RTL formatting, directional marks, citation parentheses splitting, and conditional section titles deterministically.

##### Citeproc mode (any `citationStyle` except `inline-parenthetical`)

Skip the JSON-schema + `generate-docx.py` path entirely. Pandoc reads the frontmatter-bearing markdown Step 9a just wrote — `bibliography:` and `csl:` are already declared there, so no extra flags are needed beyond `--citeproc` itself:

```bash
pandoc "$MD_PATH" --citeproc -o "$DOCX_PATH"
```

**Current limitation:** this path does not run `generate-docx.py`, so it skips the Hebrew RTL post-processing (directional marks, RTL paragraph formatting) that script applies. If a researcher pairs `targetLanguage: Hebrew` with a citeproc CSL style, the exported `.docx` may need manual RTL adjustment unless their CSL/pandoc template handles it. This is not a new regression introduced by configurable CSL; call it out plainly in the completion report below rather than leaving it silent.

Log output completion:


Report to researcher:
> "Done! Your article has been saved to:
> - `articles/FILEBASE.docx` (formatted document)
> - `articles/FILEBASE.md` (markdown)
>
> Word count: [N] words
> Citations: [N] ([citationStyle] format)
> Sections: [N]
> Language: [targetLanguage]
> [If citeproc mode: Bibliography — `.academic-helper/bibliography.bib` via pandoc `--citeproc` (CSL: [resolved CSL path])]
>
> Quality checks applied per paragraph:
> - Style fingerprint compliance: avg [N]/5 score, [N] adjustments
> - Hebrew grammar: [N] issues fixed
> - Language purity: [N] foreign-term violations fixed
> - Repetition: [N] instances fixed
> - Citation audits: [N] claims verified, [N] rejections resolved
>
