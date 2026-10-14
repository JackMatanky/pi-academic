import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Execution harness: standard pi or oh-my-pi (omp).
 */
export type Harness = "pi" | "omp";

/**
 * Detects the active execution harness by probing API features.
 *
 * Oh-my-pi's extension API exposes a `zod` schema builder; pi's does not
 * (omp://extensions.md "Also exposed: pi.zod").
 *
 * @param pi - Extension API instance provided by the harness.
 *
 * @returns "omp" if running under oh-my-pi, otherwise "pi".
 */
export function detectHarness(pi: ExtensionAPI): Harness {
  return "zod" in pi ? "omp" : "pi";
}
