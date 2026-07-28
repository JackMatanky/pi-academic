# Integration Setup (Zotero, NotebookLM)

> Loaded on demand by `init` Phase 1. Each tool has detection command, configuration block, and registration steps.
> MCP server credentials/configuration belong in standard MCP config (`.mcp.json`, `~/.config/mcp/mcp.json`, `.pi/mcp.json`), not in `.academic-writer/profile.md`.

## Detection Commands

Run ALL in parallel:

- **Zotero MCP tool availability**: call `zotero_get_recent(limit=1)`; DETECTED if it returns without an error, NOT_DETECTED otherwise. An error mentioning "local API" means the `zotero` MCP server is configured but Zotero desktop isn't open or the local API is disabled in Settings → Advanced.
- **Zotero server binary**: `command -v zotero-mcp >/dev/null 2>&1 && echo "ZOTERO_MCP_BINARY: INSTALLED" || echo "ZOTERO_MCP_BINARY: NOT_FOUND"`.
- **Project MCP config**: `test -f .mcp.json && cat .mcp.json || echo "NO_PROJECT_MCP_JSON"`. This is only for helping the researcher see whether the project already has MCP config; do not treat absence as failure if a global MCP config provides the server.
- **NotebookLM**:

```python
Bash(
    command="command -v nlm >/dev/null 2>&1 && nlm login --check 2>/dev/null && echo 'DETECTED' || echo 'NOT_DETECTED'"
)
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

   If NOT_DETECTED but `zotero-mcp` is installed: explain that Academic Writer now reads Zotero through standard MCP config. Offer to create a safe local-mode project `.mcp.json` if no project config exists, or to show the snippet if one already exists and should be merged manually:

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

   Only write `.mcp.json` after the researcher approves. If `.mcp.json` already exists, do not overwrite it; read it, show the researcher where the `zotero` server block should be merged, and prefer manual merge unless the file is a simple JSON object you can safely update. Never write API keys into `.mcp.json` for them. For web/API Zotero mode, instruct them to use user-global MCP config (`~/.config/mcp/mcp.json`) or command interpolation (e.g. macOS Keychain via `!security ...`); MCP config also supports `${ZOTERO_API_KEY}` / `${ZOTERO_LIBRARY_ID}` if they prefer shell env vars.

   If both the tool and binary are NOT_DETECTED: "✗ Not found — install with `pip install zotero-mcp-server`, then configure a `zotero` MCP server in `.mcp.json` or `~/.config/mcp/mcp.json` (see github.com/54yyyu/zotero-mcp)."
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
- If a tool is not detected and the researcher selects it, show the setup URL and walk them through installation/configuration. For Zotero, installation (`zotero-mcp`) and MCP registration (`.mcp.json`/global MCP config with `toolPrefix: "none"` + `directTools: true`) are separate checks; complete both before marking it detected.
- Store final selection as the `tools` object (used in Phase 4). Store only enabled/disabled intent and mode labels — never credentials.
