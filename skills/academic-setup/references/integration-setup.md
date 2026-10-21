<!-- Consolidated mode guidance for integration-setup.md. -->

# Integration Setup (Zotero, NotebookLM, Sefaria)

> Loaded on demand by `init` Phase 1. Each tool has detection command, configuration block, and registration steps.
> MCP server credentials/configuration belong in standard MCP config (`.mcp.json`, `~/.config/mcp/mcp.json`, `.pi/mcp.json` under pi; `.omp/mcp.json`, `~/.omp/agent/mcp.json` under omp), not in `.pi-academic/profile.md`.

## Detection Commands

Run ALL in parallel:

- **Zotero MCP tool availability**: call `zotero_get_recent(limit=1)`; DETECTED if it returns without an error, NOT_DETECTED otherwise. An error mentioning "local API" means the `zotero` MCP server is configured but Zotero desktop isn't open or the local API is disabled in Settings → Advanced.
- **Zotero server binary**: `command -v zotero-mcp >/dev/null 2>&1 && echo "ZOTERO_MCP_BINARY: INSTALLED" || echo "ZOTERO_MCP_BINARY: NOT_FOUND"`.
- **Project MCP config**: `test -f .mcp.json && cat .mcp.json || echo "NO_PROJECT_MCP_JSON"`. This is only for helping the researcher see whether the project already has MCP config; do not treat absence as failure if a global MCP config provides the server.
- **NotebookLM MCP tool availability**: call `notebook_list()`: DETECTED if it returns without an error, NOT_DETECTED otherwise.
- **NotebookLM CLI/server binary**: `command -v nlm >/dev/null 2>&1 && command -v notebooklm-mcp >/dev/null 2>&1 && nlm login --check 2>/dev/null && echo "NOTEBOOKLM: INSTALLED_AND_AUTHED" || echo "NOTEBOOKLM: NOT_READY"`
- **Sefaria MCP tool availability**: check whether bare `get_text` / `search` tools are available; DETECTED only if at least one can be called without a tool-not-found error. Also check `command -v sefaria-mcp >/dev/null 2>&1 && echo "SEFARIA_MCP_BINARY: INSTALLED" || echo "SEFARIA_MCP_BINARY: NOT_FOUND"`..

## Present Results

Ask the researcher directly in chat (present as a numbered/lettered list):

1. **Zotero** — Reference manager (local library or web API); best for storing and searching your source PDFs.

   > "Zotero
   > ──────────
   > Type: MCP server (`zotero-mcp`)
   > What: Reference manager (local library or web API)
   > Best for: Storing and searching your source PDFs
   > Status: ✓ Detected"

   If NOT_DETECTED but `zotero-mcp` is installed: explain that Academic Writer now reads Zotero through standard MCP config. Offer to create a safe local-mode project `.mcp.json` if no project config exists, or to show the snippet if one already exists and should be merged manually:

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

   Only write `.mcp.json` after the researcher approves. If `.mcp.json` already exists, do not overwrite it; read it, show the researcher where the `zotero` server block should be merged, and prefer manual merge unless the file is a simple JSON object you can safely update. Never write API keys into `.mcp.json` for them. For web/API Zotero mode, instruct them to use user-global MCP config (`~/.config/mcp/mcp.json`) or command interpolation (e.g. macOS Keychain via `!security ...`); MCP config also supports `${ZOTERO_API_KEY}` / `${ZOTERO_LIBRARY_ID}` if they prefer shell env vars.

   After config is written for the first time, call `pi_academic_status`: on `harness: pi`, restart pi (direct MCP tools are cached at startup, so `zotero_get_recent(limit=1)` stays unavailable for the rest of the current session); on `harness: omp`, run `/mcp reload` instead of restarting.

   If both the tool and binary are NOT_DETECTED: "✗ Not found — install with `pip install zotero-mcp-server`, then configure a `zotero` MCP server in `.mcp.json` or `~/.config/mcp/mcp.json` (see github.com/54yyyu/zotero-mcp)."

2. **NotebookLM** — AI-powered source Q&A, audio overviews, study guides, research discovery.

   > "NotebookLM
   > ──────────
   > Type: MCP server (`notebooklm-mcp`) + `nlm` CLI
   > What: AI-powered source Q&A, audio overviews,
   > study guides, research discovery
   > Status: ✓ Detected
   >
   > Setup (if not installed):
   > uv tool install notebooklm-mcp-cli
   > nlm login
   > add the `notebooklm-mcp` server to `.mcp.json` or global MCP config"

   If `nlm` is installed/authenticated but `notebook_list` is unavailable, offer to add this project `.mcp.json` block after researcher approval; if `.mcp.json` exists, merge only when it is a simple JSON object, otherwise show the block for manual merge:

   ```json
   {
     "settings": { "toolPrefix": "none" },
     "mcpServers": {
       "notebooklm-mcp": {
         "command": "notebooklm-mcp",
         "directTools": [
           "notebook_list",
           "notebook_query",
           "notebook_create",
           "source_add",
           "studio_create",
           "studio_status"
         ]
       }
     }
   }
   ```

3. **Sefaria** — Optional Judaic primary text lookup and verse context expansion.

   > "Sefaria
   > ───────
   > Type: MCP server with bare tools (`get_text`, `search`)
   > What: Biblical/rabbinic text context for source exploration
   > Status: ✓ Detected"

   If selected but unavailable, show the Sefaria MCP server setup guidance for the researcher's chosen server. Require standard MCP config with `settings.toolPrefix: "none"` and `directTools: ["get_text", "search"]`; do not store Sefaria credentials in `.pi-academic/profile.md`.

Wait for the researcher's reply and match it against the option number, label text, or a close paraphrase (multiple selections allowed).

**Rules:**

- Pre-check options that were detected.
- If a tool is not detected and the researcher selects it, show the setup URL and walk them through installation/configuration. For Zotero and NotebookLM, installation/authentication and MCP registration (`.mcp.json`/global MCP config with `toolPrefix: "none"` + `directTools` listing the tools this package calls) are separate checks; complete both before marking either detected.
- For enabled Zotero, call `zotero_get_collections()` and ask whether to use **all library items** or one default collection. If they choose a collection, save `tools.zotero.collection` as `{ "key": "COLLECTION_KEY", "name": "DISPLAY_NAME" }`.
- For enabled NotebookLM, call `notebook_list()` and ask whether to use **all notebooks** or one default notebook. If they choose one, save `tools.notebooklm.notebook` as `{ "id": "NOTEBOOK_ID", "name": "DISPLAY_NAME" }`.
- For enabled Sefaria, save `tools.sefaria` as `{ "enabled": true, "mode": "mcp-config" }`; no scope or credentials are stored.
- Store final selection as the `tools` object (used in Phase 4). Store only enabled/disabled intent, mode labels, and optional collection/notebook identifiers — never credentials.
