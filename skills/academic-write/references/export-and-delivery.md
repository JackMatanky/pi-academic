# Output: self-review, Markdown, audit, export

## Step 8.7: Self-Review (Quality Gate)

Run the scorecard workflow of `/skill:academic-review` in pipeline-step mode (it reads the `scorecard` resource). Score the article on 6 dimensions (each 1–10):

1. **Structure** — Intro/conclusion conventions, logical section order
2. **Argument Logic** — Each section advances thesis, no gaps
3. **Citation Completeness** — Every claim cited, consistent format
4. **Source Coverage** — All sources used, balanced distribution
5. **Writing Quality** — Matches style fingerprint, no grammar issues
6. **Academic Conventions** — Linking word variety, paragraph length, transitions

Present the scorecard to the researcher.

**Word-count gate (before scoring):** call `academic_writer_count_words({article: MD_PATH, citationStyle})` to inspect both markdown words and the expected rendered document total (with footnote, citation expansion, and bibliography words). If the researcher set a `targetWordCount`, the expected document total must land within `thresholds.json:article.targetBandPct` (default 15%) of it; otherwise it must fall within `article.minWords`–`article.maxWords` (defaults 2,000–12,000). Outside the band, ask the researcher whether to expand/condense or proceed knowingly — record the decision in the run notes.

**If score is below the self-review threshold defined in `thresholds.json` (default 40/60)**, ask whether to proceed or address issues first (using a conversational ask).
**If score meets or exceeds the threshold (default 40/60)**, show the scorecard and continue to DOCX output.

---

After the Markdown, audit, review, and any requested export have completed, report readiness from actual results: approved thesis/outline; successful note and citation snapshots; section coverage; citation audit; review findings; and the requested export. Name unresolved audit or review findings specifically. A passing mechanical audit is not a claim of academic correctness. Mark export ready only after the requested file is actually produced; if export fails, state the failure and one recovery action.

### Step 9: DOCX Output

Assemble the final article and write to both Markdown and DOCX:

Call `academic_writer_article_paths` with the approved article title/subject. Use its returned `markdown` as `$MD_PATH` and `docx` as `$DOCX_PATH`. Create `articles/` before writing article outputs.

#### Step 9a: Markdown Output

Call `academic_writer_read_resource` with `name: citation_export_contract`, then follow that contract exactly for the active `citationStyle`.

Write `$MD_PATH` first. The markdown must preserve the final synthesized article:

- a YAML metadata block, per the `article_metadata` resource (`academic_writer_read_resource`): `lang` (`he-IL` for Hebrew, `en-US` for English) and, for Hebrew only, `dir: rtl`. No `title:` here, because the `# H1` below is the title
- title as `# H1`
- thesis as the italic line below it
- abstract text from Step 8.5
- section headings only when `totalWords > 1500`
- paragraphs separated by blank lines
- citations unchanged from the approved frozen section files (`articles/<slug>/sections/<sectionId>.md`) the writers wrote

For citeproc mode, resolve the CSL with `academic_writer_resolve_csl` before DOCX/export. Do not write citeproc YAML frontmatter into the markdown; `academic_writer_export_article` passes bibliography and CSL directly to Pandoc.

After writing `$MD_PATH`, call `academic_writer_audit_citations` with:

- `article: MD_PATH`
- `citationStyle: citationStyle`

Continue only when `status` is `passed`. On `failed`, report the exact missing/wrong-mode citation details; on `error`, report the operational failure. In either case stop DOCX generation, set the run state to `failed`, and do not continue to DOCX/export.

#### Step 9b: DOCX Output

Branch by `citationStyle` using the loaded `citation_export_contract`.

##### `inline-parenthetical`

Call `academic_writer_generate_docx` directly with `input: MD_PATH` (`articles/<slug>.md`) and `output: $DOCX_PATH`.

##### Citeproc mode

Call `academic_writer_export_article` with `article: MD_PATH`, the active `citationStyle`, `formats: ["docx"]`, and `csl: RESOLVED_CSL_PATH`.

Warn Hebrew users that this path does not set right-to-left document direction unless their CSL/template handles it.

Report to researcher:

> "Done! Your article has been saved to:
>
> - `articles/FILEBASE.docx` (formatted document)
> - `articles/FILEBASE.md` (markdown)
>
> Word count: [N] words
> Citations: [N] ([citationStyle] format)
> Sections: [N]
> Language: [targetLanguage]
> [If citeproc mode: Bibliography — frozen article-local snapshot via pandoc `--citeproc` (CSL: [resolved CSL path])]
>
> Quality checks applied per paragraph:
>
> - Style fingerprint compliance: avg [N]/5 score, [N] adjustments
> - Hebrew grammar: [N] issues fixed
> - Language purity: [N] foreign-term violations fixed
> - Repetition: [N] instances fixed
> - Citation audits: [N] claims verified, [N] rejections resolved
