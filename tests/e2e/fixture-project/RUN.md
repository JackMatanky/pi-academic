# E2E Run Brief

Pinned inputs for a deterministic smoke test of the write pipeline.

## Pinned inputs

- **Subject:** תפיסת הזמן אצל אוגוסטינוס וההד שלה אצל ריקר
- **Target language:** Hebrew
- **Citation style:** inline-parenthetical
- **Sources:** pre-seeded in `.pi-academic/sources.json`; skip
  the researcher because the sources are already mapped.
- **Research notes:** verified, source-anchored notes in
  `.pi-academic/research-notes.json`.
- **Canonical outline:** approved argument map in
  `articles/augustine-time.outline.json`; selected evidence is frozen in
  `articles/augustine-time.notes.json`.
- **Thesis:** the approved thesis in the canonical outline.
- **Outline (3 sections):**
  1. מבוא — הצגת אפוריית הזמן והתזה
  2. הזמן כחוויה נפשית אצל אוגוסטינוס
  3. סיכום — ההד אצל ריקר והרחבת ההשלכות

## Run

`/skill:academic-write` — the `writer` runs the 8-skill pipeline
(draft → style → grammar → academic language → language purity → anti-AI →
repetition → citation audit) per paragraph. The editor in audit mode gates each
paragraph; the editor in review mode does the cross-section pass.

Model choice (which provider drafts prose) is a pi setting
(`subagents.agentOverrides.<agent>.model`), not a run-time branch. This brief
covers the pipeline, not a specific model.

## Pass criteria

- Produces a 3-section Hebrew article; all paragraphs pass the editor's audit mode.
- Outline claims map to verified notes in the article's frozen snapshot.
  Citations resolve only to `sources.json` entries; metadata is never invented.
