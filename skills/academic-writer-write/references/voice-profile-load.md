# Voice Profile Load Contract

## Voice Source Hierarchy (Strict Priority)

1. **Canonical Runtime Source of Truth**: `.academic-writer/profile.md` (`styleFingerprint` JSON object). Loaded by all writing, editing, and auditing agents. All quantitative and qualitative style dimensions come from this fingerprint.
2. **Optional Prose Overlay**: `AUTHOR_VOICE.md` in project root. Read at the start of every write/edit run via `academic_writer_read_resource` (`name: voice_profile_load`) and passed into `section-writer` system prompts. Provides human guidance. When `AUTHOR_VOICE.md` conflicts with `styleFingerprint`, `styleFingerprint` rules take precedence unless explicitly overridden by researcher instructions.
3. **Intermediate Mining Artifact**: `.voice/fingerprint.md` is an intermediate output from past mining workflows. It is **NOT** a runtime source of truth. Agents MUST NOT read or use `.voice/fingerprint.md` for runtime style checks.

## Execution Rules

1. Read `AUTHOR_VOICE.md` from project root at the start of every write/edit run.
2. Pass the whole file into every `section-writer` prompt alongside the canonical `styleFingerprint` loaded from `.academic-writer/profile.md`.
3. Tell the section writer to weight `## Academic-specific` rules higher when they conflict with `## Core voice`; everything else applies as written.
4. If `AUTHOR_VOICE.md` is missing or empty, warn once: "No voice profile overlay. Using canonical profile fingerprint from `/skill:academic-writer-init`." Do not block writing.
