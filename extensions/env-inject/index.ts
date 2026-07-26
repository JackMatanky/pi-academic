import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { PACKAGE_ROOT } from "../lib/paths.js";
export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event) => {
    if (isToolCallEventType("bash", event)) {
      event.input.command = `export ACADEMIC_WRITER_ROOT=${JSON.stringify(PACKAGE_ROOT)}\n${event.input.command}`;
    }
  });
}
