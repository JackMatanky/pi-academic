/**
 * Known MCP server config keys this package's skills/agents scaffold into
 * `.mcp.json`.
 */
export const KNOWN_MCP_SERVERS = [
  "zotero",
  "notebooklm-mcp",
  "notebooklm",
  "sefaria",
];

/**
 * Sanitizes one MCP server/tool name part per oh-my-pi's tool-bridge naming
 * algorithm.
 *
 * @param value - Raw server or tool name part to sanitize.
 */
function sanitizeMcpNamePart(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  return cleaned || "part";
}

/**
 * Builds candidate oh-my-pi MCP tool names for a bare logical tool name across
 * known servers.
 *
 * @param logicalName - Bare MCP tool name as documented in this package's
 *   skills/agents.
 */
export function candidateMcpToolNames(logicalName: string): string[] {
  return KNOWN_MCP_SERVERS.map((server) => {
    const sanitizedServer = sanitizeMcpNamePart(server);
    const sanitizedTool = sanitizeMcpNamePart(logicalName);
    const prefix = `${sanitizedServer}_`;

    const suffix = sanitizedTool.startsWith(prefix)
      ? sanitizedTool.slice(prefix.length)
      : sanitizedTool;

    return `mcp__${sanitizedServer}_${suffix}`;
  });
}
