import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
export const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const GEMINI_SERVER_ENTRY = join(PACKAGE_ROOT, "mcp", "gemini-server", "dist", "index.js");
