---
name: academic-writer-update-tools
description: "Add, remove, or reconfigure integrations (Zotero, NotebookLM). Use when adding/removing integrations after initial setup."
allowed-tools: bash read write edit find grep academic_writer_get_profile academic_writer_update_profile
metadata: {author: "Yotam Fromm", version: "0.2.23"}
---

# Academic Writer — Update Tools

Modify which integrations are enabled without re-running the full initialization.

## Load Current Profile

Call `academic_writer_get_profile`.

If it returns `ok: false`, tell them:
> "No profile found. Run `/skill:academic-writer-init` first."

Use the returned `tools` object. If the profile has no `tools` key (JSON profile), treat all tools as not configured.

## Tool Registry

Run detection for every tool in the registry, regardless of current status:

**1. Zotero** (`zotero`)

Call `zotero_get_recent(limit=1)`; DETECTED if it returns without an error, NOT_DETECTED otherwise. Also check `command -v zotero-mcp` so you can distinguish "server binary missing" from "binary installed but no MCP config / Zotero desktop unavailable." Academic Writer reads Zotero through standard MCP config (`.mcp.json`, `~/.config/mcp/mcp.json`, `.pi/mcp.json`) and expects the `zotero` server to expose bare direct tools (`settings.toolPrefix: "none"` and `mcpServers.zotero.directTools: true`).

**2. NotebookLM** (`notebooklm`)
Call `notebook_list()`; DETECTED if it returns without an error, NOT_DETECTED otherwise. Also check `command -v nlm`, `command -v notebooklm-mcp`, and `nlm login --check` so you can distinguish missing install/auth from missing MCP config.

## Present Current State

Show a table with current status and detection:

> "Here are your current tool integrations:
>
> | # | Tool | Currently | Detected | Scope |
> |---|------|-----------|----------|-------|
> | 1 | Zotero | ✓ Enabled / ✗ Disabled | ✓ / ✗ | collection name/key, or "all library" |
> | 2 | NotebookLM | ✓ Enabled / ✗ Disabled | ✓ / ✗ | notebook name/id, or "all notebooks" |
>
> What would you like to change? You can:
> - **Enable** a tool by number or name (I'll help install if not detected)
> - **Disable** a tool by number or name
> - **Set Zotero collection** — choose one default collection, or clear it to use all library items
> - **Set NotebookLM notebook** — choose one default notebook, or clear it to use all notebooks
> - Say **'done'** when finished"

## Process Changes

For each tool the user wants to **enable**:
1. If not detected, show the setup URL and walk them through installation/configuration
   - Zotero: if `zotero-mcp` is missing, install `zotero-mcp-server`; if the binary exists but tools are unavailable, configure a standard MCP `zotero` server. Offer to scaffold safe local-mode `.mcp.json` only after approval and only when no project `.mcp.json` exists. Never write API keys into project config; use user-global MCP config or command interpolation for web/API credentials.
   - NotebookLM: if `nlm` or `notebooklm-mcp` is missing, install with `uv tool install notebooklm-mcp-cli` and authenticate with `nlm login`; if the CLI is authenticated but tools are unavailable, configure a standard MCP `notebooklm-mcp` server. Offer to scaffold this safe `.mcp.json` block after approval and only when no project `.mcp.json` exists: `{ "settings": { "toolPrefix": "none" }, "mcpServers": { "notebooklm-mcp": { "command": "notebooklm-mcp", "directTools": true } } }`.
2. Re-run the detection command to confirm
3. Only mark as enabled once detected

For **Set Zotero collection**:
1. Require Zotero enabled and detected.
2. Call `zotero_get_collections()` and present "All library" plus the returned collections.
3. Save the selected collection as `tools.zotero.collection = { "key": "COLLECTION_KEY", "name": "DISPLAY_NAME" }`, or remove `collection` for "All library".

For **Set NotebookLM notebook**:
1. Require NotebookLM enabled and detected.
2. Call `notebook_list()` and present "All notebooks" plus the returned notebooks.
3. Save the selected notebook as `tools.notebooklm.notebook = { "id": "NOTEBOOK_ID", "name": "DISPLAY_NAME" }`, or remove `notebook` for "All notebooks".

Store only collection/notebook identifiers and display names. Never store API keys, Zotero library credentials, or NotebookLM auth tokens.

For each tool the user wants to **disable**:
1. Mark it as disabled immediately
2. Warn if it affects existing sources: "Note: disabling Zotero won't delete your indexed sources, but new source management will need to be done manually."

## Save Updated Profile

Call `academic_writer_update_profile` with `fieldsJson`:

```json
{
  "tools": TOOL_CONFIG,
  "updatedAt": "ISO_TIMESTAMP"
}
```

Replace `TOOL_CONFIG` with the actual selections, e.g.:
```json
{
  "zotero": { "enabled": true, "mode": "mcp-config", "collection": { "key": "COLLECTION_KEY", "name": "DISPLAY_NAME" } },
  "notebooklm": { "enabled": true, "mode": "mcp-config", "notebook": { "id": "NOTEBOOK_ID", "name": "DISPLAY_NAME" } }
}
```

## Confirm

> "Done! Your tools are now:
>
> [list each tool with ✓/✗ status and its Zotero collection / NotebookLM notebook scope]
>
> These changes take effect immediately for `/skill:academic-writer-write`.
> If you enabled Zotero and haven't indexed sources yet, run `/skill:academic-writer-init` to add them."
