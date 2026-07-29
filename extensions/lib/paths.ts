import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Absolute package root, derived from the compiled extension location.
 *
 * @remarks
 * Kept as a single module-level constant so callers do not duplicate package paths or option lists.
 */
export const PACKAGE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
