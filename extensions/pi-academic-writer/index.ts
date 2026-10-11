import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCoreTools } from "./tools/core-tools.js";
import { registerExportTools } from "./tools/export-tools.js";
import { registerProfileTools } from "./tools/profile-tools.js";
import { registerResearchTools } from "./tools/research-tools.js";
import { registerSourceTools } from "./tools/source-tools.js";
import { registerVoiceTools } from "./tools/voice-tools.js";

/** Registers the package-aware Academic Writer tools for Pi. */
export default function piAcademicWriter(pi: ExtensionAPI): void {
  registerCoreTools(pi);
  registerProfileTools(pi);
  registerSourceTools(pi);
  registerExportTools(pi);
  registerResearchTools(pi);
  registerVoiceTools(pi);
}
