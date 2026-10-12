import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { Type } from "typebox";

import { writeProjectTextFile } from "../project-files.js";
import { fail, registerTool } from "../tool-kit.js";

/**
 * Scoped writers: each tool's destination is fixed, so agents limited to one
 * artifact never need a generic write/edit grant.
 */
export function registerVoiceTools(pi: ExtensionAPI): void {
  registerTool(pi, {
    name: "academic_writer_write_voice_audit",
    label: "Academic Writer Write Voice Audit",
    description:
      "Write .voice/audit.md. The voice-facilitator agent's only path to persist its calibration report without a generic write grant.",
    parameters: Type.Object({
      content: Type.String({
        description: "Full audit report markdown content.",
      }),
    }),
    run: ({ content }, { cwd }) => {
      const result = writeProjectTextFile(cwd, ".voice/audit.md", content);

      return { text: `Voice audit written: ${result.path}`, details: result };
    },
  });

  registerTool(pi, {
    name: "academic_writer_update_author_voice",
    label: "Academic Writer Update Author Voice",
    description:
      "Overwrite AUTHOR_VOICE.md with the given content. Used by voice-facilitator and voice-profile-builder instead of a generic write/edit grant.",
    parameters: Type.Object({
      content: Type.String({ description: "Full AUTHOR_VOICE.md content." }),
    }),
    run: ({ content }, { cwd }) => {
      const result = writeProjectTextFile(cwd, "AUTHOR_VOICE.md", content);

      return {
        text: `AUTHOR_VOICE.md updated: ${result.path}`,
        details: result,
      };
    },
  });

  registerTool(pi, {
    name: "academic_writer_write_interview_session",
    label: "Academic Writer Write Interview Session",
    description:
      "Write .voice/interview/<sessionId>.md. The voice-facilitator agent's only path to persist a session transcript without a generic write grant. sessionId must match ^[a-zA-Z0-9_-]+$.",
    parameters: Type.Object({
      sessionId: Type.String({
        minLength: 1,
        description: "Session identifier, e.g. session-3.",
      }),
      content: Type.String({
        description: "Full session transcript markdown content.",
      }),
    }),
    run: ({ sessionId, content }, { cwd }) => {
      if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
        return fail(
          "Interview session write failed: sessionId must match ^[a-zA-Z0-9_-]+$",
          { ok: false },
        );
      }

      const result = writeProjectTextFile(
        cwd,
        `.voice/interview/${sessionId}.md`,
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
    label: "Academic Writer Write Voice Fingerprint",
    description:
      "Write .voice/fingerprint.md. The voice-profile-builder agent's only path to persist its style fingerprint without a generic write grant.",
    parameters: Type.Object({
      content: Type.String({
        description: "Full fingerprint markdown content.",
      }),
    }),
    run: ({ content }, { cwd }) => {
      const result = writeProjectTextFile(
        cwd,
        ".voice/fingerprint.md",
        content,
      );

      return {
        text: `Voice fingerprint written: ${result.path}`,
        details: result,
      };
    },
  });
}
