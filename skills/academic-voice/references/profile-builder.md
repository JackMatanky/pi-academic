<!-- Inline replacement for the retired voice-miner subagent; run by the academic-voice skill. -->

# Voice Profile Builder (inline procedure)

Executed inline by the `academic-voice` skill (and its callers: `academic-setup`, `academic-feedback`). No subagent: the skill itself runs the mode below and calls the two scoped write tools directly. Corpus mode writes only `.academic-writer/voice/fingerprint.md`; transcript distillation writes only `.academic-writer/voice/profile.md`. In corpus mode, also return a proposed complete `styleFingerprint` JSON object to the researcher, preserving existing fields and updating evidence from the analyzed corpus. The skill applies it to `.academic-writer/profile.md` only after researcher approval. Never write the profile directly.

## Corpus fingerprint mode

Read the writer's corpus and produce a human-readable markdown fingerprint capturing the
empirical signals of their voice. Do not interview; interview work belongs to the
`academic-voice` skill's interactive sessions.

### Inputs

- `past-articles/**/*.{md,docx,pdf}` (Academic Writer) or `chapters/**/*.md`,
  `manuscript.md` (hebrew-book-producer). Project layout determines path.
- The previous `.academic-writer/voice/fingerprint.md` if present (so you can incrementally update rather than
  overwrite if the corpus has only grown by one or two articles).

### Outputs

Call `academic_writer_write_voice_fingerprint` with the full markdown fingerprint content. In the final response, include the proposed complete `styleFingerprint` object as valid JSON and a concise before/after summary. Do not write to the runtime profile. Never write `.academic-writer/voice/profile.md` in corpus mode; that belongs to the distillation mode.

### Required sections in fingerprint.md

1. **Corpus summary** — N articles, total words, date range, languages detected.
2. **Sentence-length distribution** — mean, median, stdev, max. Note any unusual rhythm.
3. **Paragraph-length distribution** — same stats.
4. **Phrase frequency** — top 30 idiomatic phrases used 3+ times. Hebrew and English separately.
5. **Banned-word candidates** — words/phrases the writer *never* uses where peers do (e.g.,
   "moreover", "furthermore" in academic prose). Detect by comparing to a generic register.
6. **Citation patterns** — typical density (cites per 1000 words), inline vs footnote, common
   framing verbs ("argues", "shows", "מבחין", "טוען").
7. **Structural signals** — typical section count, heading style, intro/conclusion length ratio.
8. **Open questions for Stage 2** — list of things the corpus cannot tell you (refusals, productive
   contradictions, intentional pivots) that the interviewer should probe.

### Hard rules

- Output is markdown, not JSON. The fingerprint is human-readable.
- Quote real examples from the corpus inline (one sentence each, file:line citation).
- If the corpus is below the "needs more data" threshold (call `academic_writer_read_resource` with `name: thresholds` and
  use `voice.corpus`: fewer than `voice.corpus.minArticles` articles, OR fewer than
  `voice.corpus.minTotalWords` total words, OR fewer than `voice.corpus.minWordsPerArticle`
  words/article avg), write a stub fingerprint flagged with `> NEEDS CORPUS`.
- Idempotent: running the mode again on the same corpus produces the same output (modulo timestamp).

### Failure modes

- Empty/unreadable corpus → write stub flagged `> NEEDS CORPUS`; do not error.
- Mixed-language corpus → run analyses per-language and report both; do not merge stats.

## Transcript distillation mode

Compress raw signal (fingerprint + interview transcripts) into the writer's `.academic-writer/voice/profile.md`
profile. Combine the compressor and merger roles.

### Inputs

- `.academic-writer/voice/fingerprint.md`
- `.academic-writer/voice/interview/*.md` (whichever sessions are complete)
- The current `.academic-writer/voice/profile.md` (may be empty template, may be partial profile)
- Optional: a single `--session N` flag, in which case only that session's transcript is folded in
  and other sections are preserved verbatim.

### Outputs

Call `academic_writer_update_author_voice` with the full rewritten content to replace root `.academic-writer/voice/profile.md`. Preserve the four-section structure exactly:

```text
# Voice Profile — <writer name>

> Updated YYYY-MM-DD by <plugin>

## Core voice (cross-project)

## Terminology

## Academic-specific

## Non-fiction-book-specific
```

Update the `> Updated` line to today's date and the calling skill's name.

### Token budget

Target 2,000–5,000 tokens for the entire profile. If you exceed 5,000 after merging, compress
harder using Almaya's test: "if this line disappeared, would the AI write differently?" If no,
cut it. Phrase bank, banned-words list, and decision rules are highest signal; preserve them.

### Compression principles

- Operational over abstract: "first sentence ≤ 12 words on academic openings" beats "concise openings".
- Preserve specific phrases verbatim: phrase bank entries are quoted as-is.
- Productive contradictions: do not resolve. Keep both halves under a `> Tension:` line.
- Hebrew strings are kept Hebrew. Do not transliterate, do not translate.
- Decision rules in English ("never hedge twice in one sentence"), phrase bank in Hebrew, banned
  words in whichever language the writer used.

### Section assignment rules

- A signal that applies regardless of project → Core voice.
- Term/transliteration/citation-format choice → Terminology.
- Citation density, hedging, תקציר conventions, anti-AI thresholds → Academic-specific.
- Chapter rhythm, niqqud, dialogue conventions, Hazal treatment, typesetting → Non-fiction-book-specific.
- When uncertain, prefer Core voice over project-specific.

### Hard rules

- Never invent a rule the corpus or transcripts don't support.
- Never delete a rule from the existing profile that is contradicted only by tone, not by content.
  If a transcript answer changes a rule, replace the rule and keep a one-line `> Was: <old>` note
  for one cycle.
- Idempotent on no-change input: same inputs → same output (modulo timestamp).

### After writing

Emit a single closing block:

```text
<!-- distilled: N transcripts merged, M tokens, YYYY-MM-DD -->
```

on the last line of the file.
