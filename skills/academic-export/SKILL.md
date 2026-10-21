---
name: academic-export
description: "Export a finished article to DOCX, ODT, LaTeX, or PDF via Pandoc. Use when the researcher wants to convert a finished article after /skill:academic-write or /skill:academic-edit."
allowed-tools: bash read write find pi_academic_read_resource pi_academic_get_profile pi_academic_health pi_academic_list_project_files pi_academic_audit_citations pi_academic_resolve_csl pi_academic_export_article pi_academic_style_package
metadata: { author: "Yotam Fromm", version: "0.2.25" }
---

# Pi Academic — Export

Export a finished `articles/<slug>.md` to DOCX, ODT, LaTeX (`.tex`), or PDF with Pandoc. Citation style and document appearance are independent: CSL controls citation formatting; a selected project style package controls appearance.

## 1. Check tools and profile

Call `pi_academic_health` and `pi_academic_get_profile`. If Pandoc is unavailable, or the profile is missing, stop and report the required setup. Read `run_state_contract` and `citation_export_contract`; create/update the export run state and follow the citation contract.

Identify the article using `pi_academic_list_project_files` (`kind: articles`). Confirm the target when multiple Markdown articles exist.

## 2. Select outputs and appearance

Ask which of DOCX, ODT, LaTeX, and PDF to produce. Resolve the profile's `outputFormatPreferences.stylePackage`, if configured, and pass it through only when the researcher explicitly chooses a different package for this export. For appearance errors, report each format failure independently; do not silently fall back to unstyled output.
When PDF is requested, omit `pdfEngine` unless the researcher explicitly chooses between installed engines: the tool uses the style package's `formats.pdf.engine`, then whichever of XeLaTeX or Tectonic is installed (XeLaTeX first). PDF requires one of them; if neither is installed, omit PDF, explain the prerequisite, and continue the other requested formats.

## 3. Citation audit and export

In citeproc mode (anything except `inline-parenthetical`), resolve the CSL with `pi_academic_resolve_csl`, preferring `outputFormatPreferences.cslPath`, then `.csl`, then `citationStyle`; use `download: true`.

Call `pi_academic_export_article` with the article path, profile citation style, requested canonical formats, resolved CSL when applicable, and `pdfEngine` only for an explicit engine choice. Pass `stylePackage` only for an explicit per-export override. The tool runs the deterministic citation audit before exporting. If the audit fails, stop and report its exact findings. If an individual output fails, report its error and retain successful outputs from other formats.

## 4. Report results

List only files actually reported successful by the tool, their paths, and any per-format failures or skipped PDF prerequisite. LaTeX output uses the `.tex` extension. Relay each format's `style.warnings` verbatim: they name the design properties that format cannot express. To check a package without exporting, call `pi_academic_style_package` with `action: "validate"`.
