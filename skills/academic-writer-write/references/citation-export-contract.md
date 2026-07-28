# Citation and Export Contract

Citation mode is selected only by `citationStyle`.

## Literal mode

`citationStyle: inline-parenthetical` means literal styled citation text. Keep inline citations exactly as written in markdown. Do not add YAML citeproc frontmatter. DOCX output uses `academic_writer_generate_docx` with the article JSON schema and the packaged `generate-docx.py` path so Hebrew RTL/footnotes are handled deterministically.

Before DOCX/export, call `academic_writer_audit_citations` with the markdown article path and `citationStyle: inline-parenthetical`. The audit must pass. A Pandoc marker such as `[@key]` in literal mode is a hard failure.

Literal-mode DOCX JSON schema:

```json
{
  "title": "ARTICLE_TITLE from synthesizer",
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

Every other `citationStyle` value is citeproc mode. Body citations must be Pandoc markers written by `section-writer`: `[@citeKey, p. N]` or co-located markers such as `[@key1; @key2, p. N]`. `citeKey` must come from `.academic-writer/sources.json`; never invent it.

Before writing citeproc frontmatter, resolve the active CSL reference with `academic_writer_resolve_csl` using the profile's custom value when present (`outputFormatPreferences.csl`, `outputFormatPreferences.cslPath`, or `citation.csl`), otherwise `citationStyle`. Use `download: true`.

Prepend this YAML before the article title heading:

```yaml
---
title: "ARTICLE_TITLE"
lang: "he"
bibliography: .academic-writer/bibliography.bib
csl: "RESOLVED_CSL_PATH"
---
```

Rules:
- `lang` is `"he"` for Hebrew and `"en"` for English.
- `bibliography` is always `.academic-writer/bibliography.bib`.
- `csl` is the literal resolved local CSL path.
- Do not strip or rewrite `[@citeKey]` markers.
- Do not emit literal author/year citation prose in citeproc mode.

Before Pandoc DOCX/export, call `academic_writer_audit_citations` with the markdown article path and the actual `citationStyle`. The audit must pass: every marker key must exist in both `.academic-writer/sources.json` and `.academic-writer/bibliography.bib`.

Citeproc DOCX/export uses `pandoc "$MD_PATH" --citeproc -o "$OUTPUT_PATH"`. This path does not apply `generate-docx.py` Hebrew RTL post-processing; warn Hebrew users that manual RTL adjustment may be needed unless their CSL/template handles it.
