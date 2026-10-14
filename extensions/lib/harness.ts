import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Execution harness: standard pi or oh-my-pi (omp).
 */
export type Harness = "pi" | "omp";

/**
 * Oh-my-pi's extension API exposes a `zod` schema builder; pi's does not
 * (omp://extensions.md "Also exposed: pi.zod").
 */
export function detectHarness(pi: ExtensionAPI): Harness {
  return "zod" in pi ? "omp" : "pi";
}
