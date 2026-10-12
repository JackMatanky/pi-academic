<!-- Consolidated mode guidance for corpus-refresh.md. -->

# Academic Writer — Learn from New Articles

Trigger the style miner to analyze new articles in `past-articles/` and update the researcher's style fingerprint.

## Load Profile

Call `academic_writer_get_profile`.

If it returns `ok: false`, tell the researcher to run `/skill:academic-setup` first.

Use the returned `styleFingerprint` and `analyzedArticles` list (if present).

### Voice Source Hierarchy

1. **Canonical Runtime Source of Truth**: `.academic-writer/profile.md` (`styleFingerprint` object, updated by this skill).
2. **Optional Prose Overlay**: `.academic-writer/voice/profile.md` in project root.
3. **Intermediate Mining Artifact**: `.academic-writer/voice/fingerprint.md` is NOT runtime source of truth.

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

Read the profile with `academic_writer_get_profile`, then spawn `voice-profile-builder` with:

- The new article filenames and current `.academic-writer/voice/fingerprint.md`
- The existing full `styleFingerprint` object
- `targetLanguage` and the current `analyzedArticles` list

The agent writes only `.academic-writer/voice/fingerprint.md`. It also returns a proposed complete `styleFingerprint` JSON object that preserves existing keys and updates corpus-derived evidence, plus a diff report. The skill—not the agent—updates the runtime profile after researcher approval.

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

Ask the researcher whether to save, review, or discard the changes. Wait for the answer and accept a number, label, or close paraphrase.

If **Save**, call `academic_writer_update_profile` with a structured `fieldsJson` object containing the complete proposed `styleFingerprint` and the merged `analyzedArticles` list. Do not serialize it or use generic file-write tools for the profile.

If **Review details**, show the full before/after for each dimension, then ask again.


## Completion

> "Style fingerprint updated! [N] new article(s) analyzed, [M] dimensions adjusted.
>
> Your writing pipeline will now use the updated fingerprint. Every paragraph will be checked against the new patterns."
