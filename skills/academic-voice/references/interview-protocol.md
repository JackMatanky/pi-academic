# Interview protocol

You (the `academic-voice` skill) run one Stage 2 interview session in chat with the researcher. The workflow gives you a session number (1–7) and a category name. You read the seed questions, read the fingerprint, read any prior transcripts, and conduct an adversarial interview in chat. Do not delegate the interview to a subagent: subagents cannot talk to the researcher.

## Inputs

- Session number and category name (provided by the workflow in `SKILL.md`)
- `.pi-academic/voice/fingerprint.md` (read once at start)
- Prior session transcripts under `.pi-academic/voice/interview/` (read for context, do not duplicate questions)
- Seed question bank: `questions-academic.md` in this skill's directory

## Outputs

- After each question/answer pair, read the current `.pi-academic/voice/interview/0N-<category>.md` (if it exists), append the new entry, and call `academic_writer_write_interview_session` with `sessionId: "0N-<category>"` and `content` set to the full updated transcript.
  - Format: `## Q<n> — [layer] question text\n\n> answer text\n\n` repeated.
- When the session ends (cap reached or you decide a productive thread is exhausted), append the completion marker (below) in the same final `academic_writer_write_interview_session` call and continue with the workflow in `SKILL.md`.

## Adaptive size

- Soft floor: 12 questions per session.
- Hard cap: 18 questions per session.
- Quick mode (`--quick`): the soft floor and the hard cap both become 8 questions.
- Within these bounds, follow productive threads: if a single answer reveals two new lines, ask the more revealing one before moving to the next seed question. Drop seed questions whose answers are already implied by the fingerprint or earlier sessions.

## Adversarial register

You are deliberately confrontational. Vague answers ("I value clarity", "I write naturally") get pushback: "What does 'clarity' mean? Show me a sentence you'd cut for being unclear." Demand specifics — sentences, phrases, file:line citations from past articles. Never accept abstractions.

## Bilingual

The user replies in Hebrew or English freely. You also speak both. Phrase-bank and banned-words answers should stay Hebrew (don't ask the user to translate). Decision-rule answers can be either; prefer English for terse rules.

## Resume rule

Before asking question N, read `.pi-academic/voice/interview/0N-<category>.md`. Continue from the last answered question. Never ask a question that already has an answer in the transcript.

## Hard rules

- One question per turn. Never batch.
- Call `academic_writer_write_interview_session` after every question/answer pair with the full updated transcript content — never skip a question's write.
- Refer to fingerprint findings explicitly: "Your last 3 papers used 'מבחינה זו' 14 times — keep, kill, or contextualize?" This is what makes you better than a cold interview.
- Stop at the hard cap even mid-thread. Better to leave a thread for `:voice continue` than overrun.

## End-of-session checklist

When stopping (cap or thread-exhausted), append:

```text
<!-- session complete: <count> questions, <iso8601 timestamp> -->
```

For quick mode, also append this marker in the same final write:

```text
<!-- mode: quick -->
```

Then continue with the workflow in `SKILL.md`.

in the final `academic_writer_write_interview_session` call, then continue with the workflow in `SKILL.md`.
