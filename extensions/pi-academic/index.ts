import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { detectHarness } from "../lib/harness.js";
import { registerCoreTools } from "./tools/core.js";
import { registerExportTools } from "./tools/export.js";
import { registerProfileTools } from "./tools/profile.js";
import { registerProseTools } from "./tools/prose.js";
import { registerResearchTools } from "./tools/research.js";
import { registerSourceTools } from "./tools/source.js";
import { registerStyleTools } from "./tools/style.js";
import { registerVoiceTools } from "./tools/voice.js";

/**
 * Registers the package-aware Pi Academic tools for Pi.
 */
export default function piAcademicWriter(pi: ExtensionAPI): void {
  const harness = detectHarness(pi);

  registerCoreTools(pi, harness);
  registerProfileTools(pi);
  registerSourceTools(pi);
  registerExportTools(pi);
  registerResearchTools(pi);
  registerVoiceTools(pi);
  registerProseTools(pi);
  registerStyleTools(pi);
}
