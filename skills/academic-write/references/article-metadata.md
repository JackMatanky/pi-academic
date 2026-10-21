# Article Metadata

An article markdown file may begin with a YAML metadata block (Pandoc's `yaml_metadata_block`). It holds descriptive facts about the document. It never holds export plumbing.

## Fields

| Field | Meaning | Written by | Read by |
| --- | --- | --- | --- |
| `title` | Document title | `pi_academic_import_docx`, from a Word Title paragraph | DOCX/export, Pandoc |
| `subtitle` | Subtitle | researcher | DOCX generator |
| `author`, `date` | From the Word file's properties | `pi_academic_import_docx` | Pandoc |
| `lang` | BCP 47 tag: `he-IL`, `en-US` | import; write skill (Step 9a) | DOCX generator, citeproc localisation |
| `dir` | `rtl` for right-to-left text; omitted otherwise | import; write skill (Step 9a) | DOCX generator |
| `targetLanguage` | Profile language name | researcher | DOCX generator |

Other keys are allowed and ignored by the package.

## Rules

- **Format:** `---` on the first line, not followed by a blank line; closed by `---` or `...`. Quote a title that contains a colon.
- **The title lives in one place.** Either `title:` in the block, or the first `# H1` in the body, which the DOCX generator promotes to the title when the block has none. Never both, or the title prints twice. An imported article has `title:` and no title heading; an article from the write pipeline has the H1 and no `title:`.
- **Preserve the block.** Editing, review and proofreading keep it as it is, changing a field only when the researcher asks. Writers never put a block in a section file; only article assembly and import write one.
- **No export plumbing.** `bibliography`, `csl` and similar are passed by `pi_academic_export_article`, not stored here (see `citation_export_contract`).
- **Tools skip it:** outline migration, reverse outline, the prose linter and the citation audit ignore the block, and word counts exclude it from body words.
