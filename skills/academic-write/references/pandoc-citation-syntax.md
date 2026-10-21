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

## Metadata fields that touch citations

`bibliography`, `csl`, `lang`, `nocite`, `link-citations`, `suppress-bibliography`, `reference-section-title`, `notes-after-punctuation`, `citation-abbreviations`. A YAML block starts with `---` not followed by a blank line and ends with `---` or `...`. Quote titles containing a colon.

## Package rules

- The `citeKey` comes from `sources.json`, never invented. `academic_writer_audit_citations` checks every `@key`, in any of the forms above.
- Writers emit `[@key, p. N]` and `[@a; @b, p. N]`. The prefix and author-in-text forms come from `academic_writer_relink_citations`.
- Do not write `bibliography` or `csl` into the article: export passes them to Pandoc, and a frozen article-local snapshot takes precedence.
