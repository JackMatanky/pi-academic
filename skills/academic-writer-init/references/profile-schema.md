# Profile Schema (`.academic-writer/profile.md`)

> Loaded on demand by the `init` and `setup` skills. Do not duplicate this content in SKILL.md.

## JSON Profile Migration

JSON profiles are migrated from `.academic-writer/profile.json` to `.academic-writer/profile.md` by the package tool `academic_writer_migrate_profile`.

Run it in Phase 0 before checking for an existing profile. It is idempotent:
- If `.academic-writer/profile.md` already exists, it skips.
- If no JSON profile exists, it skips.
- If a JSON profile exists and no markdown profile exists, it writes the markdown profile using the package serializer.

## Profile File Format

`.academic-writer/profile.md` uses markdown with YAML frontmatter + JSON sections:

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
  "zotero": {
    "enabled": true,
    "mode": "mcp-config",
    "collection": { "key": "optional Zotero collection key", "name": "optional display name" }
  },
  "notebooklm": {
    "enabled": false,
    "mode": "mcp-config",
    "notebook": { "id": "optional NotebookLM notebook id", "name": "optional display name" }
  }
}
```

## Output Format Preferences

```json
{
  "csl": "optional citeproc style id or popular alias, e.g. nature/chicago-author-date/apa",
  "cslPath": "optional local .csl path or URL, e.g. .academic-writer/csl/my-journal.csl"
}
```

## Style Fingerprint

```json
{ ... full 25-dimension fingerprint object ... }
```

## Article Structure

```json
{ ... article structure object ... }
```

## Sources

```json
[]
```
```

## 25-Dimension Style Analysis Rubric

Run via voice-miner agent. Dimensions span 8 categories (A–I):

### A. Sentence-Level
1. Average sentence length (mean + range in words)
2. Sentence structure variety (% complex/compound/simple)
3. Common sentence openers (patterns)
4. Passive voice frequency + examples

### B. Vocabulary & Register
5. Vocabulary complexity (simple/moderate/complex/highly-complex)
6. Academic register level + first vs. impersonal person
7. Field-specific jargon (list + how introduced)
8. Hebrew academic conventions (if applicable)

### C. Paragraph & Argument Structure
9. Paragraph structure pattern (detailed step-by-step)
10. Average paragraph length (words + range)
11. Argument progression (inductive/deductive/other)
12. How evidence is introduced
13. How evidence is analyzed after quoting

### D. Tone & Voice
14. Tone descriptors (5–7 adjectives)
15. Authorial stance + common hedging/asserting phrases
16. Engagement with other scholars

### E. Transitions & Flow
17. Preferred transition phrases (grouped by function: addition, contrast, causation, exemplification, conclusion)
18. Section-level transition patterns

### F. Citation Style & Density
19. Citation density (sparse/moderate/dense + footnotes/paragraph average)
20. Citation integration style
21. Quote length preference

### G. Rhetorical Patterns
22. Rhetorical patterns (3–5 most common)
23. Opening moves (how they start articles)
24. Closing moves (how they end articles)

### H. Representative Excerpts
25. 5 verbatim excerpts (2–3 sentences each) showing: analytical move, argumentative voice, evidence handling, transition style, most distinctive trait

### I. Article Structure Analysis
26. Typical section inventory (in order)
27. Introduction conventions (opening pattern, elements, element order, roadmap?, typical length)
28. Conclusion conventions (opening pattern, elements, restatement?, implications?, closing pattern, typical length)
29. Paragraph formula (topic sentence style, evidence presentation, analysis type, closing move, full sequence)
30. Section transition patterns (bridging style, transitional paragraphs?, explicit signposting?)
