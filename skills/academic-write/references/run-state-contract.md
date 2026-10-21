# Run State Contract

Use this only after `.pi-academic/profile.md` exists. `init`/`setup` remain the only workflows that create `.pi-academic/` from scratch.

## File

`.pi-academic/runs/<run-id>.json`

`run-id` should be timestamp-based and filesystem-safe, for example `2026-07-28T10-15-30-write-article-slug`.

## Status values

- `planned`
- `running`
- `blocked`
- `failed`
- `complete`

## Phase values

- `profile`
- `source-selection`
- `deep-read`
- `thesis`
- `outline`
- `section-writing`
- `synthesis`
- `review`
- `export`

## Minimum JSON

```json
{
  "runId": "2026-07-28T10-15-30-write-article-slug",
  "kind": "write",
  "title": "Article title or subject",
  "status": "running",
  "phase": "profile",
  "articlePath": "articles/slug.md",
  "docxPath": "articles/slug.docx",
  "citationStyle": "inline-parenthetical",
  "startedAt": "2026-07-28T10:15:30.000Z",
  "updatedAt": "2026-07-28T10:15:30.000Z",
  "sections": [],
  "paragraphAudits": []
}
```

Update the same file after each major phase. Set `status: complete` only after the requested output exists and citation audit has passed. Set `status: failed` with an `error` field when a deterministic gate blocks completion. Set `status: blocked` with a `blockedReason` field when waiting on the researcher.
