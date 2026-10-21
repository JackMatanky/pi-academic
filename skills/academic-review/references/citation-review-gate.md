# Deterministic Citation Review Gate

Before scoring Citation Completeness or allowing DOCX/export continuation, run the deterministic citation audit on the article markdown:

```text
academic_writer_audit_citations(article: ARTICLE_MD_PATH, citationStyle: PROFILE_CITATION_STYLE)
```

Interpretation:

- `status: passed` means the mechanical citation layer is sound enough for semantic review.
- `status: failed` is a hard gate for final output. Report missing keys, missing assets or wrong-mode markers and do not continue to DOCX/export until fixed.
- `status: error` means the audit could not run. Report the error and do not continue to DOCX/export.
- In `inline-parenthetical` mode, any Pandoc marker (`[@key]`) is a wrong-mode failure.
- In citeproc mode, every `[@citeKey]` marker must exist in `.pi-academic/sources.json` and `.pi-academic/bibliography.bib`.

This gate does not replace the editor agent's (audit mode) semantic source/claim verification. It only catches broken syntax, invented cite keys, and bibliography drift.
