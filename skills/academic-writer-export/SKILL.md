---
name: academic-writer-export
description: "Convert a finished article to additional document formats (PDF, HTML, ODT, LaTeX, EPUB) via pandoc. Use when the researcher wants to convert a finished article to PDF, HTML, ODT, LaTeX, or EPUB — after /skill:academic-writer-write or /skill:academic-writer-edit has produced articles/<slug>.md."
allowed-tools: bash read glob
metadata: {author: "Yotam Fromm", version: "0.2.24"}
---

# Academic Writer — Export

Convert an already-written `articles/<slug>.md` into additional formats using [pandoc](https://pandoc.org). This skill never produces `.docx` — that format is owned by the write/edit pipeline's own Step 9b (`generate-docx.py` for `inline-parenthetical` articles, or a direct `pandoc --citeproc` docx run for citeproc-mode articles). This skill is for every *other* format the researcher wants to share or archive the piece in.

---

## 1. Check pandoc is installed

```bash
command -v pandoc >/dev/null 2>&1 && echo "PANDOC: INSTALLED" || echo "PANDOC: NOT_FOUND"
```

If `NOT_FOUND`, stop immediately — do not attempt any conversion. Tell the researcher:

> "This skill needs [pandoc](https://pandoc.org/installing.html) installed on your machine — it's not bundled with Academic Writer. Install it, then re-run `/skill:academic-writer-export`."

---

## 2. Identify the article

```bash
ls -t articles/*.md 2>/dev/null
```

- If exactly one `.md` file exists in `articles/`, default to it and confirm: "Export `articles/<slug>.md` — is that the one?"
- If several exist, list them (most recent first) and ask:
  > "Which article do you want to export? Give me the slug or filename."
- If none exist, tell the researcher there's nothing to export yet and point them to `/skill:academic-writer-write`.

Resolve `SLUG` from the chosen file (`articles/<slug>.md` → `SLUG=<slug>`).

---

## 3. Ask which format(s)

Ask (multi-select):
> "Which format(s) do you want? PDF, HTML, ODT, LaTeX, EPUB — pick one or more."

---

## 4. Check xelatex (only needed for PDF)

If PDF was requested:

```bash
command -v xelatex >/dev/null 2>&1 && echo "XELATEX: INSTALLED" || echo "XELATEX: NOT_FOUND"
```

If `NOT_FOUND`, skip the PDF conversion and tell the researcher clearly:

> "PDF export needs a LaTeX distribution with XeTeX (`xelatex`) — the default `pdflatex` engine can't render Hebrew script. I'll export your other requested format(s) now; to enable PDF:
> - **macOS**: `brew install --cask basictex && sudo tlmgr install collection-xetex`
> - **other platforms**: install any TeX distribution from https://pandoc.org/installing.html, then ensure `xelatex` is on your `PATH`."

Proceed with the other requested formats regardless (HTML/ODT/LaTeX/EPUB have no such dependency — always attempt them if requested).

---

## 5. Run the conversions

For every requested format except PDF (when `xelatex` is missing):

```bash
MD_PATH="articles/${SLUG}.md"

# HTML
pandoc "$MD_PATH" --citeproc -o "articles/${SLUG}.html"

# ODT
pandoc "$MD_PATH" --citeproc -o "articles/${SLUG}.odt"

# LaTeX
pandoc "$MD_PATH" --citeproc -o "articles/${SLUG}.tex"

# EPUB
pandoc "$MD_PATH" --citeproc -o "articles/${SLUG}.epub"

# PDF (only if xelatex is installed)
pandoc "$MD_PATH" --citeproc --pdf-engine=xelatex -o "articles/${SLUG}.pdf"
```

Only run the lines for formats the researcher actually selected.

`--citeproc` is unconditional and safe to pass for every article, including `inline-parenthetical` (Hebrew literal-citation) articles that carry no `[@citekey]` markers and no `bibliography:`/`csl:` frontmatter — it's a harmless no-op there. For citeproc-mode articles, the markdown's own YAML frontmatter (`bibliography:`, `csl:`) drives citation rendering automatically; no extra flags are needed.

If any single `pandoc` invocation fails (non-zero exit), report that specific format's error to the researcher and continue attempting the remaining requested formats — one failure must not abort the whole batch.

---

## 6. Report results

List exactly which files were written:

> **Export complete.** Files written to `articles/`:
> - `articles/<slug>.html`
> - `articles/<slug>.odt`
> - `articles/<slug>.epub`
>
> PDF was skipped — `xelatex` not found. See install instructions above.