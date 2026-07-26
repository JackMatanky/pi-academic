---
name: academic-writer-health
description: "Check the health of all Academic Writer integrations — profile, MCP config, Zotero, past articles, source index, and export tools. Use when something stops working, after install, or before a long write session."
allowed-tools: bash read
metadata: {author: "Yotam Fromm", version: "0.2.24"}
---

# Academic Writer — Health Check

Run a comprehensive health check on every component of the Academic Writer system. Report status clearly so the researcher knows what's working and what needs attention.

## 1. Profile Check

```bash
if [ -f .academic-helper/profile.md ]; then
  cat .academic-helper/profile.md
else
  echo "MISSING"
fi
```

If missing: report `FAIL` and suggest `/skill:academic-writer-init`.

If found, validate:
- Has `fieldOfStudy`? ✓/✗
- Has `citationStyle`? ✓/✗
- Has `styleFingerprint`? ✓/✗
- Fingerprint format: is it the expanded (nested) format or the old flat format?
  - If flat format: suggest re-running `/skill:academic-writer-init` to get the expanded 25-dimension fingerprint
- Has `tools` object? ✓/✗
- Has `sources` array? ✓/✗ (and count)
- `createdAt` / `updatedAt` timestamps

---

## 2. Past Articles

```bash
ls past-articles/ 2>/dev/null | head -20
```

Report:
- Folder exists? ✓/✗
- Number of files found
- File types (PDF, DOCX, other)
- If empty: "Add 5–10 published articles for style analysis, then re-run `/skill:academic-writer-init`."

---

## 3. Zotero / MCP Config

**Skip if `tools.zotero.enabled` is false.** Report as "Disabled (enable with `/skill:academic-writer-update-tools`)".

Check the server binary and project-local MCP config helper information:

```bash
command -v zotero-mcp >/dev/null 2>&1 && echo "ZOTERO_MCP_BINARY: INSTALLED" || echo "ZOTERO_MCP_BINARY: NOT_FOUND"
if [ -f .mcp.json ]; then
  python3 -c "import json; p='.mcp.json'; d=json.load(open(p)); s=d.get('settings',{}); z=d.get('mcpServers',{}).get('zotero',{}); print('PROJECT_MCP_JSON: FOUND'); print('TOOL_PREFIX:', s.get('toolPrefix')); print('ZOTERO_DIRECT_TOOLS:', z.get('directTools')); print('ZOTERO_COMMAND:', z.get('command'))" 2>&1
else
  echo "PROJECT_MCP_JSON: NOT_FOUND (global MCP config may still provide zotero)"
fi
```

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

```bash
command -v nlm >/dev/null 2>&1 && echo "CLI: INSTALLED" || echo "CLI: NOT_FOUND"
```

If installed:
```bash
nlm login --check 2>&1
nlm notebook list 2>&1 | head -5
```

Report:
- CLI installed? ✓/✗
- Authenticated? ✓/✗
- Can list notebooks? ✓/✗ (and count)
- If error: show the error message

**If CLI not installed**, show this setup guide:

> **How to set up NotebookLM:**
>
> 1. Install the CLI:
>    ```
>    npm install -g notebooklm-mcp-cli
>    ```
>
> 2. Authenticate:
>    ```
>    nlm login
>    ```
>
> 3. Re-run `/skill:academic-writer-health` to verify.

---

## 7. Pandoc / Export Tools

**Skip this check's PDF sub-line reporting only if pandoc itself is missing — still report pandoc's own status either way.**

```bash
command -v pandoc >/dev/null 2>&1 && echo "PANDOC: INSTALLED" || echo "PANDOC: NOT_FOUND"
command -v xelatex >/dev/null 2>&1 && echo "XELATEX: INSTALLED" || echo "XELATEX: NOT_FOUND"
test -x "$ACADEMIC_WRITER_ROOT"/scripts/resolve-csl.py && echo "CSL_RESOLVER: INSTALLED" || echo "CSL_RESOLVER: NOT_FOUND"
```

If the profile uses citeproc mode (`citationStyle` is anything except `inline-parenthetical`), resolve the configured CSL reference. Prefer `outputFormatPreferences.cslPath`, then `outputFormatPreferences.csl`, then `citationStyle`:

```bash
python3 "$ACADEMIC_WRITER_ROOT"/scripts/resolve-csl.py "STYLE_OR_PATH" --download
```

Report:
- pandoc installed? ✓/✗ (powers `/skill:academic-writer-export` and citeproc-mode docx generation)
- xelatex installed? ✓/✗ (needed only for PDF export — Hebrew-safe LaTeX engine; other export formats work without it)
- CSL resolver installed? ✓/✗
- configured CSL resolves? ✓/✗/— literal mode (show resolved path, or the resolver error)

**If pandoc is not installed**, show this setup guide:

> **How to set up pandoc:**
>
> 1. Install pandoc: see https://pandoc.org/installing.html
> 2. Re-run `/skill:academic-writer-health` to verify.

**If xelatex is not installed** (pandoc may still be fine — this only blocks PDF export), show this setup guide:

> **How to enable PDF export:**
>
> - **macOS**: `brew install --cask basictex && sudo tlmgr install collection-xetex`
> - **other platforms**: install any TeX distribution from https://pandoc.org/installing.html, then ensure `xelatex` is on your `PATH`.
> - Re-run `/skill:academic-writer-health` to verify.

---

## 8. Agent Files

```bash
ls "$ACADEMIC_WRITER_ROOT"/agents/*.md 2>/dev/null
```

Verify all required agent files exist:
- `.claude/agents/deep-reader.md` ✓/✗
- `.claude/agents/architect.md` ✓/✗
- `.claude/agents/section-writer.md` ✓/✗
- `.claude/agents/auditor.md` ✓/✗
- `.claude/agents/synthesizer.md` ✓/✗

---

## Present Results

Show a clean summary table:

> **Academic Writer — Health Report**
>
> | Component | Status | Details |
> |-----------|--------|---------|
> | Profile | ✓ OK / ✗ MISSING | Field: [field], Citation: [style], Sources: [N] |
> | Style Fingerprint | ✓ Expanded / ⚠ Legacy / ✗ Missing | [N] dimensions |
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
