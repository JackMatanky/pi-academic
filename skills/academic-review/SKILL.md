---
name: academic-review
description: "Review a completed academic article, or run a mechanical proofread. Use when requesting a quality scorecard/reverse-outline review or a mechanical proofread with a change report."
allowed-tools: bash read write edit find grep subagent academic_writer_read_resource academic_writer_get_profile academic_writer_list_project_files academic_writer_extract_document academic_writer_audit_citations academic_writer_lint_prose
metadata: {author: "Yotam Fromm", version: "0.2.23"}
---

# Academic Writer — Article Review

## Mode routing

For an explicit request to proofread or copy-edit mechanically, read `references/proofread-mode.md` and follow that mode end to end, including its corrected-copy, citation-integrity, and change-report rules. Do not turn mechanical proofreading into style or argument rewriting. For a substantive quality review, continue with the scorecard and read-only reverse-outline workflow below. Keep the two outputs distinct.

A structured quality gate that scores a completed article on 6 dimensions and presents a scorecard to the researcher.

## When to Use

- Automatically invoked as Step 8.7 in the write-article pipeline (between Synthesis and DOCX Output)
- Can be run standalone on any article: `/skill:academic-review`

## Load Profile

Call `academic_writer_get_profile`.

If it returns `ok: false`, tell the researcher to run `/skill:academic-setup` first.

Call `academic_writer_read_resource` with `name: run_state_contract`, then create or update `.academic-writer/runs/<run-id>.json` for this review when run standalone. Use `phase: review`; update status before stopping. When invoked inside write/edit, update the current run file instead of creating a second one.

## Input

When run standalone, ask:
> "Which article would you like to review? Provide the path to a markdown (.md) file in `articles/`."

List available articles by calling `academic_writer_list_project_files` with `kind: "articles"`.

Read the selected article with the `Read` tool.

When invoked as a pipeline step, the article text is passed directly.

## Deterministic Citation Gate

Call `academic_writer_read_resource` with `name: citation_review_gate`, then call `academic_writer_audit_citations` with the article markdown path and the profile's `citationStyle`.

If the audit returns `ok: false`, score Citation Completeness as failing, report the exact missing/wrong-mode citation details, set run state to `failed`, and do not continue to DOCX/export. This gate is mechanical only; still perform semantic source/claim review when the mechanical audit passes.

## Scorecard rubric

The 6-dimension scorecard is defined in `references/scorecard.json` (machine-readable, versioned). At the start of every review, call `academic_writer_read_resource` with `name: scorecard`.

For each dimension:

1. Score 0–10 against the listed `criteria`.
2. Sum the dimension scores.
3. Compare to `scoring.passThreshold` (default 40). Below threshold → researcher review required.

The scorecard is the single source of truth — do not score on dimensions not listed there, and do not change weights inline. To adjust scoring, edit `references/scorecard.json` and bump its `version` field.

Also check the `styleFingerprint` returned by `academic_writer_get_profile` for Writing Quality (dimension 5).

Load linking words for Academic Conventions (dimension 6) by calling `academic_writer_read_resource` with `name: words`.

## Scorecard Output

Present the results as a clear scorecard:

```text
╔══════════════════════════════════════════════════════╗
║              ARTICLE REVIEW SCORECARD               ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  1. Structure (מבנה)              N/10               ║
║     [brief finding]                                  ║
║                                                      ║
║  2. Argument Logic (הגיון טיעוני)  N/10               ║
║     [brief finding]                                  ║
║                                                      ║
║  3. Citation Completeness (ציטוטים) N/10              ║
║     [brief finding]                                  ║
║                                                      ║
║  4. Source Coverage (כיסוי מקורות)  N/10               ║
║     [brief finding]                                  ║
║                                                      ║
║  5. Writing Quality (איכות כתיבה)  N/10               ║
║     [brief finding]                                  ║
║                                                      ║
║  6. Academic Conventions (מוסכמות)  N/10              ║
║     [brief finding]                                  ║
║                                                      ║
╠══════════════════════════════════════════════════════╣
║  TOTAL:  NN/60                                       ║
║  GRADE:  [Excellent/Good/Needs Work/Poor]            ║
╚══════════════════════════════════════════════════════╝
```

**Grade thresholds:**

- 50–60: Excellent — ready for submission
- 40–49: Good — minor improvements recommended
- 30–39: Needs Work — specific issues to address
- Below 30: Poor — significant revision needed

## Detailed Findings

## Reverse-outline diagnostics (read-only)

After evaluating the draft, inspect its actual paragraphs or meaningful writing units. For each, summarize its apparent role or claim, evidence used, and explanation or link to the thesis. Note repetition, factual claims without evident support, missing explanation between evidence and claim, and abrupt progression as questions for the researcher—not automatic verdicts. Base this only on the article as read; this report must not modify article text, citations, notes, outline, snapshots, or run state. Keep this diagnostic distinct from the scorecard and citation audit.
For substantive review of English prose, call `academic_writer_lint_prose({text: ARTICLE_TEXT, language: targetLanguage})` and present only contextually relevant matches as tentative prompts. This review is read-only: do not edit article text, citations, notes, outline, snapshots, or run state. Do not call the style linter in mechanical proofread mode.

After the scorecard, list specific issues found:

> **Issues to address:**
>
> 1. [Dimension] — [specific issue and location]
> 2. ...
>
> **Strengths:**
>
> 1. [Dimension] — [what works well]
> 2. ...

## When Run as Pipeline Step (Step 8.7)

If the score is below 40, warn the researcher:

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "The article scored NN/60 on self-review. Some issues were found. How would you like to proceed?"
>
> 1. **Continue to DOCX output** — Generate the document as-is. You can edit later.
> 2. **Show me the issues** — Review the detailed findings before proceeding.
> 3. **Run edits first** — Address the issues before generating the final document.
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

If score is 40+, show the scorecard and continue to DOCX output automatically.
