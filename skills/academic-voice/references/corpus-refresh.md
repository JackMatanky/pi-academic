<!-- Consolidated mode guidance for corpus-refresh.md. -->

# Academic Writer — Learn from New Articles

Trigger the style miner to analyze new articles in `past-articles/` and update the researcher's style fingerprint.

## Load Profile

Call `academic_writer_get_profile`.

If it returns `ok: false`, tell the researcher to run `/skill:academic-setup` first.

Use the returned `styleFingerprint` and `analyzedArticles` list (if present).

### Voice Source Hierarchy

1. **Canonical Runtime Source of Truth**: `.academic-writer/profile.md` (`styleFingerprint` object, updated by this skill).
2. **Optional Prose Overlay**: `AUTHOR_VOICE.md` in project root.
3. **Intermediate Mining Artifact**: `.voice/fingerprint.md` is NOT runtime source of truth.

## Step 1: Scan for New Articles

Call `academic_writer_list_project_files` with `kind: "past_articles"` and compare the returned filenames against `profile.analyzedArticles` (array of filenames already analyzed). Identify new files not yet processed.

If no new files found:
> "No new articles found in `past-articles/`. Add new papers (PDF or DOCX) and run `/skill:academic-voice` again."

If new files found, show them:
> "Found [N] new article(s) to analyze:
>
> 1. [filename]
> 2. [filename]
>
> I'll extract style patterns from these and merge them into your existing fingerprint."

## Step 2: Spawn Style Miner

**Use your subagent-dispatch tool to spawn the `voice-profile-builder` subagent.** Pass:

- List of new article filenames
- Current `styleFingerprint` from the profile
- `targetLanguage`

The style miner returns:

- Updated fingerprint dimensions
- New representative excerpts
- Statistics (sentence lengths, transition patterns, vocabulary patterns, linking word usage)
- A diff report showing what changed

## Step 3: Present Diff Report

Show the researcher what changed:

```text
╔══════════════════════════════════════════════════╗
║           STYLE FINGERPRINT UPDATE               ║
╠══════════════════════════════════════════════════╣
║                                                  ║
║  Articles analyzed: [N] new + [M] previous       ║
║                                                  ║
║  Changes detected:                               ║
║                                                  ║
║  Sentence length:  18.5 → 19.2 words (avg)       ║
║  Passive voice:    moderate → moderate-high       ║
║  Vocabulary:       complex (unchanged)            ║
║  New openers:      +2 patterns detected           ║
║  New transitions:  +3 phrases added               ║
║  New excerpts:     +2 representative samples      ║
║                                                  ║
╚══════════════════════════════════════════════════╝
```

## Step 4: Confirm and Save

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "Would you like to save these updates to your style fingerprint?"
>
> 1. **Save updates** — Merge the new patterns into your profile.
> 2. **Review details first** — Show me the full before/after comparison.
> 3. **Discard** — Keep the current fingerprint unchanged.
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

If **Save**, update the profile:

1. Merge the updated `styleFingerprint` into `.academic-writer/profile.md`
2. Add the new filenames to `analyzedArticles` array
3. Update `updatedAt` timestamp

Use the `Write` tool to save the updated profile.

If **Review details**, show the full before/after for each dimension, then ask again.

## Completion

> "Style fingerprint updated! [N] new article(s) analyzed, [M] dimensions adjusted.
>
> Your writing pipeline will now use the updated fingerprint. Every paragraph will be checked against the new patterns."
