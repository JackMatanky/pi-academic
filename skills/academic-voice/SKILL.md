---
name: academic-voice
description: >-
  Manage the researcher voice profile: refresh corpus-derived style patterns, conduct or resume the adversarial interview,
  calibrate, audit, and recompress. Use when adding past articles or refining the writer profile.
allowed-tools: read write edit find grep bash subagent academic_writer_get_profile academic_writer_list_project_files academic_writer_extract_document academic_writer_read_resource academic_writer_write_interview_session academic_writer_write_voice_audit academic_writer_update_author_voice
metadata: {author: "Yotam Fromm", version: "0.2.19"}
---

# Academic voice

Top-level entry to the Stage 2 voice-deepening pipeline. Sub-actions inferred from natural language
or specified explicitly.

## Sub-actions

- `:voice learn` — update the corpus-derived style fingerprint after new past articles are added; read `references/corpus-refresh.md` and run its full confirmation flow. This does not run the interview or overwrite `AUTHOR_VOICE.md`.
- `:voice init` — start the 7-session interview from the current `.voice/fingerprint.md`
- `:voice continue` — resume the next unfinished session (or finish the current one)
- `:voice recompress` — re-distill all transcripts + fingerprint into `AUTHOR_VOICE.md`
- `:voice audit` — run rule-coverage check against the corpus
- `:voice quick` — adaptive short path (skips sessions 4 and 7, caps at 8 questions per session,
  one calibration at end, ~43 prompts total)
- `:voice status` — list completed sessions and last calibration score

## Workflow

Wherever a step below says to dispatch `voice-profile-builder`, read the `dispatch_contract` resource (`academic_writer_read_resource`) for the exact call shape on this harness.

### `:voice init`

1. Read `.voice/fingerprint.md`. If missing or `> NEEDS CORPUS`, tell the user to run `/skill:academic-setup` first and stop.
2. Confirm the user has time for at least one session (~15 questions × ~30s = ~10 min).
3. Read `references/interview-protocol.md` and run session 1 (category `01-beliefs`) yourself, in chat. Do not delegate the interview to a subagent: subagents cannot talk to the researcher.
4. Dispatch `voice-profile-builder` in transcript distillation mode for session 1 (`--session 1`: only that transcript is folded in; other sections preserved).
5. Skip calibration (sessions 1, 2, 4, 5, 6 do NOT calibrate).
6. Ask: "Continue with session 2 (Writing Practices), or stop here? `:voice continue` resumes."

### `:voice continue`

1. Detect the highest completed session by scanning `.voice/interview/` for the completion marker.
2. Run the next session yourself per `references/interview-protocol.md`, then dispatch `voice-profile-builder` (distillation, `--session N`).
3. After session 3, run `references/calibration-protocol.md` yourself.
4. After session 7, run the final calibration yourself, then dispatch `voice-profile-builder` in transcript distillation mode over all completed sessions.

### `:voice recompress`

1. Dispatch `voice-profile-builder` in transcript distillation mode over all completed sessions and the fingerprint.
2. Run the rule-coverage check per `references/calibration-protocol.md` (step 5) and write `.voice/audit.md` with `academic_writer_write_voice_audit`.

### `:voice audit`

1. Read `AUTHOR_VOICE.md` and corpus.
2. For each rule, search corpus for evidence. Write `.voice/audit.md` with `academic_writer_write_voice_audit`: score and flagged rules.
3. If score < `thresholds.json: voice.ruleCoverage.block`, refuse to recompress until the user removes or evidences flagged rules.

### `:voice quick`

1. Same as `:voice init`, but run each session in quick mode (8 questions per session; skip sessions 4 and 7).
2. Stamp `[quick]` in `AUTHOR_VOICE.md` and `.voice/audit.md`.
3. Single calibration at the end (after session 6 in quick numbering, which is the last).
4. Tell the user: "Quick profile created. Run `:voice continue --upgrade` to fill in missed sessions."

### `:voice status`

1. List `.voice/interview/0N-*.md` with their completion marker.
2. Show `.voice/audit.md` head if present.
3. Show the last `> Updated` stamp from `AUTHOR_VOICE.md`.

## Hard rules

- Calibration mode runs ONLY after sessions 3 and 7 (or after final session in quick mode).
- Sessions 1, 2, 4, 5, 6 are followed by `voice-profile-builder` distillation but not by calibration.
- Quick mode is reversible: `:voice continue --upgrade` runs the missed sessions.
