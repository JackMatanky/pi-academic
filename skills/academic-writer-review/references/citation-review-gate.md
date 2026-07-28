# Deterministic Citation Review Gate

Before scoring Citation Completeness or allowing DOCX/export continuation, run the deterministic citation audit on the article markdown:

```text
academic_writer_audit_citations(article: ARTICLE_MD_PATH, citationStyle: PROFILE_CITATION_STYLE)
```

Interpretation:

- `ok: true` means the mechanical citation layer is sound enough for semantic review.
- `ok: false` is a hard gate for final output. Report the missing keys or wrong-mode markers and do not continue to DOCX/export until fixed.
- In `inline-parenthetical` mode, any Pandoc marker (`[@key]`) is a wrong-mode failure.
- In citeproc mode, every `[@citeKey]` marker must exist in `.academic-helper/sources.json` and `.academic-helper/bibliography.bib`.

This gate does not replace the auditor agent's semantic source/claim verification. It only catches broken syntax, invented cite keys, and bibliography drift.
