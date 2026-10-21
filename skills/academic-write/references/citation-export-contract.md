# Citation and Export Contract

Citation mode is selected only by `citationStyle`.

## Literal mode

`citationStyle: inline-parenthetical` means literal styled citation text. Keep inline citations exactly as written in markdown. Do not add YAML citeproc frontmatter. DOCX output uses `pi_academic_generate_docx` directly with the markdown article; it builds the document with Pandoc, so real Word footnotes and right-to-left text are handled deterministically.
The profile's optional `outputFormatPreferences.stylePackage` selects a project-local appearance package. It is independent of `citationStyle` and CSL, and the same package is used by the literal-mode DOCX generator. Do not change the profile setting to create a one-export override; use `pi_academic_export_article.stylePackage` only when requested.

Before DOCX/export, call `pi_academic_audit_citations` with the markdown article path and `citationStyle: inline-parenthetical`. The audit must pass. A Pandoc marker such as `[@key]` in literal mode is a hard failure.

Literal-mode DOCX output: pass `input: $MD_PATH` (`articles/<slug>.md`) and `output: $DOCX_PATH` directly to `pi_academic_generate_docx`. Native Word footnotes and directionality are compiled without intermediate JSON files.

## Citeproc mode

Every other `citationStyle` value is citeproc mode. Body citations must be Pandoc markers written by the writer: `[@citeKey, p. N]` or co-located markers such as `[@key1; @key2, p. N]`. `citeKey` must come from the approved article-local `articles/<slug>.sources.json` snapshot; never invent it.

Resolve the active CSL reference with `pi_academic_resolve_csl` using the profile's custom value when present (`outputFormatPreferences.csl`, `outputFormatPreferences.cslPath`, or `citation.csl`), otherwise `citationStyle`. Use `download: true`.

Rules:

- Keep the markdown body clean; do not add citeproc YAML frontmatter just for export. Descriptive metadata (`title`, `author`, `date`, `lang`, `dir`) is allowed and is what `pi_academic_import_docx` writes; `bibliography` and `csl` are not.
- Omit the `bibliography` override when a frozen article-local snapshot exists; it always takes precedence. Use an explicit override only for a pre-snapshot article.
- Marker syntax (prefixes, locator terms, author-in-text, note-style behaviour): `pi_academic_read_resource` with `name: pandoc_citation_syntax`.
