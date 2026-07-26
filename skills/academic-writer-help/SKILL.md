---
name: academic-writer-help
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

```
/skill:academic-writer-init
```

This walks you through:
- Setting your **field of study** (e.g., History, Literature, Philosophy)
- Choosing your **citation style** (Chicago, MLA, APA)
- Analyzing your **writing style** from past articles (place 5–10 PDFs or DOCX files in `past-articles/`)
- Connecting your **data tools** (all optional):

| Tool | What it does |
|------|-------------|
| **Zotero** | Reference manager — your source PDFs and research materials |

---

## Slash Commands

| Command | What it does |
|---------|-------------|
| `/skill:academic-writer-write` | **Write a new article** — the full pipeline from subject to .docx |
| `/skill:academic-writer-edit` | **Edit an article** — revise sections, fix citations, adjust tone, restructure |
| `/skill:academic-writer-edit-section` | **Edit one section** — fast, focused single-section edit |
| `/skill:academic-writer-proofread` | **Proofread (הגהה)** — mechanical fixes (typos, punctuation, typography) + a change report; never rewrites prose |
| `/skill:academic-writer-research` | **Research a topic** — query your sources, get answers with citations |
| `/skill:academic-writer-init` | **First-time setup** — profile, style analysis, source indexing |
| `/skill:academic-writer-health` | **System check** — verify all integrations are working |
| `/skill:academic-writer-review` | **Self-review** — score a completed article on 6 quality dimensions |
| `/skill:academic-writer-ideate` | **Brainstorm ideas** — 5W1H framework, gap analysis, research question formulation |
| `/skill:academic-writer-setup` | **Quick setup** — creates profile, detects integrations |
| `/skill:academic-writer-voice` | **Deep voice profile** — Stage 2 adversarial interview (7 sessions) |
| `/skill:academic-writer-export` | **Export to other formats** — convert an article to PDF, HTML, ODT, LaTeX, or EPUB |
| `/skill:academic-writer-help` | **This help page** |

### Internal skills (invoked from other skills)

These don't have their own slash command; they run as sub-workflows:

- `academic-writer-learn` — run after dropping new files in `past-articles/` (auto-invoked by the dashboard hint)
- `academic-writer-update-tools` / `academic-writer-update-field` — invoked from within `init` or `setup`
- `academic-writer-present` — invoked from `edit` or `write` after a final article ships
- `academic-writer-feedback` — invoked from `edit` after researcher review

---

## How Article Writing Works

When you run `/skill:academic-writer-write`, you go through a conversational pipeline:

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
9. **Output** — `.docx` with footnotes and bibliography (Inline Parenthetical), or via Pandoc + your citation style's CSL file against `.academic-helper/bibliography.bib` (Chicago/MLA/APA) — run `/skill:academic-writer-export` afterward for PDF/HTML/ODT/LaTeX/EPUB

---

## How Editing Works

When you run `/skill:academic-writer-edit`, you can:
- **Revise sections** — rewrite or restructure any section (full skill pipeline: draft → style → grammar → repetition → audit)
- **Fix citations** — re-audit all footnotes, correct page numbers, add missing citations
- **Adjust tone** — make sections more/less formal, assertive, cautious — checked against your fingerprint
- **Restructure** — reorder, split, merge, add, or remove sections
- **Strengthen arguments** — find additional evidence, address counterarguments
- **Cut or expand** — shorten or lengthen specific sections
- **Full review** — run the complete synthesis + style compliance pass

For quick, single-section work, use `/skill:academic-writer-edit-section` instead — it's faster because it only processes one section.

Both edit skills spawn **parallel subagents** for speed — multiple sections are edited simultaneously, and research queries (for finding new evidence) run in parallel across RAG and Zotero.

---

## How Research Works

When you run `/skill:academic-writer-research`, you can:
- Ask questions about your sources ("What does X say about Y?")
- Explore topics across all your documents
- Compare how different authors treat a concept
- Find exact quotes with page numbers
- Browse your Zotero library

This is independent of the article pipeline — use it anytime you want to query your research materials.

---

## Your Style Fingerprint

The fingerprint is extracted from your past articles during `/skill:academic-writer-init`. It captures 25 dimensions of your writing across 8 categories:

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

---

## Speed & Parallelism

The plugin is designed for speed. Wherever possible, work is parallelized:

| Operation | What happens |
|-----------|-------------|
| **Deep read** | 3 RAG queries run simultaneously, then entity queries in parallel |
| **Section writing** | One subagent per section, all writing at the same time |
| **Research** | RAG + Zotero queried by separate subagents in parallel |
| **Editing multiple sections** | One section-writer subagent per section, all in parallel |
| **Citation audit (edit)** | One auditor per section, all in parallel |

---

## Files & Folders

| Path | Purpose |
|------|---------|
| `.academic-helper/profile.md` | Your researcher profile (field, style, tools, sources) |
| `.academic-helper/bibliography.bib` | BibTeX export of your Zotero sources (Chicago/MLA/APA articles) |
| `past-articles/` | Your published papers for style analysis (never uploaded) |
| `.claude/agents/` | AI agent prompts (deep-reader, architect, section-writer, auditor, synthesizer) |
| `references/` | API documentation for integrations |

---

## Troubleshooting

- **Something not working?** → Run `/skill:academic-writer-health` to check all components
- **Want to change your field?** → `/skill:academic-writer-update-field`
- **Want to add/remove tools?** → `/skill:academic-writer-update-tools`
- **Style not matching?** → Add more past articles to `past-articles/` and re-run `/skill:academic-writer-init`

---

## Critical Guarantees

1. **No fabricated citations** — Every claim verified against your sources
2. **No invented page numbers** — Exact quotes confirmed via RAG bypass + Zotero
3. **Your voice** — Every paragraph checked against your style fingerprint
5. **Your data stays local** — Past articles are never uploaded anywhere
