---
name: academic-writer-update-field
description: "Update your field of study in the Academic Writer profile. Use when changing your research field without redoing full setup."
allowed-tools: read write edit academic_writer_get_profile academic_writer_update_profile
metadata: {author: "Yotam Fromm", version: "0.2.23"}
---

# Academic Writer — Update Field of Study

Quick update to your research field without re-running the full initialization.

## Load Current Profile

Call `academic_writer_get_profile`.

If it returns `ok: false`, tell them:
> "No profile found. Run `/skill:academic-writer-init` first."

Store `CURRENT_FIELD` from the returned profile's `fieldOfStudy`.

## Get New Field

Ask the researcher:
> "What's your new field of study and area of specialization?"
>
> (Current: `$CURRENT_FIELD`)

Record their answer.

## Update Profile

Call `academic_writer_update_profile` with `fieldsJson`:

```json
{
  "fieldOfStudy": "NEW_FIELD",
  "updatedAt": "ISO_TIMESTAMP"
}
```

Use the exact answer the researcher gave for `NEW_FIELD`.
## Confirm

Show the updated profile:
> "Done! Your field is now: **[new field]**
>
> Your citation style and writing style remain unchanged.
> Run `/skill:academic-writer-write` anytime to start writing."
