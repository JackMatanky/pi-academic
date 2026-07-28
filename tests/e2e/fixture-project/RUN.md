# E2E Run Brief

Pinned inputs for a deterministic smoke test of the write pipeline.

## Pinned inputs

- **Subject:** תפיסת הזמן אצל אוגוסטינוס וההד שלה אצל ריקר
- **Target language:** Hebrew
- **Citation style:** inline-parenthetical
- **Sources:** pre-seeded in `.academic-writer/sources.json` (skip deep-reader — sources already mapped)
- **Thesis:** see `evidence-ownership.json > thesisAnchor`
- **Outline (3 sections):**
  1. מבוא — הצגת אפוריית הזמן והתזה (owner of `aug-confessions-bk11`)
  2. הזמן כחוויה נפשית אצל אוגוסטינוס (develops `aug-confessions-bk11`)
  3. סיכום — ההד אצל ריקר והרחבת ההשלכות (owner of `ricoeur-time-narrative`)

## Run

`/skill:academic-writer-write` — `section-writer` runs the 8-skill pipeline (draft → style → grammar → academic language → language purity → anti-AI → repetition → citation audit) per paragraph; the auditor gates each paragraph; `synthesizer` does the cross-section pass.

Model choice (which provider drafts prose) is a pi setting (`subagents.agentOverrides.<agent>.model`), not a run-time branch — this brief covers the pipeline, not a specific model.

## Pass criteria

- Produces a 3-section Hebrew article, all paragraphs auditor-PASS.
- Citations resolve only to `sources.json` entries; metadata never invented.
