# Citation and Export Contract

Citation mode is selected only by `citationStyle`.

## Literal mode

`citationStyle: inline-parenthetical` means literal styled citation text. Keep inline citations exactly as written in markdown. Do not add YAML citeproc frontmatter. DOCX output uses `academic_writer_generate_docx` with the article JSON schema; it builds the document with Pandoc, so real Word footnotes and right-to-left text (`format.isRtl`) are handled deterministically.
The profile's optional `outputFormatPreferences.stylePackage` selects a project-local appearance package. It is independent of `citationStyle` and CSL, and the same package is used by the literal-mode DOCX generator. Do not change the profile setting to create a one-export override; use `academic_writer_export_article.stylePackage` only when requested.

Before DOCX/export, call `academic_writer_audit_citations` with the markdown article path and `citationStyle: inline-parenthetical`. The audit must pass. A Pandoc marker such as `[@key]` in literal mode is a hard failure.

Literal-mode DOCX JSON schema:

```json
{
  "title": "ARTICLE_TITLE from the editor (review mode)",
  "thesis": "ARTICLE_THESIS or null",
  "abstract": {
    "primary": "Abstract text in targetLanguage",
    "secondary": "Optional second abstract, or null"
  },
  "sections": [
    {
      "title": "Section title",
      "paragraphs": [
        {
          "text": "Paragraph body with no inline parenthetical citation text.",
          "footnotes": [
            { "after": "unique substring in text", "text": "Author, Title (Pub, 2024), p. 42." }
          ]
        }
      ]
    }
  ],
  "format": {
    "font": "profile.outputFormatPreferences.font or David",
    "bodySize": 11,
    "titleSize": 16,
    "headingSize": 13,
    "lineSpacing": 1.5,
    "margins": 1.0,
    "isRtl": true
  },
  "totalWords": 0
}
```

Rules: write this JSON with the Write tool, not a Python heredoc; move literal citations from paragraph text into `footnotes[]`; set `isRtl` from `targetLanguage`; set `totalWords` to the actual word count.

## Citeproc mode

Every other `citationStyle` value is citeproc mode. Body citations must be Pandoc markers written by the writer: `[@citeKey, p. N]` or co-located markers such as `[@key1; @key2, p. N]`. `citeKey` must come from the approved article-local `articles/<slug>.sources.json` snapshot; never invent it.

Resolve the active CSL reference with `academic_writer_resolve_csl` using the profile's custom value when present (`outputFormatPreferences.csl`, `outputFormatPreferences.cslPath`, or `citation.csl`), otherwise `citationStyle`. Use `download: true`.

Rules:

- Keep the markdown body clean; do not add citeproc YAML frontmatter just for export.
- Omit the `bibliography` override when a frozen article-local snapshot exists; it always takes precedence. Use an explicit override only for a pre-snapshot article.
