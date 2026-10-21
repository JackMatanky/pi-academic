import assert from "node:assert/strict";

import { test } from "vitest";

import {
  candidateMcpToolNames,
  KNOWN_MCP_SERVERS,
} from "../pi-academic/core/mcp-names.js";

test("KNOWN_MCP_SERVERS includes notebooklm alias", () => {
  assert.ok(KNOWN_MCP_SERVERS.includes("notebooklm"));
  assert.ok(KNOWN_MCP_SERVERS.includes("notebooklm-mcp"));
});

test("candidateMcpToolNames generates candidate names for all known servers", () => {
  const candidates = candidateMcpToolNames("get_text");
  assert.deepEqual(candidates, [
    "mcp__zotero_get_text",
    "mcp__notebooklm_mcp_get_text",
    "mcp__notebooklm_get_text",
    "mcp__sefaria_get_text",
  ]);
});
