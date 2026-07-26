import { createMcpAdapter } from "pi-mcp-adapter";
import { GEMINI_SERVER_ENTRY } from "../lib/paths.js";

// Single combined adapter instance for both MCP servers this package depends on:
// - `zotero`: the researcher's reference library.
// - `gemini-api`: the bundled prose-drafting engine (mcp/gemini-server).
//
// Both are registered programmatically (not via `.mcp.json`) because:
// 1. `gemini-api`'s `args` need an absolute path only known at runtime
//    (GEMINI_SERVER_ENTRY, resolved via import.meta.url in lib/paths.ts).
// 2. A programmatic `config` is an isolated snapshot — it is never merged
//    with `.mcp.json` — so both servers must live in the same call to be
//    visible together. See pi-mcp-adapter README "Use createMcpAdapter when
//    an SDK or server integration already owns its MCP configuration".
//
// `directTools: true` on each server makes their tools first-class (callable
// by bare name, e.g. `zotero_get_item_fulltext`, `gemini_write_section`)
// instead of hidden behind the generic `mcp` proxy tool — every skill/agent
// in this package calls tools by bare name. `toolPrefix: "none"` is required
// alongside it: the default "server" prefix mode double-prefixes tool names
// that already start with the server name (e.g. `zotero_zotero_get_recent`).
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
      "gemini-api": {
        command: "node",
        args: [GEMINI_SERVER_ENTRY],
        env: { GOOGLE_API_KEY: "${GOOGLE_API_KEY}" },
        directTools: true,
      },
    },
  },
});
