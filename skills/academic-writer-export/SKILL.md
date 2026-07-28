---
name: academic-writer-export
description: "Convert a finished article to additional document formats (PDF, HTML, ODT, LaTeX, EPUB) via pandoc. Use when the researcher wants to convert a finished article to PDF, HTML, ODT, LaTeX, or EPUB — after /skill:academic-writer-write or /skill:academic-writer-edit has produced articles/<slug>.md."
allowed-tools: bash read write find academic_writer_read_resource academic_writer_get_profile academic_writer_health academic_writer_list_project_files academic_writer_audit_citations academic_writer_export_article
metadata: {author: "Yotam Fromm", version: "0.2.24"}
---

# Academic Writer — Export

Convert an already-written `articles/<slug>.md` into additional formats using [pandoc](https://pandoc.org). This skill never produces `.docx` — that format is owned by the write/edit pipeline's own Step 9b (`generate-docx.py` for `inline-parenthetical` articles, or a direct `pandoc --citeproc` docx run for citeproc-mode articles). This skill is for every *other* format the researcher wants to share or archive the piece in.

---

## 1. Check export tooling

Call `academic_writer_health`.

If `commands.pandoc` is false, stop immediately — do not attempt any conversion. Tell the researcher:

> "This skill needs [pandoc](https://pandoc.org/installing.html) installed on your machine — it's not bundled with Academic Writer. Install it, then re-run `/skill:academic-writer-export`."

---

## 1a. Load profile, run state, and citation contract

Call `academic_writer_get_profile`. If it returns `ok: false`, stop and tell the researcher to run `/skill:academic-writer-init` first.

Call `academic_writer_read_resource` with `name: run_state_contract`, then create or update `.academic-helper/runs/<run-id>.json` for this export run. Use `phase: export`; update status to `complete`, `failed`, or `blocked` before stopping.

Call `academic_writer_read_resource` with `name: citation_export_contract`; export must follow that contract.

## 2. Identify the article

Call `academic_writer_list_project_files` with `kind: "articles"` and use the returned newest-first `files`.

- If exactly one `.md` file exists in `articles/`, default to it and confirm: "Export `articles/<slug>.md` — is that the one?"
- If several exist, list them (most recent first) and ask:
  > "Which article do you want to export? Give me the slug or filename."
- If none exist, tell the researcher there's nothing to export yet and point them to `/skill:academic-writer-write`.

Resolve `SLUG` and `MD_PATH` from the chosen file (`articles/<slug>.md` → `SLUG=<slug>`, `MD_PATH=articles/<slug>.md`).

---

## 3. Ask which format(s)

Ask (multi-select):
> "Which format(s) do you want? PDF, HTML, ODT, LaTeX, EPUB — pick one or more."

---

## 4. Check PDF engine (only needed for PDF)

If PDF was requested, use `academic_writer_health` command flags to select `PDF_ENGINE`:
- If `commands.xelatex` is true, use `PDF_ENGINE=xelatex` to preserve the existing Hebrew-safe default.
- Else if `commands.tectonic` is true, use `PDF_ENGINE=tectonic`.
- If both are installed and the researcher explicitly asked for Tectonic, use `PDF_ENGINE=tectonic`.

If both engines are missing, skip the PDF conversion and tell the researcher clearly:

> "PDF export needs a Unicode-capable TeX engine: either XeTeX (`xelatex`) or Tectonic (`tectonic`). The default `pdflatex` engine can't render Hebrew script. I'll export your other requested format(s) now; to enable PDF:
> - **Tectonic**: install from https://tectonic-typesetting.github.io/ or your package manager (for example `brew install tectonic`)
> - **XeLaTeX/macOS**: `brew install --cask basictex && sudo tlmgr install collection-xetex`
> - **other platforms**: install Tectonic or any TeX distribution from https://pandoc.org/installing.html, then ensure `tectonic` or `xelatex` is on your `PATH`."

Proceed with the other requested formats regardless (HTML/ODT/LaTeX/EPUB have no such dependency — always attempt them if requested).

---

## 4a. Deterministic citation audit and conversion

Call `academic_writer_export_article` with:
- `article: MD_PATH`
- `citationStyle: citationStyle` from `academic_writer_get_profile` (`inline-parenthetical` if unavailable)
- `formats: requested formats`, excluding PDF if no supported engine is installed
- `pdfEngine: PDF_ENGINE` when PDF is included

`academic_writer_export_article` runs the deterministic citation audit first. If it returns `ok: false` because the audit failed, set the run state to `failed` and report the exact missing/wrong-mode citation details. If a single Pandoc format fails after a passing audit, report that format's error and keep any other successful outputs.

---

## 6. Report results

List exactly which files were written:

> **Export complete.** Files written to `articles/`:
> - `articles/<slug>.html`
> - `articles/<slug>.odt`
> - `articles/<slug>.epub`
>
> PDF was skipped — neither `xelatex` nor `tectonic` was found. See install instructions above.