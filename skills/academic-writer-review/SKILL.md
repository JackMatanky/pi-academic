---
name: academic-writer-review
description: "Self-review quality gate — scores a completed article on 6 dimensions (structure, argument logic, citation completeness, source coverage, writing quality, academic conventions) and presents a scorecard before final output. Use after writing to score the article on quality dimensions before publication."
allowed-tools: bash read glob grep academic_writer_read_resource
metadata: {author: "Yotam Fromm", version: "0.2.23"}
---

# Academic Writer — Article Self-Review

A structured quality gate that scores a completed article on 6 dimensions and presents a scorecard to the researcher.

## When to Use

- Automatically invoked as Step 8.7 in the write-article pipeline (between Synthesis and DOCX Output)
- Can be run standalone on any article: `/skill:academic-writer-review`

## Load Profile

```bash
cat .academic-helper/profile.md
```

If no profile, tell the researcher to run `/skill:academic-writer-init` first.

## Input

When run standalone, ask:
> "Which article would you like to review? Provide the path to a markdown (.md) file in `articles/`."

List available articles:
```bash
ls articles/*.md 2>/dev/null
```

Read the selected article with the `Read` tool.

When invoked as a pipeline step, the article text is passed directly.

## Scorecard rubric

The 6-dimension scorecard is defined in `references/scorecard.json` (machine-readable, versioned). At the start of every review, call `academic_writer_read_resource` with `name: scorecard`.

For each dimension:
1. Score 0–10 against the listed `criteria`.
2. Sum the dimension scores.
3. Compare to `scoring.passThreshold` (default 40). Below threshold → researcher review required.

The scorecard is the single source of truth — do not score on dimensions not listed there, and do not change weights inline. To adjust scoring, edit `references/scorecard.json` and bump its `version` field.

Also check the researcher's style fingerprint for Writing Quality (dimension 5):

```bash
python3 -c "
import re, json
content = open('.academic-helper/profile.md').read()
m = re.search(r'## Style Fingerprint\n+\x60\x60\x60json\n(.*?)\n\x60\x60\x60', content, re.DOTALL)
print(m.group(1) if m else 'null')
"
```

And load linking words for Academic Conventions (dimension 6) by calling `academic_writer_read_resource` with `name: words`.

## Scorecard Output

Present the results as a clear scorecard:

```
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

After the scorecard, list specific issues found:

> **Issues to address:**
> 1. [Dimension] — [specific issue and location]
> 2. ...
>
> **Strengths:**
> 1. [Dimension] — [what works well]
> 2. ...

## When Run as Pipeline Step (Step 8.7)

If the score is below 40, warn the researcher:

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "The article scored NN/60 on self-review. Some issues were found. How would you like to proceed?"
> 1. **Continue to DOCX output** — Generate the document as-is. You can edit later.
> 2. **Show me the issues** — Review the detailed findings before proceeding.
> 3. **Run edits first** — Address the issues before generating the final document.
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

If score is 40+, show the scorecard and continue to DOCX output automatically.

