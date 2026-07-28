---
name: academic-writer-health
description: "Check the health of all Academic Writer integrations — profile, MCP config, Zotero, past articles, source index, and export tools. Use when something stops working, after install, or before a long write session."
allowed-tools: bash read academic_writer_read_resource academic_writer_resolve_csl academic_writer_list_agents academic_writer_status academic_writer_health
metadata: {author: "Yotam Fromm", version: "0.2.24"}
---

# Academic Writer — Health Check

Run a comprehensive health check on every component of the Academic Writer system. Report status clearly so the researcher knows what's working and what needs attention.

## 1. Local package status

Call `academic_writer_status` and `academic_writer_health`. Use their structured details for:
- profile existence and parsed fields
- source and bibliography availability
- active/last run state
- past-article/article counts
- packaged agent files
- local command availability (`pandoc`, `xelatex`, `tectonic`, `zotero-mcp`, `nlm`)

If the profile is missing: report `FAIL` and suggest `/skill:academic-writer-init`.

---

## 2. Past Articles

Use `academic_writer_status`/`academic_writer_health` details. If empty: "Add 5–10 published articles for style analysis, then re-run `/skill:academic-writer-init`."

---

## 3. Zotero / MCP Config

**Skip if `tools.zotero.enabled` is false.** Report as "Disabled (enable with `/skill:academic-writer-update-tools`)".

Use `academic_writer_health` for the `zotero-mcp` binary check. If a project `.mcp.json` exists and needs debugging, read it with the Read tool; do not parse credentials or copy secrets into the report.

Then call `zotero_get_recent(limit=20)` to probe live MCP connectivity.

Report:
- `zotero-mcp` binary installed? ✓/✗
- Project `.mcp.json` present? ✓/✗/not required if global config works
- If project `.mcp.json` has a `zotero` server: `settings.toolPrefix` is `"none"`? ✓/✗ and `mcpServers.zotero.directTools` is `true`? ✓/✗
- MCP server connected? ✓/✗
- Number of items in library
- If error: show the error message

If `zotero_get_recent` is unavailable but `zotero-mcp` is installed, recommend configuring the standard MCP `zotero` server. For local Zotero, the safe project-local `.mcp.json` block is:

```json
{
  "settings": { "toolPrefix": "none" },
  "mcpServers": {
    "zotero": {
      "command": "zotero-mcp",
      "args": ["serve"],
      "env": { "ZOTERO_LOCAL": "true" },
      "directTools": true
    }
  }
}
```

Warn: never put API keys in a git-tracked project `.mcp.json`; use user-global MCP config or command interpolation for Zotero web/API credentials.

---

## 6. NotebookLM

**Skip if `tools.notebooklm.enabled` is false.** Report as "Disabled (enable with `/skill:academic-writer-update-tools`)".

Use `academic_writer_health` for the `nlm` and `notebooklm-mcp` binary checks. If installed, run `nlm login --check`; use `notebook_list()` as the live MCP probe.

Report:
- CLI installed? ✓/✗
- MCP server binary installed? ✓/✗
- Project `.mcp.json` present? ✓/✗/not required if global config works
- If project `.mcp.json` has a `notebooklm-mcp` server: `settings.toolPrefix` is `"none"`? ✓/✗ and `mcpServers["notebooklm-mcp"].directTools` is `true`? ✓/✗
- Authenticated? ✓/✗
- MCP can list notebooks? ✓/✗ (and count)
- If error: show the error message

**If CLI not installed**, show this setup guide:

> **How to set up NotebookLM:**
>
> 1. Install the CLI:
>    ```
>    uv tool install notebooklm-mcp-cli
>    ```
>
> 2. Authenticate:
>    ```
>    nlm login
>    ```
>
> 3. Add `notebooklm-mcp` to `.mcp.json` or user-global MCP config with `toolPrefix: "none"` and `directTools: true`.
>
> 4. Re-run `/skill:academic-writer-health` to verify.

---

## 7. Pandoc / Export Tools

**Skip this check's PDF sub-line reporting only if pandoc itself is missing — still report pandoc's own status either way.**

Use `academic_writer_health` command flags for Pandoc, XeLaTeX, and Tectonic availability. The CSL resolver is provided by `academic_writer_resolve_csl`.

If the profile uses citeproc mode (`citationStyle` is anything except `inline-parenthetical`), resolve the configured CSL reference. Prefer `outputFormatPreferences.cslPath`, then `outputFormatPreferences.csl`, then `citationStyle`.

Call `academic_writer_resolve_csl` with `style: STYLE_OR_PATH` and `download: true`.

Report:
- pandoc installed? ✓/✗ (powers `/skill:academic-writer-export` and citeproc-mode docx generation)
- PDF engine installed? ✓/✗ (`xelatex` or `tectonic`; needed only for PDF export — other export formats work without it)
- CSL resolver installed? ✓/✗
- configured CSL resolves? ✓/✗/— literal mode (show resolved path, or the resolver error)

**If pandoc is not installed**, show this setup guide:

> **How to set up pandoc:**
>
> 1. Install pandoc: see https://pandoc.org/installing.html
> 2. Re-run `/skill:academic-writer-health` to verify.

**If neither xelatex nor tectonic is installed** (pandoc may still be fine — this only blocks PDF export), show this setup guide:

> **How to enable PDF export:**
>
> - **Tectonic**: install from https://tectonic-typesetting.github.io/ or your package manager (for example `brew install tectonic`)
> - **XeLaTeX/macOS**: `brew install --cask basictex && sudo tlmgr install collection-xetex`
> - **other platforms**: install Tectonic or any TeX distribution from https://pandoc.org/installing.html, then ensure `tectonic` or `xelatex` is on your `PATH`.
> - Re-run `/skill:academic-writer-health` to verify.

---

## 8. Agent Files

Use `academic_writer_status` details for packaged agent filenames. Call `academic_writer_list_agents` only if you need the plain-text list.

---

## Present Results

Show a clean summary table:

> **Academic Writer — Health Report**
>
> | Component | Status | Details |
> |-----------|--------|---------|
> | Profile | ✓ OK / ✗ MISSING | Field: [field], Citation: [style], Sources: [N] |
> | Style Fingerprint | ✓ Expanded / ⚠ Flat / ✗ Missing | [N] dimensions |
> | Past Articles | ✓ [N] files / ✗ Empty | PDF: [n], DOCX: [n] |
> | Zotero | ✓ Connected / ✗ Error / — Disabled | [N] items |
> | NotebookLM | ✓ Connected / ✗ Not found / — Disabled | [N] notebooks |
> | Pandoc / Export | ✓ Ready / ⚠ PDF unavailable / ✗ Not found | Pandoc: [status], XeTeX: [status], CSL: [resolved/missing/literal] |
> | Agent Files | ✓ All present / ✗ Missing [list] | 5/5 |
>
> **Overall: [N]/[total] checks passed**

If there are issues, provide specific fix instructions:
> **To fix:**
> 1. [Issue] → [specific command or action]
> 2. [Issue] → [specific command or action]
