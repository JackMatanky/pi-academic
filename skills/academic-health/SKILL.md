---
name: academic-health
description: "Check the health of all Academic Writer integrations — profile, MCP config, Zotero, past articles, source index, and export tools. Use when something stops working, after install, or before a long write session."
allowed-tools: bash read pi_academic_read_resource pi_academic_resolve_csl pi_academic_list_agents pi_academic_status pi_academic_health pi_academic_ingest_sources pi_academic_snapshot_citations pi_academic_resolve_mcp_tool
metadata: { author: "Yotam Fromm", version: "0.2.24" }
---

# Academic Writer — Health Check

Run a comprehensive health check on every component of the Academic Writer system. Report status clearly so the researcher knows what's working and what needs attention.

## 1. Local package status

Call `pi_academic_status` and `pi_academic_health`. Use their structured details for:

- profile existence and parsed fields
- source and bibliography availability
- active/last run state
- past-article/article counts
- packaged agent files
- local command availability (`pandoc`, `xelatex`, `tectonic`, `zotero-mcp`, `nlm`)

If the profile is missing: report `FAIL` and suggest `/skill:academic-setup`.

---

## 2. Past Articles

Use `pi_academic_status`/`pi_academic_health` details. If empty: "Add 5–10 published articles for style analysis, then re-run `/skill:academic-setup`."

---

## 3. Zotero / MCP Config

**Skip if `tools.zotero.enabled` is false.** Report as "Disabled (enable with `/skill:academic-setup`)".

Use `pi_academic_health` for the `zotero-mcp` binary check. If a project `.mcp.json` exists and needs debugging, read it with the Read tool; do not parse credentials or copy secrets into the report.

**Harness-neutral MCP dispatch:** resolve each distinct bare-named tool before
calling it. Bare names are tools without the `pi_academic_` prefix (e.g.
`zotero_get_item_fulltext`, `notebook_list`, `get_text`). Call
`pi_academic_resolve_mcp_tool` with the bare name, then use its returned
`live_name` for subsequent calls. If `live_name` is `null`, treat that tool as
unavailable for this run.

Resolve `zotero_get_recent` and call its returned `live_name` with `limit=20` to
probe live MCP connectivity.

Report:

- `zotero-mcp` binary installed? ✓/✗
- Project `.mcp.json` present? ✓/✗/not required if global config works
- If project `.mcp.json` has a `zotero` server under pi: verify `settings.toolPrefix` is `"none"` and `mcpServers.zotero.directTools` lists the tools this package calls. Under omp, these keys are ignored; judge the integration by live tool resolution and the connectivity probe.
- MCP server connected? ✓/✗
- Number of items in library
- Configured collection scope: `tools.zotero.collection.name/key` or "all library"
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
      "directTools": [
        "zotero_get_recent",
        "zotero_get_collections",
        "zotero_get_collection_items",
        "zotero_get_item_fulltext",
        "zotero_get_item_metadata",
        "zotero_get_pdf_outline",
        "zotero_read_pdf_pages",
        "zotero_search_items",
        "zotero_semantic_search",
        "zotero_get_search_database_status",
        "zotero_update_search_database"
      ]
    }
  }
}
```

Under oh-my-pi the `settings`/`directTools` keys are ignored and tools appear as `mcp__<server>_<tool>`, which `pi_academic_resolve_mcp_tool` finds; a root `.mcp.json` is a supported portable fallback (omp's primary files are `.omp/mcp.json` and `~/.omp/agent/mcp.json`).

Warn: never put API keys in a git-tracked project `.mcp.json`; use user-global MCP config or command interpolation for Zotero web/API credentials.

Direct MCP tools are cached at startup: after `.mcp.json` or global MCP config is created or changed for the first time, call `pi_academic_status`: on `harness: pi`, ask the researcher to restart pi; on `harness: omp`, run `/mcp reload` instead of restarting. Then re-run the probe — `zotero_get_recent` stays unavailable otherwise.

---

## 4. Local Sources Folder & Citation Snapshots

Use `pi_academic_status` / `pi_academic_health`; do not call `pi_academic_ingest_sources` during health checks because it writes cache files.
Report:

- Local source folder present? ✓/✗
- Local source files count
- Citation snapshot search priority: `articles/<slug>.sources.json` (Primary) -> `.pi-academic/sources.json` (Fallback)

---

## 5. Sefaria Context Integration

**Skip if `tools.sefaria.enabled` is false.** Report as "Disabled (enable with `/skill:academic-setup`)".

If `tools.sefaria.enabled` is true, resolve `get_text` and `search` with
`pi_academic_resolve_mcp_tool`; call only returned `live_name` values. If both
return `null`, report that biblical context expansion is unavailable.

Report:

- Sefaria integration enabled? ✓/✗
- Resolved Sefaria MCP tools available? ✓/✗
- If error/missing: warn that biblical context expansion will be limited.

## 6. NotebookLM

**Skip if `tools.notebooklm.enabled` is false.** Report as "Disabled (enable with `/skill:academic-setup`)".

Use `pi_academic_health` for the `nlm` and `notebooklm-mcp` binary checks.
If installed, run `nlm login --check`; resolve `notebook_list` with
`pi_academic_resolve_mcp_tool` and call its returned `live_name` as the live
MCP probe.

Report:

- CLI installed? ✓/✗
- MCP server binary installed? ✓/✗
- Project `.mcp.json` present? ✓/✗/not required if global config works
- If project `.mcp.json` has a `notebooklm-mcp` server under pi: verify `settings.toolPrefix` is `"none"` and `mcpServers["notebooklm-mcp"].directTools` lists the tools this package calls. Under omp, these keys are ignored; judge the integration by live tool resolution and the notebook probe.
- Authenticated? ✓/✗
- MCP can list notebooks? ✓/✗ (and count)
- Configured notebook scope: `tools.notebooklm.notebook.name/id` or "all notebooks"
- If error: show the error message

**If CLI not installed**, show this setup guide:

> **How to set up NotebookLM:**
>
> 1. Install the CLI:
>
>    ```text
>    uv tool install notebooklm-mcp-cli
>    ```
>
> 2. Authenticate:
>
>    ```text
>    nlm login
>    ```
>
> 3. Add `notebooklm-mcp` to `.mcp.json` or user-global MCP config with `toolPrefix: "none"` and `directTools` listing the NotebookLM tools this package calls (`notebook_list`, `notebook_query`, `notebook_create`, `source_add`, `studio_create`, `studio_status`).
>
> 4. Re-run `/skill:academic-health` to verify.

---

## 7. Pandoc / Export Tools

**Skip this check's PDF sub-line reporting only if pandoc itself is missing — still report pandoc's own status either way.**

Use `pi_academic_health` command flags for Pandoc, XeLaTeX, and Tectonic availability. The CSL resolver is provided by `pi_academic_resolve_csl`.

If the profile uses citeproc mode (`citationStyle` is anything except `inline-parenthetical`), resolve the configured CSL reference. Prefer `outputFormatPreferences.cslPath`, then `outputFormatPreferences.csl`, then `citationStyle`.

Call `pi_academic_resolve_csl` with `style: STYLE_OR_PATH` and `download: true`.

Report:

- pandoc installed? ✓/✗ (powers `/skill:academic-export` and citeproc-mode docx generation)
- PDF engine installed? ✓/✗ (`xelatex` or `tectonic`; needed only for PDF export — other export formats work without it)
- CSL resolver installed? ✓/✗
- configured CSL resolves? ✓/✗/— literal mode (show resolved path, or the resolver error)

**If pandoc is not installed**, show this setup guide:

> **How to set up pandoc:**
>
> 1. Install pandoc: see <https://pandoc.org/installing.html>
> 2. Re-run `/skill:academic-health` to verify.

**If neither xelatex nor tectonic is installed** (pandoc may still be fine — this only blocks PDF export), show this setup guide:

> **How to enable PDF export:**
>
> - **Tectonic**: install from <https://tectonic-typesetting.github.io/> or your package manager (for example `brew install tectonic`)
> - **XeLaTeX/macOS**: `brew install --cask basictex && sudo tlmgr install collection-xetex`
> - **other platforms**: install Tectonic or any TeX distribution from <https://pandoc.org/installing.html>, then ensure `tectonic` or `xelatex` is on your `PATH`.
> - Re-run `/skill:academic-health` to verify.

---

## 7b. Markdown Lint (rumdl) — optional

Use `pi_academic_health` command flags for rumdl availability. This check is informational — rumdl is optional and never blocks export or writing.

Report:

- rumdl installed? ✓/✗ (optional — powers pre-export markdown lint for `articles/*.md`)
- `.rumdl.toml` config present? ✓/✗

**If rumdl is not installed**, show this setup guide (only if the researcher asks, or in verbose mode):

> **How to set up rumdl (optional):**
>
> 1. Install: `cargo install rumdl` or see <https://rumdl.dev/installation/>
> 2. Re-run `/skill:academic-health` to verify.

---

## 8. Agent Files

Use `pi_academic_status` details for packaged agent filenames. Call `pi_academic_list_agents` only if you need the plain-text list.

---

## Present Results

Show a clean summary table:

> **Academic Writer — Health Report**
>
> | Component         | Status                                     | Details                                                                                |
> | ----------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
> | Profile           | ✓ OK / ✗ MISSING                           | Field: [field], Citation: [style], Sources: [N]                                        |
> | Style Fingerprint | ✓ Expanded / ⚠ Flat / ✗ Missing            | [N] dimensions                                                                         |
> | Past Articles     | ✓ [N] files / ✗ Empty                      | PDF: [n], DOCX: [n]                                                                    |
> | Zotero            | ✓ Connected / ✗ Error / — Disabled         | [N] items                                                                              |
> | Local Sources     | ✓ Ready / — None                           | [N] local source files in `.pi-academic/sources/`                                  |
> | NotebookLM        | ✓ Connected / ✗ Not found / — Disabled     | [N] notebooks                                                                          |
> | Sefaria           | ✓ Connected / ✗ Tools missing / — Disabled | Text & search tools                                                                    |
> | Pandoc / Export   | ✓ Ready / ⚠ PDF unavailable / ✗ Not found  | Pandoc: [status], XeTeX: [status], Tectonic: [status], CSL: [resolved/missing/literal] |
> | Rumdl / Lint      | ✓ Installed / — Not found (optional)       | `.rumdl.toml`: ✓/✗                                                                     |
> | Agent Files       | ✓ All present / ✗ Missing [list]           | 10/10                                                                                  |
>
> **Overall: [N]/[total] checks passed**

If there are issues, provide specific fix instructions:

> **To fix:**
>
> 1. [Issue] → [specific command or action]
> 2. [Issue] → [specific command or action]
