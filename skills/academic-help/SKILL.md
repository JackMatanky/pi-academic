---
name: academic-help
description: "Learn what the Academic Writer plugin does and how to use it. Use when you don't know which command to run."
allowed-tools: read
metadata: {author: "Yotam Fromm", version: "0.2.23"}
---

# Academic Writer — Help

Display a friendly, comprehensive guide to the Academic Writer plugin. No profile or tools required — this is pure documentation.

---

Print the following (adapt formatting for readability):

---

## What is Academic Writer?

Academic Writer is an AI-powered writing assistant built for **Humanities researchers**. It helps you produce rigorously cited, style-matched academic articles as .docx files.

What makes it different:

- **Your voice, not AI voice** — It analyzes your past publications to learn your writing style (sentence patterns, vocabulary, tone, transitions, rhetorical moves) and checks every paragraph against that fingerprint.
- **Citation integrity** — Every claim is grounded in your indexed sources. An auditor agent verifies every footnote before it's included. Nothing is fabricated.
- **Full audit trail** — Every step of the writing process is logged, so you can see exactly how each paragraph was drafted, checked, and approved.

---

## Getting Started

### 1. Initialize your profile

```text
/skill:academic-setup
```

This walks you through:

- Setting your **field of study** (e.g., History, Literature, Philosophy)
- Choosing your **citation style** (Inline Parenthetical, popular APA/MLA/Chicago aliases, a Zotero/CSL style id, URL, or a custom `.csl` file)
- Analyzing your **writing style** from past articles (place 5–10 PDFs or DOCX files in `past-articles/`)
- Connecting your **data tools** (all optional):

| Tool | What it does |
|------|-------------|
| **Zotero** | Reference manager — preferred source for PDFs and research materials; can be scoped to one collection |
| **Local Sources** | `.academic-writer/sources/` folder for local PDFs, DOCX, TXT, or MD files ingested via `academic_writer_ingest_sources` |
| **NotebookLM** | AI source Q&A / audio / study guides; can be scoped to one notebook |
| **Sefaria** | Primary Judaic text reference and chapter/verse context expansion (`get_text`, `search`) |

---

## Slash Commands

| Command | Purpose |
|---|---|
| `/skill:academic-write` | Frame a research question or write a new article |
| `/skill:academic-research` | Research or fact-check without starting an article |
| `/skill:academic-edit` | Edit an article; supports narrow section and structural modes |
| `/skill:academic-review` | Review quality or use the mechanical proofread mode |
| `/skill:academic-setup` | Quick/full onboarding, field updates, and integrations |
| `/skill:academic-voice` | Refresh style from new corpus, interview, calibrate, or audit |
| `/skill:academic-feedback` | Turn researcher feedback into article/profile improvements |
| `/skill:academic-health` | Diagnose project and integration readiness |
| `/skill:academic-export` | Convert a finished article to another format |
| `/skill:academic-present` | Create presentation or submission deliverables |
| `/skill:academic-help` | Show this help and routing guidance |

Modes inside a skill are not separate skill commands: `academic-write` includes standalone ideation; `academic-edit` includes single-section editing; `academic-review` includes mechanical proofreading; `academic-setup` includes quick/full setup and profile/integration maintenance; `academic-voice` includes corpus refresh and the interview lifecycle.

## How Article Writing Works

When you run `/skill:academic-write`, you go through a conversational pipeline:

### Phase 1: Planning (you + AI together)

1. **Subject** — Tell me what you want to write about
2. **Sources** — Select which of your indexed sources to use
3. **Deep Read** — AI explores your sources to map what's available
4. **Thesis** — AI proposes 2–3 thesis statements; you pick or modify
5. **Outline** — AI generates a structured outline; you refine it

### Phase 2: Writing (AI, with guardrails)

6. **Section Writing** — One AI agent per section, all writing in parallel
7. **Per-paragraph quality pipeline:**
   - **Draft** — Written using your sources, applying your style fingerprint
   - **Style Compliance** — Scored against your fingerprint on 10 dimensions
   - **Hebrew Grammar** — Academic Hebrew quality check (when applicable)
   - **Repetition Check** — No repeated words, phrases, or arguments
   - **Citation Audit** — Every footnote verified against sources (hard gate)
8. **Synthesis** — Final coherence review + full-article style compliance
9. **Output** — `.docx` with footnotes and bibliography (Inline Parenthetical), or via Pandoc + a resolved CSL file against `.academic-writer/bibliography.bib` (popular alias, Zotero/CSL style id, URL, or custom `.csl`) — export DOCX, ODT, LaTeX (`.tex`), or PDF; PDF supports `xelatex` or `tectonic`

---

## How Editing Works

When you run `/skill:academic-edit`, you can:

- **Revise sections** — rewrite or restructure any section (full skill pipeline: draft → style → grammar → repetition → audit)
- **Fix citations** — re-audit all footnotes, correct page numbers, add missing citations
- **Adjust tone** — make sections more/less formal, assertive, cautious — checked against your fingerprint
- **Restructure** — reorder, split, merge, add, or remove sections
- **Strengthen arguments** — find additional evidence, address counterarguments
- **Cut or expand** — shorten or lengthen specific sections
- **Full review** — run the complete synthesis + style compliance pass

For quick, single-section work, choose the single-section mode within `/skill:academic-edit`; it processes only the selected unit and preserves unrelated text.

## Scoped editing

The edit skill can work on one section or a broader set of affected units. It preserves untouched prose and uses the structured outline/snapshot/audit workflow when an argument or evidence change requires it.

## How Research Works

When you run `/skill:academic-research`, you can:

- Ask questions about your sources ("What does X say about Y?")
- Explore topics across all your documents
- Compare how different authors treat a concept
- Find exact quotes with page numbers
- Browse your Zotero library

This is independent of the article pipeline — use it anytime you want to query your research materials.

---

## Your Style Fingerprint & Voice Hierarchy

The voice system follows a clear 3-tier hierarchy:

1. **Canonical Runtime Source of Truth**: `.academic-writer/profile.md` (`styleFingerprint`). The fingerprint is extracted from your past articles during `/skill:academic-setup` and captures 25 dimensions across 8 categories.
2. **Optional Prose Overlay**: `.academic-writer/voice/profile.md` in project root. Loaded via `voice_profile_load` as high-level human guidelines.
3. **Intermediate Mining Artifact**: `.academic-writer/voice/fingerprint.md` is an intermediate output from mining tools and is **NOT** a runtime source of truth.

| Category | What it tracks |
|----------|---------------|
| **Sentence-level** | Length, structure variety, openers, passive voice |
| **Vocabulary** | Complexity, register, field jargon, Hebrew conventions |
| **Paragraph structure** | Pattern, length, argument progression, evidence handling |
| **Tone & voice** | Descriptors, authorial stance, hedging/asserting, engagement |
| **Transitions** | Preferred phrases by function, section bridging |
| **Citations** | Density, integration style, quote length |
| **Rhetorical patterns** | Common moves, opening/closing strategies |
| **Representative excerpts** | 5 real passages as style targets |

Every paragraph is scored against this fingerprint. The synthesizer also runs a full-article compliance check at the end.

## Speed & Parallelism

The plugin is designed for speed. Wherever possible, work is parallelized:

| Operation | What happens |
|-----------|-------------|
| **Deep read** | Source documents queried in parallel across Zotero and local sources |
| **Section writing** | One subagent per section, all writing at the same time |
| **Research** | Zotero + local ingested sources queried by separate subagents in parallel |
| **Editing multiple sections** | One section-writer subagent per section, all in parallel |
| **Citation audit (edit)** | One auditor per section, all in parallel |

## Files & Folders

| Path | Purpose |
|------|---------|
| `.academic-writer/profile.md` | Your researcher profile (field, style, tools, optional Zotero collection / NotebookLM notebook, sources) |
| `.academic-writer/sources/` | Local folder for PDFs, DOCX, TXT, MD source documents |
| `.academic-writer/bibliography.bib` | BibTeX export of your sources for citeproc articles |
| `articles/<slug>.sources.json` | Article-local citation registry snapshot |
| `articles/<slug>.bibliography.bib` | Article-local BibTeX bibliography snapshot |
| `past-articles/` | Your published papers for style analysis (never uploaded) |
| `agents/` | AI agent prompts (deep-reader, architect, section-writer, auditor, synthesizer) |
| `references/` | API documentation for integrations |

---

## Troubleshooting

- **Something not working?** → Run `/skill:academic-health` to check all components
- **Want to change your field?** → `/skill:academic-setup`
- **Want to add/remove tools?** → `/skill:academic-setup`
- **Style not matching?** → Add more past articles to `past-articles/` and re-run `/skill:academic-setup`

---

## Critical Guarantees

1. **No fabricated citations** — Every claim verified against your sources
2. **No invented page numbers** — Exact quotes confirmed via Zotero or local source reads
3. **Your voice** — Every paragraph checked against your style fingerprint
4. **Your data stays local** — Past articles are never uploaded anywhere
