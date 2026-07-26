import mcpAdapter from "pi-mcp-adapter";

// Academic Writer uses the normal MCP configuration stack instead of owning
// server credentials inside the package:
//
// - ~/.config/mcp/mcp.json / ~/.agents/mcp.json / ~/.agents/mcp/mcp.json
// - .mcp.json
// - .pi/mcp.json
//
// This matters because pi-mcp-adapter's programmatic `config` option is an
// isolated snapshot: it is never merged with file-based MCP config. Using the
// default adapter lets researchers reuse an existing Zotero/NotebookLM/Sefaria
// MCP setup, store secrets in their preferred MCP layer, and keep Academic
// Writer's own `.academic-helper/profile.md` free of credentials.
//
// Skills and agents call Zotero tools by their bare names
// (`zotero_get_item_fulltext`, `zotero_get_recent`, ...), so setup/health docs
// require any project/global MCP config that declares a `zotero` server to set:
//   settings.toolPrefix = "none"
//   mcpServers.zotero.directTools = true
//
// Model choice (including running any agent on Gemini or another provider)
// is a pi setting, not something this package brokers — see AGENTS.md.
export const mcpExtension = mcpAdapter;
