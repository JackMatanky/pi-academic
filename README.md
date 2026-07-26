# Academic Writer — Claude Code Plugin

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

### 1. Install the Plugin

From the folder where you do your research:

```bash
`pi install git:github.com/JackMatanky/academic-writer`

*(Note: Pi will prompt you to trust the project on first run. See [Project Trust](https://pi.dev/docs/latest/settings#project-trust))*
```

> If you get "marketplace not found", register it first:
> ```bash
> claude plugin marketplace add ~/.claude/plugins/marketplaces/academic-writer
> ```

### 2. Initialize Your Profile

```bash
/skill:academic-writer-init
```

One-time setup. You'll be asked for:
- Your field of study
- Citation style (Inline Parenthetical / Chicago / MLA / APA)
- 5–10 past articles for style analysis (place them in `past-articles/`)
- Which integrations to enable

Your profile is saved to `.academic-writer/profile.json` and loaded automatically.

### 3. Write Your First Article

```bash
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

**Plugin does (automated):**
7. Writes all sections in parallel — each paragraph through an 8-step pipeline (draft → style → grammar → academic language → language purity → anti-AI → repetition → citation audit)
8. Synthesizes for coherence and style
9. Generates the תקציר (abstract)
10. Runs 6-dimension self-review scorecard
11. Exports as `.docx`

---

## Commands

| Command | What it does |
|---------|-------------|
| `/skill:academic-writer-write` | Write a new article |
| `/skill:academic-writer-init` | One-time setup: profile, citation style, style fingerprint |
| `/skill:academic-writer-ideate` | Brainstorm research questions with 5W1H and gap analysis |
| `/skill:academic-writer-learn` | Scan new past articles and update your style fingerprint |
| `/skill:academic-writer-review` | Score a completed article on 6 quality dimensions |
| `/skill:academic-writer-present` | Generate conference outlines, journal abstracts, book chapter proposals |
| `/skill:academic-writer-research` | Research a topic using your indexed sources |
| `/skill:academic-writer-edit` | Edit a previously written article |
| `/skill:academic-writer-edit-section` | Quick edit of a single section |
| `/skill:academic-writer-update-field` | Change your field of study |
| `/skill:academic-writer-update-tools` | Add or remove integrations |
| `/skill:academic-writer-health` | Check all integrations and profile status |
| `/skill:academic-writer-help` | Show plugin info |

---

## Integrations

All integrations are optional. Choose which to enable during `/skill:academic-writer-init`.

| Tool | What it does | Setup |
|------|-------------|-------|
| **Zotero** | Reference manager for source PDFs (local library or web API) | [github.com/54yyyu/zotero-mcp](https://github.com/54yyyu/zotero-mcp) |
| **NotebookLM** | AI-powered source Q&A, audio overviews, study guides | [github.com/jacob-bd/notebooklm-mcp-cli](https://github.com/jacob-bd/notebooklm-mcp-cli) |

---

## File Structure (Your Project)

```
your-research-folder/
├── past-articles/         ← Drop your published papers here (PDFs or DOCXs)
├── .academic-writer/
│   ├── profile.json       ← Your profile (auto-created)
│   ├── research-brief.md  ← Output from /skill:academic-writer-ideate
│   └── logs/              ← Session logs
└── articles/              ← Output .docx files
```

---

## Troubleshooting

**"No profile found"** — run `/skill:academic-writer-init` first.

**"Candlekeep not detected"** — install the CLI:
```bash
brew tap CandleKeepAgents/candlekeep && brew install candlekeep-cli
ck auth login
```

**Articles won't export to .docx** — install the Python dependency:
```bash
pip install python-docx
```

**Plugin behaves strangely after an update** — clear the cache and reinstall:
```bash
rm -rf ~/.claude/plugins/cache/academic-writer
`pi install git:github.com/JackMatanky/academic-writer`

*(Note: Pi will prompt you to trust the project on first run. See [Project Trust](https://pi.dev/docs/latest/settings#project-trust))*
```

---

## For Developers

Source files live in `src/` — never edit `plugins/` directly (it is generated by `npm run build` and committed to git).

```bash
# Edit source files, then:
npm run build
claude plugin install academic-writer --scope project  # from your research folder
# Restart Claude Code
```

**Versioning is automatic.** Every push to `main` triggers CI that bumps the patch version, rebuilds, commits the updated `plugins/` output, tags the release, and creates a GitHub Release. Do not bump versions manually.

---

## License

MIT

## Support

- Plugin issues: [github.com/JackMatanky/academic-writer](https://github.com/JackMatanky/academic-writer)
- Candlekeep: [github.com/CandleKeepAgents/candlekeep-cli](https://github.com/CandleKeepAgents/candlekeep-cli)
