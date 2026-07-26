import { createMcpAdapter } from "pi-mcp-adapter";

// Registers the `zotero` MCP server — the researcher's reference library.
//
// Registered programmatically (not via `.mcp.json`) because a programmatic
// `config` is an isolated snapshot — it is never merged with file-based
// config — so this is the one place the server is ever declared. See
// pi-mcp-adapter README "Use createMcpAdapter when an SDK or server
// integration already owns its MCP configuration".
//
// `directTools: true` makes its tools first-class (callable by bare name,
// e.g. `zotero_get_item_fulltext`) instead of hidden behind the generic
// `mcp` proxy tool — every skill/agent in this package calls tools by bare
// name. `toolPrefix: "none"` is required alongside it: the default "server"
// prefix mode double-prefixes tool names that already start with the server
// name (e.g. `zotero_zotero_get_recent`).
//
// Model choice (including running any agent on Gemini or another provider)
// is a pi setting, not something this package brokers — see AGENTS.md.
export const mcpExtension = createMcpAdapter({
  config: {
    settings: {
      toolPrefix: "none",
    },
    mcpServers: {
      zotero: {
        command: "zotero-mcp",
        env: {
          ZOTERO_LOCAL: "true",
          ZOTERO_API_KEY: "${ZOTERO_API_KEY}",
          ZOTERO_LIBRARY_ID: "${ZOTERO_LIBRARY_ID}",
        },
        directTools: true,
      },
    },
  },
});
