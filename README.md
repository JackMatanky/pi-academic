# Academic Writer — Pi Package

AI-first academic writing assistant for Humanities researchers. Writes rigorously cited, style-matched articles and exports them as `.docx` files.

---

## What It Does

- **Writes in your voice** — analyzes your past articles to extract your style, then applies it to new work
- **Guided workflow** — subject → sources → thesis → outline → write → review → export
- **Parallel processing** — all sections written simultaneously for speed
- **Citation-verified** — every claim checked against your source library; nothing fabricated
- **Anti-AI filter** — every paragraph scored on 5 dimensions to eliminate generic AI writing patterns
- **Quality gate** — 6-dimension self-review scorecard before export; score below 40/60 triggers your review
- **Abstract generation** — automatic תקציר with optional dual-language support
- **Session dashboard** — shows your profile, article count, and tool status at startup

---

## Quick Start

### 1. Install the Package

From the folder where you do your research:

```bash
pi install git:github.com/JackMatanky/academic-writer
```

Pi prompts you to trust the project on first run — see [Project Trust](https://pi.dev/docs/latest/settings#project-trust).

### 2. Initialize Your Profile

```
/skill:academic-writer-init
```

One-time setup. You'll be asked for:
- Your field of study
- Citation style (Inline Parenthetical / Chicago / MLA / APA)
- 5–10 past articles for style analysis (place them in `past-articles/`)
- Which integrations to enable

Your profile is saved to `.academic-helper/profile.md` and loaded automatically.

### 3. Write Your First Article

```
/skill:academic-writer-write
```

---

## Writing Workflow

**You do (conversational):**
1. Describe the topic
2. Select relevant sources
3. Review the deep-read summary
4. Choose a thesis (2–3 options)
5. Refine the outline together
6. Approve

**Package does (automated):**
7. Writes all sections in parallel — each paragraph through an 8-step pipeline (draft → style → grammar → academic language → language purity → anti-AI → repetition → citation audit)
8. Synthesizes for coherence and style
9. Generates the תקציר (abstract)
10. Runs 6-dimension self-review scorecard
11. Exports as `.docx`

---

## Commands

Skills are model-invoked by default — natural-language triggering is primary. `/skill:academic-writer-<name>` is the explicit fallback.

| Command | What it does |
|---------|-------------|
| `/skill:academic-writer-write` | Write a new article |
| `/skill:academic-writer-init` | Full onboarding: profile, citation style, style fingerprint, source indexing |
| `/skill:academic-writer-setup` | Quick onboarding (profile + integrations only) |
| `/skill:academic-writer-ideate` | Brainstorm research questions with 5W1H and gap analysis |
| `/skill:academic-writer-learn` | Scan new past articles and update your style fingerprint |
| `/skill:academic-writer-voice` | Deepen your voice profile with a 7-session adversarial interview |
| `/skill:academic-writer-review` | Score a completed article on 6 quality dimensions |
| `/skill:academic-writer-proofread` | Mechanical הגהה pass — fixes typos/punctuation/grammar with a change report |
| `/skill:academic-writer-present` | Generate conference outlines, journal abstracts, book chapter proposals |
| `/skill:academic-writer-research` | Research a topic using your indexed sources |
| `/skill:academic-writer-edit` | Edit a previously written article |
| `/skill:academic-writer-edit-section` | Quick edit of a single section |
| `/skill:academic-writer-feedback` | Apply free-form feedback to an article or your profile |
| `/skill:academic-writer-update-field` | Change your field of study |
| `/skill:academic-writer-update-tools` | Add or remove integrations |
| `/skill:academic-writer-health` | Check all integrations and profile status |
| `/skill:academic-writer-help` | Show package info |

---

## Integrations

All integrations are optional. Choose which to enable during `/skill:academic-writer-init`.

| Tool | What it does | Setup |
|------|-------------|-------|
| **Zotero** | Reference manager for source PDFs (local library or web API) | [github.com/54yyyu/zotero-mcp](https://github.com/54yyyu/zotero-mcp) — `pip install zotero-mcp-server && zotero-mcp setup` |
| **NotebookLM** | AI-powered source Q&A, audio overviews, study guides | [github.com/jacob-bd/notebooklm-mcp-cli](https://github.com/jacob-bd/notebooklm-mcp-cli) |

This package doesn't hardcode a specific model provider for prose drafting — pi already gives you that choice. To run `section-writer` (or any other agent) on a specific model, pin `subagents.agentOverrides.<agent-name>.model` in your pi settings.

---

## File Structure (Your Project)

```
your-research-folder/
├── past-articles/              ← Drop your published papers here (PDFs or DOCXs)
├── articles/                   ← Output .docx files
├── AUTHOR_VOICE.md             ← Distilled voice profile (git-tracked)
├── .voice/                     ← Voice-subsystem working state (fingerprint, interview transcripts, audit)
└── .academic-helper/
    ├── profile.md               ← Your profile (auto-created)
    ├── sources.json             ← Indexed source registry
    ├── research-brief.md        ← Output from /skill:academic-writer-ideate
    ├── agent-memory/            ← Per-agent persistent notes
    └── logs/                    ← Session logs
```

---

## Troubleshooting

**"No profile found"** — run `/skill:academic-writer-init` first.

**"Zotero not detected"** — install and start the MCP server:
```bash
pip install zotero-mcp-server
zotero-mcp setup
```
Zotero desktop must be running with the local API enabled (Settings → Advanced) for local-mode detection to succeed.

**Articles won't export to .docx** — install the Python dependency:
```bash
pip install python-docx
```

**Package behaves strangely after an update** — reinstall it:
```bash
pi remove git:github.com/JackMatanky/academic-writer
pi install git:github.com/JackMatanky/academic-writer
```

---

## For Developers

Skills (`skills/`), agents (`agents/`), and extensions (`extensions/`) are the package source — there is no separate build step that generates them; pi loads them directly via convention directories.

```bash
npm install               # installs pi-subagents, pi-mcp-adapter, pi-web-access
npm run typecheck         # strict TS check on extensions/
python3 -m pytest tests/  # full test suite
```

**Versioning is automatic.** Every push to `main` triggers CI that bumps the patch version in `package.json`, tags the release, and creates a GitHub Release. Do not bump versions manually.

---

## Acknowledgements

This is a fork of [yodem/academic-writer](https://github.com/yodem/academic-writer) by Yotam Fromm — the original Claude Code plugin this package is built on. All core skills, agents, and the citation-verification pipeline originate there; this fork converts the distribution to a [pi package](https://pi.dev/docs/latest/packages) and replaces the Candlekeep integration with Zotero MCP.

The pi conversion depends on three community pi packages by [Nico Bailon](https://github.com/nicobailon), without which this package's subagent, MCP, and web-search architecture would not be possible:
- [pi-subagents](https://github.com/nicobailon/pi-subagents) — subagent orchestration, replacing Claude Code's `Agent`/Task tool and `agents/*.md` loading.
- [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) — MCP server wiring, replacing `plugin.json`'s `mcpServers` key.
- [pi-web-access](https://github.com/nicobailon/pi-web-access) — the `web_search` tool used by the citation auditor's external-verification check.

Source-library access is provided by [zotero-mcp](https://github.com/54yyyu/zotero-mcp) (54yyyu), replacing the original Candlekeep integration.

---

## License

MIT

## Support

- Package issues: [github.com/JackMatanky/academic-writer](https://github.com/JackMatanky/academic-writer)
- Zotero MCP: [github.com/54yyyu/zotero-mcp](https://github.com/54yyyu/zotero-mcp)
