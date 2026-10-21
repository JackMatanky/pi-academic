import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { Type } from "typebox";

import { stringEnum } from "../../lib/schema.js";
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
    name: "academic_writer_write_voice_artifact",
    effect: "write",
    label: "Academic Writer Write Voice Artifact",
    description:
      "Persist voice calibration artifacts (audit, profile, fingerprint, interview). Destination is strictly bound to .pi-academic/voice/.",
    parameters: Type.Object({
      artifact: stringEnum(
        ["audit", "profile", "fingerprint", "interview"] as const,
        {
          description: "Voice artifact type to persist.",
        },
      ),
      sessionId: Type.Optional(
        Type.String({
          pattern: "^[a-zA-Z0-9_-]+$",
          description: "Session identifier (required for interview artifact).",
        }),
      ),
      content: Type.String({
        minLength: 1,
        description: "Markdown text content.",
      }),
    }),
    run: ({ artifact, sessionId, content }, { cwd }) => {
      const paths = {
        audit: ".pi-academic/voice/audit.md",
        profile: ".pi-academic/voice/profile.md",
        fingerprint: ".pi-academic/voice/fingerprint.md",
        interview: `.pi-academic/voice/interview/${sessionId ?? "session"}.md`,
      };

      const result = writeProjectTextFile(cwd, paths[artifact], content);

      return {
        text: `Voice artifact written: ${result.path}`,
        details: result,
      };
    },
  });

  registerTool(pi, {
    name: "academic_writer_write_voice_audit",
    effect: "write",
    label: "Academic Writer Write Voice Audit",
    description:
      "Write .pi-academic/voice/audit.md. The academic-voice skill's path to persist its calibration report without a generic write grant.",
    parameters: Type.Object({
      content: Type.String({
        description: "Full audit report markdown content.",
      }),
    }),
    run: ({ content }, { cwd }) => {
      const result = writeProjectTextFile(
        cwd,
        ".pi-academic/voice/audit.md",
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
      "Overwrite .pi-academic/voice/profile.md with the given content. Used by the academic-voice skill instead of a generic write/edit grant.",
    parameters: Type.Object({
      content: Type.String({ description: "Full voice profile content." }),
    }),
    run: ({ content }, { cwd }) => {
      const result = writeProjectTextFile(
        cwd,
        ".pi-academic/voice/profile.md",
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
      "Write .pi-academic/voice/interview/<sessionId>.md. The academic-voice skill's path to persist a session transcript without a generic write grant. sessionId must match ^[a-zA-Z0-9_-]+$.",
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
        `.pi-academic/voice/interview/${sessionId}.md`,
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
      "Write .pi-academic/voice/fingerprint.md. The academic-voice skill's only path to persist its style fingerprint without a generic write grant.",
    parameters: Type.Object({
      content: Type.String({
        description: "Full fingerprint markdown content.",
      }),
    }),
    run: ({ content }, { cwd }) => {
      const result = writeProjectTextFile(
        cwd,
        ".pi-academic/voice/fingerprint.md",
        content,
      );

      return {
        text: `Voice fingerprint written: ${result.path}`,
        details: result,
      };
    },
  });
}
