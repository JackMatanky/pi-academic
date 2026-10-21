# Pandoc Citation Syntax

What a citation marker can contain and how it renders. Source: Pandoc manual, "Citation syntax" and "Citations in note styles". Package rules are at the end.

## Shape of a citation

```
[ prefix @key , locator suffix ; next item ]
```

- **Prefix**: free text before `@key` (`see`, `cf.`, `for a critique, see`).
- **Locator**: after the comma. Pandoc recognises these en-US terms, abbreviated or in full, singular or plural: `bk.`, `chap.`, `col.`, `fig.`, `fol.`, `no.`, `l.`, `n.`, `op.`, `p.`/`pp.`, `para.`, `pt.`, `sec.`, `s.v.`, `v.`, `vol.`, `¶`, `§`. With no term, "page" is assumed. `ch.` and `chs.` are not terms: write `chap.`/`chaps.`.
- **Suffix**: free text after the locator (`and *passim*`, `esp. 7`).
- **Items** are separated by `;`. Force a locator with braces (`[@smith, {pp. iv, vi-xi} with suffix]`); block locator parsing with `[@smith{}, 99 years later]`.
- **Keys** start with a letter, digit or `_` and contain alphanumerics plus single internal `:.#$%&-+?<>~/`. Otherwise wrap them: `@{key}`.

## Forms

| Write | Renders |
| --- | --- |
| `[@key, p. 5]` | Normal citation. Author-date: `(Stern 2013, 5)`. Note style: a footnote. |
| `[@a, p. 5; @b]` | Several works in one citation. |
| `[see @key, p. 5]` | Prefix kept; a note style capitalises it at the start of the note. |
| `@key [p. 5]` | Author-in-text: the author is the subject of the sentence. |
| `[-@key, p. 5]` | Suppresses the author, for when the sentence already names them. |
| `[@key]` | No locator: short form after the first citation. |

## Note styles and author-date styles

- In a **note style** (Chicago notes) write the citation, not a footnote: Pandoc builds the note, gives the full reference on first citation and short forms after, and moves it after punctuation (`notes-after-punctuation`).
- Inside an **explicit footnote**, `[@key, p. 5]` renders in parentheses and `@key [p. 5]` does not. In a note style use `@key [p. 5]` there.
- In an **author-date style** the marker renders in the body, so any commentary in its prefix or suffix would sit inside the parenthetical. Keep commentary in an explicit note.

## When a footnote can become a citation

A note can be a marker when all its text is citation items: works, locators, a short lead-in (`see`, `cf.`) and a short suffix (`esp. 7`, `passim`). It must stay an explicit note when it has free-standing sentences, several paragraphs, or a work missing from `sources.json`.

## Note cross-references

Pandoc numbers notes by position and has no cross-reference for them, so a literal "see note 19 above" goes stale when a note moves. The package adds one, in plain Pandoc syntax:

```
Claim[]{#fn-logic} [@maimonides, p. 5].

[^35]: See note [](#fn-logic) above on the *Treatise on Logic*.
```

- **Anchor**: an empty span `[]{#fn-name}`, the id starting `fn-`. Inside an explicit note (`[^19]: []{#fn-name} text`) it names that note. Anywhere else it names the *next* note, which is how a note citeproc builds from `[@key]` is targeted. Glue it to the end of the word before the citation, with a space after it, or citeproc leaves a gap before the note.
- **Reference**: a link to the anchor. Empty text gives the bare number (`note 19`); link text is kept in front of the number (`[note](#fn-name)` gives `note 19`).
- **Export** resolves the numbers after citeproc, so notes citeproc builds are counted. A link without an anchor, an anchor defined twice, or an anchor with no note after it stops the export.
- `pi_academic_import_docx` converts "note 19 above", "nn. 3 and 5 below" and "supra note 19" in a Word file this way. A bare "note 19" is left alone: it may mean a note in the cited work (for that, `n. 19` is Pandoc's locator inside a citation). `pi_academic_audit_citations` warns about any literal reference left.

## Bibliography placement

Citeproc writes the bibliography into the Div `::: {#refs}` (at the end of the document when there is none). Export, in citeproc mode, does two things; neither needs anything in the article:

- **Heading**: citeproc adds none and CSL files define none, so export supplies the one the style's manual prescribes (`apa` References, `mla` Works Cited, `chicago` and `turabian` Bibliography, and so on; the table is `BIBLIOGRAPHY_TITLES` in `csl-resolver.ts`). It is skipped when the article sets `reference-section-title`, when a heading already sits before the bibliography or ends the article, when `lang` is not English, or when the style has no entry.
- **New page**: the bibliography, with its heading, starts on a new page in DOCX, ODT and LaTeX/PDF (`bibliography-page.lua`; ODT also gets the page-break styles added to the finished file). Other output formats get no break.

## Metadata fields that touch citations

`bibliography`, `csl`, `lang`, `nocite`, `link-citations`, `suppress-bibliography`, `reference-section-title`, `notes-after-punctuation`, `citation-abbreviations`. A YAML block starts with `---` not followed by a blank line and ends with `---` or `...`. Quote titles containing a colon.

## Package rules

- The `citeKey` comes from `sources.json`, never invented. `pi_academic_audit_citations` checks every `@key`, in any of the forms above.
- Writers emit `[@key, p. N]` and `[@a; @b, p. N]`. The prefix and author-in-text forms come from `pi_academic_relink_citations`.
- Do not write `bibliography` or `csl` into the article: export passes them to Pandoc, and a frozen article-local snapshot takes precedence.
