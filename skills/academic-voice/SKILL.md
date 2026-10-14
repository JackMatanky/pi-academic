---
name: academic-voice
description: >-
  Manage the researcher voice profile: refresh corpus-derived style patterns, conduct or resume the adversarial interview,
  calibrate, audit, and recompress. Use when adding past articles or refining the writer profile.
allowed-tools: read write edit find grep bash academic_writer_get_profile academic_writer_list_project_files academic_writer_extract_document academic_writer_read_resource academic_writer_write_interview_session academic_writer_write_voice_audit academic_writer_write_voice_fingerprint academic_writer_update_author_voice academic_writer_update_profile
metadata: { author: "Yotam Fromm", version: "0.2.20" }
---

# Academic voice

Top-level entry to the Stage 2 voice-deepening pipeline. Sub-actions inferred from natural language
or specified explicitly.

## Sub-actions

- `:voice learn` — update the corpus-derived style fingerprint after new past articles are added; read `references/corpus-refresh.md` and run its full confirmation flow. This does not run the interview or overwrite `.academic-writer/voice/profile.md`.
- `:voice init` — start the 7-session interview from the current `.academic-writer/voice/fingerprint.md`
- `:voice continue` — resume the next unfinished session (or finish the current one)
- `:voice recompress` — re-distill all transcripts + fingerprint into `.academic-writer/voice/profile.md`
- `:voice audit` — run rule-coverage check against the corpus
- `:voice quick` — short path (sessions 1, 2, 3, 5, and 6 only; 8 questions per session, one final calibration)
- `:voice status` — list completed sessions and last calibration score

## Workflow

Wherever a step below says to distill or fingerprint, execute the matching mode from `references/profile-builder.md` inline (no subagent dispatch; the skill calls the two scoped write tools itself).

### `:voice init`

1. Read `.academic-writer/voice/fingerprint.md`. If missing or `> NEEDS CORPUS`, tell the user to run `/skill:academic-setup` first and stop.
2. Confirm the user has time for at least one session (~15 questions × ~30s = ~10 min).
3. Read `references/interview-protocol.md` and run session 1 (category `01-beliefs`) yourself, in chat. Do not delegate the interview to a subagent: subagents cannot talk to the researcher.
4. Execute the transcript distillation mode from `references/profile-builder.md` inline for session 1 (`--session 1`: only that transcript is folded in; other sections preserved).
5. Skip calibration (sessions 1, 2, 4, 5, 6 do NOT calibrate).
6. Ask: "Continue with session 2 (Writing Practices), or stop here? `:voice continue` resumes."

### `:voice continue`

1. Scan `.academic-writer/voice/interview/` for complete sessions and mode markers. Resume the next unfinished session; do not repeat completed sessions.
2. In full mode, run sessions in order and distill each transcript. Calibrate after session 3 and session 7; after session 7, distill all completed sessions.
3. In quick mode, continue through sessions `[1, 2, 3, 5, 6]` and calibrate only after session 6. `--upgrade` runs the missing full sessions 4 and 7 without repeating completed sessions; after session 7, calibrate and distill all transcripts.

### `:voice recompress`

1. Execute the transcript distillation mode from `references/profile-builder.md` inline over all completed sessions and the fingerprint.
2. Run the rule-coverage check per `references/calibration-protocol.md` (step 5) and write `.academic-writer/voice/audit.md` with `academic_writer_write_voice_audit`.

### `:voice audit`

1. Read `.academic-writer/voice/profile.md` and corpus.
2. For each rule, search corpus for evidence. Write `.academic-writer/voice/audit.md` with `academic_writer_write_voice_audit`: score and flagged rules.
3. If score < `thresholds.json: voice.ruleCoverage.block`, refuse to recompress until the user removes or evidences flagged rules.

### `:voice quick`

1. Run sessions 1, 2, 3, 5, and 6 (8 questions each). Write `<!-- mode: quick -->` beside the completion marker in each transcript.
2. Distill each transcript, stamp `[quick]` in `.academic-writer/voice/profile.md` and `.academic-writer/voice/audit.md`, then calibrate once after session 6 and run a final distillation over all completed sessions.
3. Tell the user: "Quick profile created. Run `:voice continue --upgrade` to complete the full protocol."

### `:voice continue --upgrade`

For quick-mode transcripts, run the missing full sessions 4 and 7 without repeating completed sessions. After session 7, run the final calibration and distill all transcripts; remove `[quick]` only after the full workflow is complete.

### `:voice status`

1. List `.academic-writer/voice/interview/0N-*.md` with their completion marker.
2. Show `.academic-writer/voice/audit.md` head if present.
3. Show the last `> Updated` stamp from `.academic-writer/voice/profile.md`.

## Hard rules

- Calibration runs after full session 3 and session 7; quick mode calibrates only after session 6.
- Quick mode is reversible: `:voice continue --upgrade` adds the omitted full sessions without repeating completed sessions.
- A transcript marked quick remains quick on ordinary `:voice continue`; only `--upgrade` switches its schedule.
