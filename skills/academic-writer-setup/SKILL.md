---
name: academic-writer-setup
description: "First-time setup for Academic Writer — creates researcher profile, detects integrations, analyzes writing style from past articles. Use for a quick onboarding (faster than init); does not include source indexing."
allowed-tools: bash read write glob grep gemini_raw
metadata: {author: "Yotam Fromm", version: "0.2.19"}
---

# Academic Writer Setup

> **Do NOT use this skill** for source indexing or full style fingerprinting — use `/skill:academic-writer-init` instead. This is the *quick* setup; init is the deep setup.

Quick onboarding wizard. Creates the researcher profile, detects integrations, and optionally fingerprints writing style. For deeper initialization (full 25-dimension style analysis, source indexing), run `/skill:academic-writer-init`.

## Phase 0: Preflight

Run silently before anything else:

```bash
mkdir -p past-articles .academic-helper .academic-helper/logs && cp -n ""$ACADEMIC_WRITER_ROOT"/thresholds.json" .academic-helper/ 2>/dev/null || true
```

Migrate any legacy profile from `.academic-writer/profile.json` → `.academic-helper/profile.md`:

```bash
python3 << 'PYTHON'
import os, json, re
from datetime import datetime

old_path = '.academic-writer/profile.json'
new_path = '.academic-helper/profile.md'
if os.path.exists(old_path) and not os.path.exists(new_path):
    with open(old_path) as f:
        p = json.load(f)
    scalar_keys = ['fieldOfStudy', 'citationStyle', 'targetLanguage', 'updatedAt', 'createdAt']
    list_keys = ['abstractLanguages', 'analyzedArticles']
    json_sections = [
        ('tools', 'Tools'), ('outputFormatPreferences', 'Output Format Preferences'),
        ('styleFingerprint', 'Style Fingerprint'), ('articleStructure', 'Article Structure'),
        ('sources', 'Sources'),
    ]
    lines = ['# Academic Writer Profile', '', '---']
    for k in scalar_keys:
        if k in p and p[k] is not None:
            lines.append(f'{k}: {p[k]}')
    for k in list_keys:
        v = p.get(k) or []
        if not v:
            lines.append(f'{k}: []')
        else:
            lines.append(f'{k}:')
            for item in v:
                lines.append(f'  - {item}')
    lines.append('---')
    lines.append('')
    for k, heading in json_sections:
        if k in p and p[k] is not None:
            lines.extend([f'## {heading}', '', '```json',
                          json.dumps(p[k], indent=2, ensure_ascii=False), '```', ''])
    os.makedirs('.academic-helper', exist_ok=True)
    with open(new_path, 'w') as f:
        f.write('\n'.join(lines))
    print(f"Migrated profile to {new_path}")
PYTHON
```

Check for existing profile:
```bash
cat .academic-helper/profile.md 2>/dev/null && echo "EXISTS" || echo "NOT_FOUND"
```

If EXISTS, load and show current settings, then:

Ask the researcher directly in chat (present as a numbered/lettered list):\nUpdate Mode\n───────────\n✓ Existing settings preserved\n→ Only re-run steps you choose\n```"
    },
    {
      "label": "Start fresh",
      "description": "Delete and recreate from scratch.",
      "markdown": "```\nFresh Start\n───────────\n⚠ Current profile will be replaced\n→ Walk through all steps again\n```"
    }
  ],
  "multiSelect": false
}])
```

---

## Phase 1: Detect Integrations

Run ALL detection commands in **one parallel batch**:

- **Zotero**: call `zotero_get_recent(limit=1)`; DETECTED if it returns without an error, NOT_DETECTED otherwise.
- **NotebookLM**:
```python
Bash(command="command -v nlm >/dev/null 2>&1 && nlm login --check 2>/dev/null && echo 'notebooklm: DETECTED' || echo 'notebooklm: NOT_FOUND'")
```

MongoDB Agent Skills is auto-configured silently — do not show it to the user.

---

## Phase 2: Profile Setup

### Field of Study

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "What is your field of study and area of specialization?"
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

> "The more specific, the better. Examples: *Early Modern Jewish Philosophy*, *Talmudic Literature*, *Biblical Studies — Pentateuch*"

### Article Language

Ask the researcher directly in chat (present as a numbered/lettered list):\nHebrew Mode\n───────────\nDirection:  RTL\nFont:       David 11pt\nCitations:  (מחבר, כותרת, עמ' N)\n```"
    },
    {
      "label": "English",
      "description": "LTR, Times New Roman, Chicago/MLA/APA.",
      "markdown": "```\nEnglish Mode\n────────────\nDirection:  LTR\nFont:       Times New Roman 12pt\n```"
    },
    {
      "label": "Other",
      "description": "You'll type the language name in the next prompt.",
      "markdown": "```\nOther\n─────\n→ Type the language name\n→ RTL/LTR auto-detected\n```"
    }
  ],
  "multiSelect": false
}])
```

### Citation Style

Ask the researcher directly in chat (present as a numbered/lettered list):\nExample: (לוי, משנת הנפש, עמ' 42)\n```"
    },
    {
      "label": "Chicago / Turabian",
      "description": "Footnotes with full bibliography.",
      "markdown": "```\nExample footnote: ¹ Levy, Soul's Teaching, 42.\n```"
    },
    {
      "label": "MLA",
      "description": "Parenthetical with Works Cited.",
      "markdown": "```\nExample: (Levy 42)\n```"
    },
    {
      "label": "APA",
      "description": "(Author, Year) — more common in social sciences.",
      "markdown": "```\nExample: (Levy, 2019, p. 42)\n```"
    }
  ],
  "multiSelect": false
}])
```

### Tool Selection

Ask the researcher directly in chat (present as a numbered/lettered list):\nZotero\n──────────\nType:  CLI (ck)\nWhat:  Cloud document library\n```"
    },
    {
      "label": "NotebookLM",
      "description": "✓ Detected  /  ✗ Not found",
      "markdown": "```\nNotebookLM\n──────────\nType:  MCP server (nlm CLI)\nWhat:  AI-powered source Q&A,\n       audio overviews, study guides\n\nInstall: npm install -g notebooklm-mcp-cli\nAuth:    nlm login\n```"
    }
  ],
  "multiSelect": true
}])
```

Pre-check tools that were detected. MongoDB Agent Skills is silently included always.

---

## Phase 3: Style Fingerprint (Optional)

Check for past articles:

```bash
ls past-articles/ 2>/dev/null | wc -l
Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "Found N papers in past-articles/. Analyze them for style fingerprinting?"
> 1. **Yes, analyze my writing style (Recommended)** — Extracts your voice across 25 dimensions so articles sound like you.
>    ```
>    Style Analysis
>    ──────────────
>    → Reads PDF and DOCX in past-articles/
>    → Analyzes 25 dimensions:
>       sentence patterns, vocabulary,
>       paragraph structure, transitions,
>       citation density, rhetorical moves
>    → Shows fingerprint before saving
>    → You can correct anything
>    ```
> 2. **Skip for now** — Articles will use generic academic style until you run this.
>    ```
>    Skip
>    ────
>    ⚠ No style fingerprint yet
>    → Add papers to past-articles/ anytime
>    → Re-run: /skill:academic-writer-init
>    ```
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).
```

If no files found, show only the "Skip" option with instructions to add papers.

If "Yes": analyze across all 25 dimensions (sentence level, vocabulary, paragraph structure, tone, transitions, citation style, rhetorical patterns, representative excerpts, article structure). Show fingerprint summary and confirm before saving.

---

## Phase 3.5: Gemini Onboarding

Ask the researcher whether to enable Gemini as the prose writer for `/skill:academic-writer-write`, `/skill:academic-writer-edit`, and `/skill:academic-writer-edit-section`. Claude remains the orchestrator and citation auditor either way.

Ask the researcher directly in chat (present as a numbered/lettered list):\nGemini ON\n─────────\n→ Faster, lower-cost drafting\n→ Per-language calibration gate runs\n   on first /skill:academic-writer-write in each language\n→ Auditor still runs on Claude\n```"
    },
    {
      "label": "No, Claude only",
      "description": "Today's behavior — Claude writes and reviews everything.",
      "markdown": "```\nClaude only\n───────────\n→ No external API needed\n→ You can enable Gemini later via setup\n```"
    }
  ],
  "multiSelect": false
}])
```

### If "No, Claude only"

Skip the rest of this phase. Note in summary that Gemini is disabled.

### If "Yes, enable Gemini"

#### Step 3.5.a — Check for existing key

```bash
if [ -n "$GOOGLE_API_KEY" ]; then
  echo "Found GOOGLE_API_KEY in environment."
elif [ -f .academic-helper/secrets.json ] && python3 -c "import json,sys; sys.exit(0 if json.load(open('.academic-helper/secrets.json')).get('GOOGLE_API_KEY') else 1)" 2>/dev/null; then
  echo "Found GOOGLE_API_KEY in .academic-helper/secrets.json."
else
  echo "NO_KEY"
fi
```

#### Step 3.5.b — If NO_KEY, walk through key creation

> "To get a Google AI Studio API key:
> 1. Open https://aistudio.google.com/apikey in your browser
> 2. Sign in with a Google account
> 3. Click 'Create API key' — copy the key (it begins with `AIza...`)
> 4. Free tier covers typical academic-writer usage."

Ask how to store the key:

Ask the researcher directly in chat (present as a numbered/lettered list):\nexport GOOGLE_API_KEY=\"AIza...\"\n# add to ~/.zshrc or ~/.bashrc\n```"
    },
    {
      "label": "Project-local secrets file",
      "description": ".academic-helper/secrets.json (gitignored, this project only).",
      "markdown": "```\n.academic-helper/secrets.json\n──────────────────────────────\n{ \"GOOGLE_API_KEY\": \"AIza...\" }\n→ Already in .gitignore\n```"
    }
  ],
  "multiSelect": false
}])
```

- **Env var path**: print the export command for the user to run. Then ask them to confirm they've set it and reopened the session so Pi picks up the env. You cannot set their shell env from inside Pi.
- **Secrets file path**: ask them to paste the key, then:

```bash
mkdir -p .academic-helper
python3 -c "
import json, pathlib, os
p = pathlib.Path('.academic-helper/secrets.json')
data = json.loads(p.read_text()) if p.exists() else {}
data['GOOGLE_API_KEY'] = os.environ['_PASTED_KEY']
p.write_text(json.dumps(data, indent=2))
import stat
p.chmod(stat.S_IRUSR | stat.S_IWUSR)
"
```

(Pass the pasted key via env var to avoid leaking it through shell history.) Confirm `.academic-helper/secrets.json` is gitignored.

#### Step 3.5.c — Probe the key

Run a one-shot probe through the MCP server to verify the key works end-to-end:

```
gemini_raw({
  system: "Reply with exactly the word PONG and nothing else.",
  prompt: "PING"
})
```

- On success (returned `text` contains "PONG"): print "✓ Gemini API key verified."
- On `{ error: { code: "no_credentials" } }`: print "Key not detected by the MCP server. If you just set the env var, restart Pi so the server inherits it. Re-run `/skill:academic-writer-setup` after restart."
- On any other error: print the error and tell the user Gemini will not be available until resolved.

#### Step 3.5.d — Note the calibration gate

> "On your first `/skill:academic-writer-write` in each language, a calibration gate will run:
> - You'll see one Claude paragraph and one Gemini paragraph on the same topic
> - You approve or reject Gemini for that language
> - Approved languages are stored in your profile under `gemini.approvedLanguages`."

#### Step 3.5.e — Store Gemini settings in profile

The `## Gemini` block in `profile.md` (written in Phase 4 below) will include:

```json
{
  "enabled": true,
  "approvedLanguages": [],
  "models": {}
}
```

If the researcher chose "No, Claude only": `enabled: false`, no `approvedLanguages`.

---

## Phase 4: Save Profile

Use the Write tool to create `.academic-helper/profile.md`:

```markdown
# Academic Writer Profile

---
fieldOfStudy: FIELD
citationStyle: inline-parenthetical
targetLanguage: Hebrew
abstractLanguages:
  - Hebrew
analyzedArticles: []
createdAt: ISO_TIMESTAMP
updatedAt: ISO_TIMESTAMP
---

## Tools

```json
{
  "zotero": { "enabled": true, "mode": "local" },
  "notebooklm": { "enabled": false }
}
` ` `

## Output Format Preferences

```json
` ` `

## Style Fingerprint

```json
null
` ` `

## Sources

```json
[]
` ` `

## Gemini

```json
{
  "enabled": true,
  "approvedLanguages": [],
  "models": {}
}
` ` `
```

(Replace backtick triplets with actual ` ``` ` when writing the file.)


```bash
# Resolve plugin directory from Claude plugin cache
AW_PLUGIN_DIR=$(find ~/.claude/plugins/cache -name "wf_write_article.json" -path "*/workflows/*" 2>/dev/null | head -1 | xargs dirname 2>/dev/null)
if [ -z "$AW_PLUGIN_DIR" ]; then
  echo "Warning: Could not find academic-writer workflows in plugin cache. Skipping workflow registration."
else
fi
```

---

## Completion

Ask the researcher directly in chat (present as a numbered/lettered list):\n/skill:academic-writer-write\n────────────────\nConversational pipeline:\nsubject → sources → thesis\n→ outline → write → .docx\n```"
    },
    {
      "label": "Run deeper initialization → /skill:academic-writer-init",
      "description": "Full style analysis (25 dimensions) and source indexing.",
      "markdown": "```\n/skill:academic-writer-init\n─────────────────────\n→ Deep 25-dimension fingerprint\n→ Article structure analysis\n→ Zotero source indexing\n```"
    },
    {
      "label": "Done for now",
      "description": "Profile saved. Run /skill:academic-writer-write anytime.",
      "markdown": "```\nKey commands:\n  /skill:academic-writer-write         ← write\n  /skill:academic-writer-health  ← check\n  /skill:academic-writer-update-tools ← change tools\n```"
    }
  ],
  "multiSelect": false
}])
```

Show summary table:

> | Setting | Value |
> |---------|-------|
> | Field | [field] |
> | Language | [language] |
> | Citation style | [style] |
> | Tools enabled | [list] |
> | Style fingerprint | ✓ Analyzed / — Skipped |
