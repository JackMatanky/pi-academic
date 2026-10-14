import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { Type } from "typebox";

import { writeProjectTextFile } from "../core/project-files.js";
import { registerTool } from "../core/tool-kit.js";

/**
 * Registers scoped voice writer tools (audit, author voice, interview, and
 * fingerprint).
 *
 * @param pi - Pi extension API used to register tools.
 */
export function registerVoiceTools(pi: ExtensionAPI): void {
  registerTool(pi, {
    name: "academic_writer_write_voice_audit",
    effect: "write",
    label: "Academic Writer Write Voice Audit",
    description:
      "Write .academic-writer/voice/audit.md. The academic-voice skill's path to persist its calibration report without a generic write grant.",
    parameters: Type.Object({
      content: Type.String({
        description: "Full audit report markdown content.",
      }),
    }),
    run: ({ content }, { cwd }) => {
      const result = writeProjectTextFile(
        cwd,
        ".academic-writer/voice/audit.md",
        content,
      );

      return { text: `Voice audit written: ${result.path}`, details: result };
    },
  });

  registerTool(pi, {
    name: "academic_writer_update_author_voice",
    effect: "write",
    label: "Academic Writer Update Author Voice",
    description:
      "Overwrite .academic-writer/voice/profile.md with the given content. Used by the academic-voice skill instead of a generic write/edit grant.",
    parameters: Type.Object({
      content: Type.String({ description: "Full voice profile content." }),
    }),
    run: ({ content }, { cwd }) => {
      const result = writeProjectTextFile(
        cwd,
        ".academic-writer/voice/profile.md",
        content,
      );

      return {
        text: `Voice profile updated: ${result.path}`,
        details: result,
      };
    },
  });

  registerTool(pi, {
    name: "academic_writer_write_interview_session",
    effect: "write",
    label: "Academic Writer Write Interview Session",
    description:
      "Write .academic-writer/voice/interview/<sessionId>.md. The academic-voice skill's path to persist a session transcript without a generic write grant. sessionId must match ^[a-zA-Z0-9_-]+$.",
    parameters: Type.Object({
      sessionId: Type.String({
        minLength: 1,
        pattern: "^[a-zA-Z0-9_-]+$",
        description: "Session identifier, e.g. session-3.",
      }),
      content: Type.String({
        description: "Full session transcript markdown content.",
      }),
    }),
    run: ({ sessionId, content }, { cwd }) => {
      const result = writeProjectTextFile(
        cwd,
        `.academic-writer/voice/interview/${sessionId}.md`,
        content,
      );

      return {
        text: `Interview session written: ${result.path}`,
        details: result,
      };
    },
  });

  registerTool(pi, {
    name: "academic_writer_write_voice_fingerprint",
    effect: "write",
    label: "Academic Writer Write Voice Fingerprint",
    description:
      "Write .academic-writer/voice/fingerprint.md. The academic-voice skill's only path to persist its style fingerprint without a generic write grant.",
    parameters: Type.Object({
      content: Type.String({
        description: "Full fingerprint markdown content.",
      }),
    }),
    run: ({ content }, { cwd }) => {
      const result = writeProjectTextFile(
        cwd,
        ".academic-writer/voice/fingerprint.md",
        content,
      );

      return {
        text: `Voice fingerprint written: ${result.path}`,
        details: result,
      };
    },
  });
}
