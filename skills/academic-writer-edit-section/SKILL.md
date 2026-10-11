---
name: academic-writer-edit-section
description: "Quick edit of a single section — rewrite, expand, cut, fix citations, or adjust style. Faster than full article edit. Use when changing one specific section only — faster than full edit."
allowed-tools: bash read write find grep subagent academic_writer_get_profile academic_writer_extract_document
metadata: {author: "Yotam Fromm", version: "0.2.19"}
---

# Academic Writer — Edit Section

This is a single-section entrypoint for `/skill:academic-writer-edit`. Run that skill in single-section mode with the article path and requested section; it owns structured outline migration, canonical outline edits, researcher approval, frozen citation/note snapshots, section_bundle dispatch, paragraph audit, preservation of untouched Markdown, and export. Do not use a separate flat-section writer handoff here.
