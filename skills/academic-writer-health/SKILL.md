---
name: academic-writer-health
description: "Check the health of all Academic Writer integrations — profile, Zotero, RAG, past articles, and source index. Use when something stops working, after install, or before a long write session."
allowed-tools: bash read
metadata: {author: "Yotam Fromm", version: "0.2.23"}
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

## 3. Zotero

**Skip if `tools.zotero.enabled` is false.** Report as "Disabled (enable with `/skill:academic-writer-update-tools`)".

Call `zotero_get_recent(limit=20)` to probe connectivity.

Report:
- MCP server connected? ✓/✗
- Number of items in library
- If error: show the error message

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

## 7. Agent Files

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
> | Agent Files | ✓ All present / ✗ Missing [list] | 5/5 |
>
> **Overall: [N]/[total] checks passed**

If there are issues, provide specific fix instructions:
> **To fix:**
> 1. [Issue] → [specific command or action]
> 2. [Issue] → [specific command or action]
