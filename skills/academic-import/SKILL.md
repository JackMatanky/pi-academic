---
name: academic-import
description: "Import a Word .docx, with its footnotes, into a Pandoc markdown article. Use when the researcher has an existing manuscript in Word and wants to edit, review, or re-export it."
allowed-tools: read find academic_writer_get_profile academic_writer_health academic_writer_import_docx academic_writer_audit_citations academic_writer_count_words
metadata: { author: "Yotam Fromm", version: "0.1.0" }
---

# Academic Writer — Import DOCX

Turn a Word manuscript into `articles/<slug>.md` so `/skill:academic-edit`, `/skill:academic-review`, and `/skill:academic-export` can work on it. Footnotes and endnotes become Pandoc `[^n]` definitions.

## 1. Check tools and profile

Call `academic_writer_get_profile`. If it returns `ok: false`, say "Run `/skill:academic-setup` first." and stop. Call `academic_writer_health`; if Pandoc is unavailable, stop and report it.

The `.docx` must be inside the project. If it is elsewhere, ask the researcher to copy it into the project (for example under `sources/`) first; the tool never reads outside the project.

Before importing, ask whether the `.docx` was exported from this package (for example from `/skill:academic-export` or `academic_writer_generate_docx`). If so, an article markdown file likely already exists under `articles/`: edit that instead. An exported `.docx` is a lossy rendering of it: citeproc `[@key]` markers become plain footnote text with different numbering, a bibliography is appended, and names or punctuation may differ from the source. Import it only if the original markdown is gone, and say so to the researcher.

## 2. Import

Call `academic_writer_import_docx` with `input` (project-relative path). Omit `output` to get `articles/<slug>.md`, or pass one if the researcher names it. Never pass `overwrite: true` unless the researcher agreed to replace the existing file.

Pass `trackChanges` only on request: the default `accept` takes every tracked change as written; `reject` restores the original text; `all` keeps both as marked spans for the researcher to resolve.

If the tool fails, report its error verbatim and stop.

## 3. Report and hand off

Report the output path, the footnote count, and any media directory. Relay each warning verbatim; a footnote-count mismatch means the researcher should check those notes in the markdown against the Word file.

State what the import does not do:

- Word citation fields (Zotero, Mendeley, Word's own) arrive as their rendered text, not `[@key]` markers, so the article is in literal-citation form. Converting to `citeproc` mode needs citekeys from the project's `sources.json`; do not invent them.
- Comments are not imported.
- Layout and styling from the Word file are not carried over; export applies the profile's style package.

For a literal-citation article (`inline-parenthetical`), `academic_writer_audit_citations` shows whether the imported text conforms. Then offer `/skill:academic-edit` or `/skill:academic-review` on the new file.
