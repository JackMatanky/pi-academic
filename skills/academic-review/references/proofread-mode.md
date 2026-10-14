<!-- Consolidated mode guidance for proofread-mode.md. -->

# Academic Writer — Proofread (הגהה)

A focused, **mechanical-only** proofreading pass over a finished article, run inline by this skill (no subagent). It catches the errors every writing pass misses — typos, punctuation, spacing, broken Hebrew typography, doubled words, clear grammar slips — proposes the safe ones as a suggestion list, and writes a report documenting **every suggestion and why**.

It does **not** rewrite prose for style, tone, register, or voice, and it does not restructure. For those, use `/skill:academic-edit`. Think of this as the מגיה's pass, not the editor's.

> **Suggestion-grade safety.** The original file is never modified in place, and nothing is auto-applied. Every suggestion is returned to the researcher for approval; only approved mechanical fixes are written to a new `*.proofed.md`, each documented with its rationale so you can review it against the corrected copy and revert anything by hand. Idea-level issues are flagged, never applied.

The mechanical sweep has four passes. The first three are tools; the fourth is the inline הגהה sweep defined below. English findings from tools are advisory input to the sweep — a match alone is never an error.

---

## Step 1 — Load profile (optional)

Call `academic_writer_get_profile`. If it returns `ok: false`, continue without blocking and note in the report that no profile was loaded.

The profile gives the researcher's primary `targetLanguage` (drives typography rules). If missing, don't block — default language detection to the article's script (Hebrew → RTL/Hebrew typography; Latin → standard orthography) and note in the report that no profile was loaded.

## Step 2 — Resolve the article

If the user passed a path as an argument, use it. Otherwise ask:

> "Which article should I proofread? Give me a path to a `.md` or `.docx` file, or I can use the most recent article in `articles/`."

List candidates by calling `academic_writer_list_project_files` with `kind: "articles"`.

Establish a single **`PROOF_BASE`** — a plain-text/markdown file that is both what the sweep reads and what the corrected copy is built from. This is the key safety step: the corrected copy is **never** a copy of a binary source.

- **Markdown / text source** → `PROOF_BASE` is the source itself. Read it with the `Read` tool or `academic_writer_extract_document`.
- **.docx / PDF source** → call `academic_writer_extract_document` with `path: SOURCE_PATH`, then use the Write tool to save the returned text to `articles/FILEBASE.extracted.md`.
  `PROOF_BASE` is `articles/FILEBASE.extracted.md`. A binary source produces a markdown report and a corrected `.md`; it does not round-trip back into Word (that's the future full-port / `/apply` path). The original source is never touched.

Record `SOURCE_PATH`, `FILEBASE` (the source filename without extension), and `PROOF_BASE`. Determine `LANGUAGE` from the profile's `targetLanguage` if present, else from the article's dominant script.

## Step 3 — Mechanical sweep (inline, four passes)

Run all four passes over `PROOF_BASE`; merge their outputs into one suggestion list before Step 4.

### Pass A — Typography (Hebrew-safe, per paragraph)

For each paragraph, call `academic_writer_fix_typography` with `text: <paragraph>`. Diff the returned text against the input: each differing span becomes one `typography` suggestion (`before` → `after`), with the paragraph line as its locator. The tool is deterministic and Hebrew-aware; never hand-adjust its replacements — take them as-is or drop them.

### Pass B — Prose patterns (English only)

For English articles, call `academic_writer_lint_prose` with `text: PROOF_BASE_TEXT` and `language: <LANGUAGE>`. Findings are advisory prompts for contextual review: convert into suggestions only what is mechanical under the scope table below; anything stylistic is out of scope for this mode. Skip entirely for non-English articles.

### Pass C — Harper grammar/spelling (English only)

For English articles, call `academic_writer_proofread` once with `text: PROOF_BASE_TEXT` (optionally `dialect` from the profile's variety if one is configured; default American). The tool returns an advisory findings list (message, span, suggestions). Convert a finding into a suggestion only when its replacement is unambiguous under the scope table below; ambiguous matches are reported as idea-level flags. The tool is English-only — Hebrew sections skip this pass. A finding alone is never an error.

### Pass D — Inline four-level הגהה sweep

Work through `PROOF_BASE` line by line, in this order:

1. **רמת האות (letter)** — typos, dropped/extra letters, accidental Latin characters inside Hebrew text, doubled letters.
2. **רמת המילה (word)** — wrong-but-similar word (e.g., גם/גן), missing word, repeated word, obvious spelling error.
3. **רמת המשפט (sentence)** — clearly broken syntax, missing comma that creates real ambiguity, wrong gender/number agreement. Only _unambiguous_ errors — not style.
4. **רמת הרעיון (idea)** — **flag only, never fix.** e.g., "this sentence appears to contradict the claim two paragraphs up." Hand back to the author. (The guide permits only _very limited_ intervention at this level — "flag rather than rewrite", _Writer's Guide_ §7.3; we tighten that to flag-only.)

### Mechanical scope

| Suggestable (mechanical)                                  | Not yours                          |
| --------------------------------------------------------- | ---------------------------------- |
| Typos, doubled letters/words                              | Sentence rewrites for clarity      |
| Punctuation, spacing                                      | Register / tone changes            |
| Hebrew typography: ״ vs `"`, ׳ vs `'`, מקף עברי vs hyphen | Word substitution for style        |
| Obvious grammar / agreement errors                        | Restructuring, cutting, reordering |
| Capitalization drift (Latin-script text)                  | Citation reformatting              |
|                                                           | New prose, voice complaints        |

For Hebrew text apply the typography conventions; for Latin-script text apply standard orthography. If the article mixes scripts, judge each span by its own script.

> **Out of scope (language editor's job, not yours):** register/tone consistency, connective-frequency caps (e.g. overuse of "יתרה מכך"), idiom and word-choice for style. These are עריכה לשונית, not הגהה — never suggest them. At most raise an `idea-flag`.

### Hebrew typography & orthography — exact rules (avoid over-correction)

These rules are confirmed against _Hebrew Linguistic Reference_ (ch. 6 typography, ch. 1 spelling, ch. 5 citation). **The danger here is over-correction** — each mark is correct only in its own context. Verify the context before proposing a change.

**Single-character marks (never the ASCII keyboard version):**

- **Gershayim ״ (U+05F4)** — used for (a) quotation marks (same char both sides — Hebrew has no open/close), and (b) multi-letter acronyms/ראשי תיבות, before the last letter: תנ״ך, צה״ל, ד״ר, רמב״ם, שו״ת. Replace ASCII `"` (U+0022) and English curly quotes (U+201C/D) in these positions. _Quote-within-quote alternates:_ double outside ״…״, single inside ׳…׳.
- **Geresh ׳ (U+05F3)** — single-letter abbreviations only (עמ׳, ר׳, גב׳), phoneme shift (ג׳, ז׳, צ׳), and transliteration initials (מ׳). Replace ASCII `'` (U+0027) and curly `'` (U+2019). **Do not** use geresh where gershayim belongs (multi-letter acronym) and vice-versa.
- **Number markers:** when a _single_ letter marks a chapter/verse number, add **no** geresh or gershayim (פרק ב — not ב׳; משנה ה — not ה׳). A mark appears only for two-or-more-letter gematria where it could be misread as a word (תשפ״ו, י״ח).

**The four-way hyphen distinction — DO NOT convert every `-` to a maqaf:**

| Sign           | Unicode | Use only for                                                                                        |
| -------------- | ------- | --------------------------------------------------------------------------------------------------- |
| Maqaf ־        | U+05BE  | compound words / construct-state pairs: בית־ספר, ארץ־ישראל, רב־מכר                                  |
| Hyphen-minus - | U+002D  | phone numbers, model codes (03-1234567, LX-5) — **leave as-is**                                     |
| En-dash –      | U+2013  | numeric/date ranges, no spaces: 45–67, 1939–1945 — convert `\d-\d` ranges to en-dash, **not** maqaf |
| Em-dash —      | U+2014  | dramatic pause (rare in academic prose)                                                             |

**Spacing:** insert a non-breaking space (U+00A0) between a number and its unit so it doesn't break at line-end: עמ׳ 47, 3 ק״מ, 15%, פרק ב.

**Hebrew source-citation mechanics (surface-level only — not reformatting):** comma, not colon, between chapter and verse (בראשית א, א — never `א:א`); Talmud folio markers use gershayim (ע״א, ע״ב); page ranges in the bibliography use en-dash.

**2017 כתיב מלא (Academy spelling reform)** — suggestable as a word-level (`word`/`typo`) correction, e.g. תכנית→תוכנית, אמתי→אמיתי, לעתים→לעיתים, בנין→בניין, and אישה (always with yod). **Guards:** proper names are exempt (never "correct" a person's name without permission → `idea-flag`); do not retro-fix a text that is deliberately pre-2017; and if the document is already internally consistent on a non-canonical choice, **enforce its consistency rather than override it** — coherence within the work outranks absolute correctness (_Hebrew Linguistic Reference_, ch. 5). Anything ambiguous → `idea-flag`, not a suggestion.

**Niqqud** — do not add niqqud to running prose. It belongs only in poetry, biblical/liturgical quotation, children's text, and dictionaries; never mix niqqud systems within one work. Treat niqqud changes as out-of-scope for the default pass (flag if clearly broken).

### Suggestion format

Every suggestion from any pass is one row:

| field       | meaning                                                                |
| ----------- | ---------------------------------------------------------------------- |
| `line`      | line in `PROOF_BASE` (0-based)                                         |
| `type`      | `typo`, `punctuation`, `word`, `grammar`, `typography`, or `idea-flag` |
| `level`     | `letter`, `word`, `sentence`, or `idea`                                |
| `before`    | verbatim snippet from the text, unique enough to locate                |
| `after`     | corrected snippet, or `null` for `idea-flag`                           |
| `rationale` | one short line, in the article's language where natural                |

Resist these failure modes:

- **"Helpful Rewriter"** — the pull to improve a clunky-but-correct sentence. A clunky sentence is NOT mechanical. Rephrasing, word-for-style substitution, register tuning, and restructuring are all forbidden. If something reads poorly but is grammatically and orthographically correct, leave it — at most raise an `idea-flag`.
- **"Citation Surgeon"** — never alter the content of a citation, a quoted passage (״...״ / "..."), a page number, or a footnote reference. You may flag a _broken_ quotation mark as typography, but never touch what is inside the quotes.
- **"Silent Meaning Shift"** — a punctuation or word fix that changes the meaning is not mechanical. If the fix could change the claim, downgrade it to an `idea-flag` and let a human decide.

## Step 4 — Citation-integrity guard (differential, deterministic)

The sweep is forbidden from editing inside a citation, quotation, page number, or footnote marker. This step **verifies that invariant was obeyed** — it does not re-audit the article's citations. The question here is _differential_ ("did this mechanical fix disturb a citation token?"), not absolute ("are the article's citations sound?"). Re-auditing edited text in isolation would answer the wrong question and would silently drop valid fixes when a paragraph had a pre-existing footnote/anchor issue — so this guard is deterministic and needs no `sources.json`.

**Define citation/quotation tokens** (match against `before` and `after` of each suggestion; extend per the article's `LANGUAGE`):

- Footnote markers and definitions: `[^id]`, `[^id]:`, superscript reference numbers.
- Parenthetical citations: `(Author, 2019, p. 45)` and Hebrew forms (`(כהן, 2019, עמ׳ 45)`); traditional source refs (`בבלי ברכות י, ע״ב`, `בראשית א, א`).
- Quotations: `"…"`, `״…״`, `'…'`, `׳…׳`, block quotes.
- Page numbers / locators: `p. 45`, `pp. 45–47`, `עמ׳ 45`, `ע״א`/`ע״ב`.

**For each mechanical suggestion:** does its `before` snippet (with surrounding context) overlap, or would applying it alter any character _inside_, one of these tokens?

- **No overlap** (the overwhelmingly common case — a typo/punctuation/spacing fix in plain prose) → **keep it as applicable.**
- **Overlap** → **do not apply even on approval.** Downgrade the suggestion to an `idea-flag` with reason `"touches a citation/quotation token — needs human review"`, and record it in the report's Notes. A fix to a citation token is exactly the kind of change a מגיה must hand to a human.

(Typography fixes that only normalize a quotation _mark itself_ — straight `"` → `״` opening/closing a quotation — are the one expected overlap; treat them as applicable typography, but record them in Notes so the human can confirm the right mark was chosen. Anything that changes text _inside_ the quotation is never applied.)

## Step 5 — Present suggestions; apply approved fixes to a corrected copy

**Nothing is auto-applied.** Present the merged suggestion list to the researcher — grouped by level, each with its `before` → `after` and rationale — and ask which to apply.

**If there are zero applicable mechanical suggestions** (or the researcher approves none): do **not** write a `*.proofed.md`. Skip to Step 6 and report a clean pass. No duplicate file for an already-clean article.

Otherwise, for the approved suggestions only, create `articles/${FILEBASE}.proofed.md` with the Write tool from the exact `PROOF_BASE` text the sweep read. Do not copy a binary source.

Apply each approved **mechanical** suggestion to `articles/${FILEBASE}.proofed.md` with the `Edit` tool, observing these guards (the apply step is where this feature is most error-prone — typography fixes manipulate exotic/invisible code points: ״ ׳ ־ – U+00A0 U+200F):

1. **Order matters.** Sort suggestions by `line` (then by offset within the line) and apply **bottom-to-top**, so an earlier edit never shifts the anchor of a later one.
2. **Detect overlap.** If two suggestions touch the same span (e.g. a quote-mark fix and an NBSP fix in one clause), apply them as a single combined `Edit` (one `before` → one `after` covering both), not two racing edits.
3. **Verify uniqueness before applying.** The `Edit` tool fails on a non-unique match — when that happens, expand the `before` with surrounding context until it matches exactly once. If it still can't be made unique, **skip it** and record "could not localize (ambiguous) — left for manual review" in Notes.
4. **Treat a no-match as a hard skip, never a force.** If `before` does not match (e.g. a tool mis-transcribed an exotic glyph), do **not** rewrite by hand — skip the suggestion and record "could not localize (no match) — left for manual review" in Notes. For typography fixes, anchor by `line` + a plain-ASCII neighbour where possible to reduce transcription fragility.

Skip `idea-flag` and guard-downgraded suggestions — they are never applied. After applying, delete any `*.extracted.md` working file from Step 2.

## Step 6 — Write the change report

Write `articles/${FILEBASE}.proofread.md` documenting **every suggestion and its disposition, and why**. Use the article's language for prose where natural; keep the table readable. Shape:

```markdown
# Proofread report — <FILEBASE>

- Source: `<SOURCE_PATH>`
- Corrected copy: `articles/<FILEBASE>.proofed.md` (or "none — clean pass / nothing approved")
- Language: <LANGUAGE> · Profile: <loaded | none>
- Suggested: <N> mechanical · Applied (researcher-approved): <K> · Flagged (not applied): <M> idea-level
- Date: <YYYY-MM-DD>

## Applied changes

| #   | Line | Level  | Type | Before → After        | Why       |
| --- | ---- | ------ | ---- | --------------------- | --------- |
| 1   | 42   | letter | typo | `המחשבות` → `המחשבות` | doubled ו |
| …   |      |        |      |                       |           |

## Suggested but not applied

| #   | Line | Level | Type | Before → After | Why | Reason                                                    |
| --- | ---- | ----- | ---- | -------------- | --- | --------------------------------------------------------- |
| …   |      |       |      |                |     | declined by researcher / guard-downgraded / not localized |

## Idea-level flags (not changed — for your review)

| #   | Line | Note                                                  |
| --- | ---- | ----------------------------------------------------- |
| 1   | 88   | This sentence appears to contradict §2's claim that … |

## Notes

- <citation-integrity guard downgrades, un-localizable snippets (no-match / ambiguous), quotation-mark normalizations to confirm, anything skipped, and why>
```

Every applied row must carry its rationale — that is the deliverable. Idea-flags go only in the flags table; they are never in the corrected copy.

## Step 7 — Report to the researcher

If changes were applied:

> "Proofread complete (mechanical only).
>
> - **Corrected copy:** `articles/<FILEBASE>.proofed.md`
> - **Change report:** `articles/<FILEBASE>.proofread.md`
> - Applied **<K>** approved mechanical fixes; **<M>** idea-level issues flagged (not changed).
>   Your original is untouched. Review the report against the corrected copy and revert any change by hand if you disagree — every change is listed with its rationale."

If it was a clean pass (no applicable changes):

> "Proofread complete — clean pass. No mechanical errors to apply. <M> idea-level note(s) are in `articles/<FILEBASE>.proofread.md` for your review. No corrected copy was written."

## Hard rules

- **Suggestion-only by default.** Nothing is applied without the researcher's explicit approval; the original file is never modified in place. Corrections go to `*.proofed.md`, seeded from `PROOF_BASE` — never from a binary `.docx`.
- **Mechanical only.** Typos, punctuation, spacing, typography, clear grammar/agreement. No rephrasing, no register/tone changes, no restructuring — those are `/skill:academic-edit`.
- **Idea-flags are never applied** — they live in the report for human decision.
- **Citation-integrity guard is mandatory and deterministic:** any mechanical suggestion that touches a citation/quotation/page/footnote token is **not applied** — it is downgraded to an idea-flag for human review. This guard verifies the sweep's no-touch invariant; it does not re-audit citations and does not depend on `sources.json`.
- **Every applied change is documented with a rationale** in the report. No silent edits — and a change that can't be localized is skipped and recorded, never forced.
- **Don't create `.academic-writer/`** — all outputs land in `articles/`.
