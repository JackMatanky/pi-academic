# E2E Run Brief

Pinned inputs for a deterministic smoke test of the write pipeline.

## Pinned inputs

- **Subject:** תפיסת הזמן אצל אוגוסטינוס וההד שלה אצל ריקר
- **Target language:** Hebrew
- **Citation style:** inline-parenthetical
- **Sources:** pre-seeded in `.academic-writer/sources.json`; skip
  deep-reader because the sources are already mapped.
- **Research notes:** verified, source-anchored notes in
  `.academic-writer/research-notes.json`.
- **Canonical outline:** approved argument map in
  `articles/augustine-time.outline.json`; selected evidence is frozen in
  `articles/augustine-time.notes.json`.
- **Thesis:** the approved thesis in the canonical outline.
- **Outline (3 sections):**
  1. מבוא — הצגת אפוריית הזמן והתזה
  2. הזמן כחוויה נפשית אצל אוגוסטינוס
  3. סיכום — ההד אצל ריקר והרחבת ההשלכות

## Run

`/skill:academic-writer-write` — `section-writer` runs the 8-skill pipeline
(draft → style → grammar → academic language → language purity → anti-AI →
repetition → citation audit) per paragraph. The auditor gates each paragraph;
`synthesizer` does the cross-section pass.

Model choice (which provider drafts prose) is a pi setting
(`subagents.agentOverrides.<agent>.model`), not a run-time branch. This brief
covers the pipeline, not a specific model.

## Pass criteria

- Produces a 3-section Hebrew article; all paragraphs pass the auditor.
- Outline claims map to verified notes in the article's frozen snapshot.
  Citations resolve only to `sources.json` entries; metadata is never invented.
