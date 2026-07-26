---
name: academic-writer-voice
description: Stage 2 of the voice subsystem. Run `:voice` to start a 7-session adversarial interview seeded by the past-articles fingerprint. Sub-actions for continue, recompress, audit, quick mode, and status. Use when the user wants to deepen their voice profile beyond what the corpus reveals.
allowed-tools: read write edit glob grep bash subagent
metadata: {author: "Yotam Fromm", version: "0.2.19"}
---

# voice

Top-level entry to the Stage 2 voice-deepening pipeline. Sub-actions inferred from natural language
or specified explicitly.

## Sub-actions

- `:voice init` — start the 7-session interview from the current `.voice/fingerprint.md`
- `:voice continue` — resume the next unfinished session (or finish the current one)
- `:voice recompress` — re-distill all transcripts + fingerprint into `AUTHOR_VOICE.md`
- `:voice audit` — run rule-coverage check against the corpus
- `:voice quick` — adaptive short path (skips sessions 4 and 7, caps at 8 questions per session,
  one calibration at end, ~43 prompts total)

- `:voice status` — list completed sessions and last calibration score

## Workflow

### `:voice init`
1. Read `.voice/fingerprint.md`. If missing or `> NEEDS CORPUS`,
   tell the user to run `/skill:academic-writer-init` first and stop.
2. Confirm the user has time for at least one session (~15 questions × ~30s = ~10 min).
3. Invoke `voice-interviewer` agent with category `01-beliefs`. Wait for `<!-- session complete -->`.
4. Run `voice-distiller --session 1` to fold the transcript into `AUTHOR_VOICE.md`.
5. Skip calibration (sessions 1, 2, 4, 5, 6 do NOT calibrate).
7. Ask: "Continue with session 2 (Writing Practices), or stop here? `:voice continue` resumes."

### `:voice continue`
1. Detect highest completed session by scanning `.voice/interview/`.
2. Invoke `voice-interviewer` for next session.
3. After session 3, run `voice-calibrator` (sample paragraph + 3 questions + patch + rule-coverage).
4. After session 7, run `voice-calibrator` (final), then `voice-distiller --recompress` (full pass).

### `:voice recompress`
1. Run `voice-distiller --recompress` (full pass, all transcripts + fingerprint).
2. Run rule-coverage check inline; write `.voice/audit.md`.

### `:voice audit`
1. Read `AUTHOR_VOICE.md` and corpus.
2. For each rule, search corpus for evidence. Write `.voice/audit.md` with score and flagged rules.
3. If score < `thresholds.json: voice.ruleCoverage.block`, refuse to recompress until user removes or evidences flagged rules.

### `:voice quick`
1. Same as `:voice init`, but pass `--quick` to interviewer (cap 8 questions/session, skip sessions
   4 and 7).
2. Stamp `[quick]` marker in `AUTHOR_VOICE.md` and `.voice/audit.md`.
3. Single calibration at the end (after session 6 in quick numbering, which is the last).
4. Tell user: "Quick profile created. Run `:voice continue --upgrade` to fill in missed sessions."


### `:voice status`
1. List `.voice/interview/0N-*.md` with completion markers.
2. Show `.voice/audit.md` head if present.
3. Show last `> Updated` stamp from `AUTHOR_VOICE.md`.

## Hard rules

- Calibrator runs ONLY after sessions 3 and 7 (or after final session in quick mode).
- Sessions 1, 2, 4, 5, 6 invoke distiller but NOT calibrator.
- Quick mode is reversible: `:voice continue --upgrade` runs the missed sessions.
