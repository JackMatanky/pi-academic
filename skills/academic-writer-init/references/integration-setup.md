# Integration Setup (Zotero, NotebookLM)

> Loaded on demand by `init` Phase 1. Each tool has detection command, configuration block, and registration steps.

## Detection Commands

Run ALL in parallel:

- **Zotero**: call `zotero_get_recent(limit=1)`; DETECTED if it returns without an error, NOT_DETECTED otherwise (an error mentioning "local API" means Zotero desktop isn't open or the local API is disabled in Settings → Advanced).
- **NotebookLM**:

```python
Bash(command="command -v nlm >/dev/null 2>&1 && nlm login --check 2>/dev/null && echo 'DETECTED' || echo 'NOT_DETECTED'")
```

## Present Results

Ask the researcher directly in chat (present as a numbered/lettered list):
1. **Zotero** — Reference manager (local library or web API); best for storing and searching your source PDFs.
   > "Zotero
   > ──────────
   > Type:    MCP server (`zotero-mcp`)
   > What:    Reference manager (local library or web API)
   > Best for: Storing and searching your source PDFs
   > Status:  ✓ Detected"

   If NOT_DETECTED: "✗ Not found — install with `pip install zotero-mcp-server && zotero-mcp setup` (see github.com/54yyyu/zotero-mcp)."
2. **NotebookLM** — AI-powered source Q&A, audio overviews, study guides, research discovery.
   > "NotebookLM
   > ──────────
   > Type:    MCP server (`nlm` CLI)
   > What:    AI-powered source Q&A, audio overviews,
   >          study guides, research discovery
   > Status:  ✓ Detected
   >
   > Setup (if not installed):
   >   npm install -g notebooklm-mcp-cli
   >   nlm login"

Wait for the researcher's reply and match it against the option number, label text, or a close paraphrase (multiple selections allowed).

**Rules:**
- Pre-check options that were detected.
- If a tool is not detected and the researcher selects it, show the setup URL and walk them through installation. Re-run detection after they confirm, before proceeding.
- Store final selection as the `tools` object (used in Phase 4).
