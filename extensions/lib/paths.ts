import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
export const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
