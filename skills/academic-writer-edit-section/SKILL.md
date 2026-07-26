---
name: academic-writer-edit-section
description: "Quick edit of a single section — rewrite, expand, cut, fix citations, or adjust style. Faster than full article edit. Use when changing one specific section only — faster than full edit."
allowed-tools: bash read write glob grep subagent
metadata: {author: "Yotam Fromm", version: "0.2.19"}
---

# Academic Writer — Edit Section

> **Do NOT use this skill** for multi-section edits, restructuring, or full-article tone changes — use `/skill:academic-writer-edit` instead.

A fast, focused edit for a single section of an article. Use this instead of `/skill:academic-writer-edit` when you know exactly which section needs work.

### Voice profile load (first step of every run)

1. Read `AUTHOR_VOICE.md` from project root. Whole file goes into the section-writer system prompt.
2. The section writer is instructed to weight `## Academic-specific` rules higher when they
   conflict with `## Core voice` rules; everything else applies as written.

If `AUTHOR_VOICE.md` is missing or empty, warn once: "No voice profile. Run `/skill:academic-writer-init`
to seed it." Do not block writing.

---

## Load Profile

```bash
cat .academic-helper/profile.md
```

**Load the full `styleFingerprint`** — edits must maintain the researcher's voice.

---

## Identify the Section

Ask:
> "Which section do you want to edit? Give me the section title, number, or paste the text."

If the article is in a file:
```bash
python3 -c "import docx; d=docx.Document('FILE_PATH'); [print(p.text) for p in d.paragraphs]"
```

Parse the target section and all surrounding sections (needed for repetition checking and transition context).

---

## Load the Source Registry (citation-verification prerequisite)

The auditor's Check D verifies citation fields against `.academic-helper/sources.json`. A single-section edit still relies on this registry being present and current for the works cited in that section.

```bash
cat .academic-helper/sources.json 2>/dev/null || echo "MISSING"
```

- **If `sources.json` is missing**, or **if the sources cited in this section aren't represented in the registry** (stale — the deep-reader overwrites it per write run), tell the researcher:
  > "I don't have a current source registry for this section's citations, so citation verification (Check D) will be limited. Want to re-run the deep-reader on these sources before I edit, so the audit can verify bibliographic metadata?"
- If the researcher agrees, re-run the deep-reader on this section's sources (hand back to `/skill:academic-writer-edit` or the write pipeline, which owns the deep-reader spawn) so `.academic-helper/sources.json` is refreshed before editing.
- If the researcher declines, proceed but warn that Check D will be skipped for any citation whose source isn't in the registry.

---

## Understand the Edit

Ask:
> "What should I change in this section?"

Common edit types:
- **Rewrite** — "Make this clearer" / "Rewrite paragraph 3"
- **Expand** — "Add more evidence for the claim about X"
- **Cut** — "This is too long, trim it"
- **Fix citations** — "Check all the footnotes"
- **Adjust style** — "This doesn't sound like me"
- **Add paragraph** — "Add a paragraph about X between paragraphs 2 and 3"
- **Remove paragraph** — "Delete the paragraph about X"

---

## Execute the Edit

### For rewrites / expansions / new paragraphs:

**Use the `subagent` tool to spawn a `section-writer` subagent** with the full pipeline (draft → style compliance → Hebrew grammar → repetition check → citation audit).

Pass as prompt: the section (title, current text, edit instructions, suggested sources), sectionIndex, thesis, styleFingerprint, citationStyle, tools, priorSectionTexts (text of adjacent sections for repetition awareness).

If the researcher wants to expand with new evidence, **first use the `subagent` tool to spawn research subagents in parallel** — call the `subagent` tool multiple times in a single response — each call executes independently and pi runs sibling tool calls from one assistant message concurrently by default, matching the existing parallel-subagent pattern with zero behavior change:
- One subagent for RAG queries on the expansion topic
- One subagent for Zotero reads for relevant documents

Then feed results to the section-writer.

### For citation fixes:

**Use the `subagent` tool to spawn an `auditor` subagent** for each paragraph. Pass as prompt: the paragraph text, sectionIndex, paragraphIndex, tools.

Apply fixes, re-audit until all pass.

### For cuts:

1. Identify which sentences/paragraphs to remove
2. Check that no critical argument steps are lost
3. Check that remaining transitions still work
4. Re-run style compliance on the shortened section
5. Show the researcher what was cut before finalizing

### For style adjustments:

1. Re-read `styleFingerprint`
2. Score every paragraph on 10 fingerprint dimensions
3. Fix any dimension scoring ≤3
4. Use `representativeExcerpts` as targets
5. Show before/after for the researcher

---

## Output

Show the revised section with a change summary:

> **Section "[title]" — revised:**
>
> [Full revised text with footnotes]
>
> **Changes:**
> - Paragraph 2: [what changed]
> - Paragraph 4 (new): [added with citations from X, Y]
> - Citations: [N] verified, [N] corrected
>
> **Skills applied:**
> - Style compliance: avg [N]/5
> - Hebrew grammar: [N] issues fixed
> - Repetition: [N] instances resolved
> - Citation audit: [N] claims verified
>
> Would you like me to export the full updated article as .docx?

**NOTE:** if the researcher says yes, exporting follows the same `citationStyle` branch documented in write-article's Step 9 (and edit-article's Output step): JSON schema → `generate-docx.py` for `inline-parenthetical` (unchanged), or `pandoc "$MD_PATH" --citeproc -o "$DOCX_PATH"` for citeproc mode using the resolved CSL file in the markdown frontmatter. This skill does not define its own export procedure — see those two skills for the resolver contract and exact commands.

---

