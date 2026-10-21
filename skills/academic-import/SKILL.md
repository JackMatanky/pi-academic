---
name: academic-import
description: "Import a Word .docx, with its footnotes, into a Pandoc markdown article. Use when the researcher has an existing manuscript in Word and wants to edit, review, or re-export it."
allowed-tools: read find academic_writer_read_resource academic_writer_get_profile academic_writer_health academic_writer_import_docx academic_writer_relink_citations academic_writer_audit_citations academic_writer_ingest_sources academic_writer_count_words
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

Word highlights come through as `[text]{.mark}` spans. They are often reviewer flags (for example unverified references). Ask whether to keep them; pass `stripHighlights: true` to drop the marks and keep the text. Keeping them is the default so no review information is lost silently.

If the tool fails, report its error verbatim and stop.

## 3. Report and hand off

Report the output path, the footnote count, and any media directory. Relay each warning verbatim; a footnote-count mismatch means the researcher should check those notes in the markdown against the Word file.

The markdown starts with a YAML metadata block (Pandoc's `yaml_metadata_block`; field meanings and the one-place title rule are in `academic_writer_read_resource` with `name: article_metadata`): `title`, `author` and `date` when the Word file has them, plus `lang` and, for right-to-left text, `dir`. Name the fields written (`metadata` in the result). Export reads them, so the title is not guessed from a heading and Hebrew detection is not needed. When the Word title was a plain paragraph, not a Title-styled one, there is no `title` field: ask the researcher for it and add it. The block holds descriptive metadata only; never add `bibliography` or `csl` (export passes those directly).

State what the import does not do:

- Word citation fields (Zotero, Mendeley, Word's own) arrive as their rendered text, not `[@key]` markers. Step 4 converts footnoted citations back to `[@key]` markers where the work is in `sources.json`.
- Comments are not imported.
- Layout and styling from the Word file are not carried over; export applies the profile's style package.
- Cross-references such as "See note 19 above" are plain text and go stale if notes are renumbered.

## 4. Relink footnote citations to sources.json (citeproc styles only)

Applies when the profile's `citationStyle` is not `inline-parenthetical`. For `inline-parenthetical`, skip it and say why; run `academic_writer_audit_citations` on the imported file to see whether the literal citations conform.

1. Call `academic_writer_relink_citations` with `article` only. This is a report, and writes nothing.
2. Show the counts and every entry listed under "Not matched". Say plainly that notes citing works missing from `sources.json` stay as written, and offer to add those works (through `/skill:academic-research` or `academic_writer_ingest_sources`) before relinking. Do not invent citekeys.
3. Only after the researcher agrees, call it again with `apply: true`. Pass `output` to keep the imported file and write the rewritten copy beside it.

What the tool does, following Pandoc's citation syntax: a note made only of cited works, optionally led by "See", "See also" or "cf.", becomes an inline `[@key, p. N]` (the lead-in becomes the citation prefix: `[see @a, p. 5; cf. @b, p. 6]`) at its reference. In a note style such as Chicago notes, Pandoc turns that marker back into a footnote itself, with the full reference on first citation and short forms after; in an author-date style it becomes an in-text citation, so say so before applying. A note with commentary or any other text stays a note, with its matched citations rewritten as author-in-text `@key [p. N]` for a note style (a bracketed citation inside a note renders wrapped in parentheses) or `[@key, p. N]` otherwise. Anything matched ambiguously, missing from `sources.json`, or followed by text the tool cannot account for (for example a second citation or a clause of prose) is left exactly as written and reported, never partly converted. Matching uses the author's surname at the start of the note and the title from `sources.json`, so it never guesses between two records. Whether the style is a note style is read from the profile's `citationStyle`; pass `noteStyle` if it cannot be read. It does not check that a quoted page number is right, and it cannot tell that an author is already named in the sentence (Pandoc's `-@key` form drops the author).

Marker syntax, every locator term and the note-style rules are in `academic_writer_read_resource` with `name: pandoc_citation_syntax`; read it before explaining a result to the researcher. The tool recognises all of those locator terms (writing `chap.`/`chaps.` for `ch.`/`chs.`), short suffixes (`esp. 7`, `passim`, `ff.`, `et seq.`) and lead-ins (see, see also, see generally, cf., compare, contra, e.g., and similar). Anything longer, or any prose after the citation, leaves the note as written.

Check the "Check these" lines in the report before applying. Relinking replaces the note's text with what `sources.json` and `bibliography.bib` say, so a mismatch between them and the manuscript is now visible: the tool flags a year in the note that the matched record does not have, but it cannot see other differences, such as a wrong author, editor or container. After applying, spot-check a few rendered notes against the manuscript and fix the bibliography record, not the note.

After applying, call `academic_writer_audit_citations` with the article path and the profile's `citationStyle`; it must pass. Report the audit result, the "Check these" lines and the list of unmatched notes.

Offer `/skill:academic-edit` or `/skill:academic-review` on the file. A "Bibliography" section copied from Word duplicates the one citeproc generates at export: tell the researcher to review it before exporting.
