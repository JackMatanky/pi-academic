# Academic Writer — Pi Package

AI-first academic writing assistant for Humanities researchers. Writes rigorously cited, style-matched articles and exports them as `.docx` — plus PDF, HTML, ODT, LaTeX, and EPUB via Pandoc, with CSL-based citation rendering from a real Zotero-sourced `bibliography.bib` (bundled APA/MLA/Chicago defaults, CSL repository styles, or custom `.csl` files).

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
- Citation style (Inline Parenthetical, bundled APA/MLA/Chicago, a CSL repository style id, or a custom `.csl` file)
- 5–10 past articles for style analysis (place them in `past-articles/`)
- Which integrations to enable

Your profile is saved to `.academic-helper/profile.md` and loaded automatically.

### 3. Write Your First Article

```
/skill:academic-writer-write
```

### 4. Export to Other Formats (optional)

```
/skill:academic-writer-export
```

Converts a written article to PDF, HTML, ODT, LaTeX, or EPUB via Pandoc.

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
| `/skill:academic-writer-export` | Convert an article to PDF/HTML/ODT/LaTeX/EPUB |
| `/skill:academic-writer-health` | Check all integrations and profile status |
| `/skill:academic-writer-help` | Show package info |

---

## Integrations

All integrations are optional. Choose which to enable during `/skill:academic-writer-init`.

| Tool | What it does | Setup |
|------|-------------|-------|
| **Zotero** | Reference manager for source PDFs (local library or web API) | [github.com/54yyyu/zotero-mcp](https://github.com/54yyyu/zotero-mcp) — install `zotero-mcp-server`, then configure the `zotero` MCP server in standard MCP config (`.mcp.json` or `~/.config/mcp/mcp.json`) |
| **NotebookLM** | AI-powered source Q&A, audio overviews, study guides | [github.com/jacob-bd/notebooklm-mcp-cli](https://github.com/jacob-bd/notebooklm-mcp-cli) |
| **Pandoc** | Multi-format export (PDF/HTML/ODT/LaTeX/EPUB) and citeproc rendering for bundled or custom CSL styles | [pandoc.org/installing.html](https://pandoc.org/installing.html) — PDF needs a XeTeX engine too, e.g. `brew install --cask basictex && sudo tlmgr install collection-xetex` |

This package doesn't hardcode a specific model provider for prose drafting — pi already gives you that choice. To run `section-writer` (or any other agent) on a specific model, pin `subagents.agentOverrides.<agent-name>.model` in your pi settings.

**Citation styles:** Inline Parenthetical (Hebrew academic default) is written as literal styled text, unchanged regardless of export format. Every other citation style uses citeproc: section-writer emits `[@citeKey]` references, Pandoc renders them with a CSL file, and `.academic-helper/bibliography.bib` supplies the Zotero metadata. The package bundles APA/MLA/Chicago defaults, but you can also use any style id from [citation-style-language/styles](https://github.com/citation-style-language/styles) or a custom `.csl` file.

**MCP configuration:** Academic Writer does not store MCP server credentials in `.academic-helper/profile.md` and does not require shell-exported environment variables. MCP servers are read from Pi's normal MCP config stack. A local Zotero setup can use this project-local `.mcp.json` (safe to commit only if it contains no secrets):

```json
{
  "settings": { "toolPrefix": "none" },
  "mcpServers": {
    "zotero": {
      "command": "zotero-mcp",
      "args": ["serve"],
      "env": { "ZOTERO_LOCAL": "true" },
      "directTools": true
    }
  }
}
```

For Zotero web/API mode, keep secrets in user-global MCP config (`~/.config/mcp/mcp.json`) or use command interpolation (for example macOS Keychain via `!security ...`) instead of writing API keys into a git-tracked project file. If you prefer shell env vars, MCP config still supports `${ZOTERO_API_KEY}` / `${ZOTERO_LIBRARY_ID}` interpolation.

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
    ├── sources.json             ← Indexed source registry (includes citeKey for Zotero-backed sources)
    ├── bibliography.bib         ← BibTeX export of your Zotero sources for citeproc articles
    ├── csl/                     ← Cached/downloaded or custom CSL files for citeproc export
    ├── research-brief.md        ← Output from /skill:academic-writer-ideate
    ├── agent-memory/            ← Per-agent persistent notes
    └── logs/                    ← Session logs
```

---

## Troubleshooting

**"No profile found"** — run `/skill:academic-writer-init` first.

**"Zotero not detected"** — install the server and make sure a `zotero` MCP server is configured:
```bash
pip install zotero-mcp-server
```
For local Zotero, add the `.mcp.json` snippet from the Integrations section. Zotero desktop must be running with the local API enabled (Settings → Advanced). The `zotero` server must expose direct bare tools (`settings.toolPrefix: "none"` plus `directTools: true`) because the package calls tools like `zotero_get_recent` directly.

**Articles won't export to .docx** — install the Python dependency:
```bash
pip install python-docx
```

**PDF export fails / "xelatex not found"** — install a XeTeX-capable LaTeX distribution:
```bash
brew install --cask basictex
sudo tlmgr install collection-xetex
```
HTML/ODT/LaTeX/EPUB export via `/skill:academic-writer-export` don't need this — only PDF does (Hebrew-safe rendering requires XeTeX; the default `pdflatex` engine cannot render Hebrew script).

**Package behaves strangely after an update** — reinstall it:
```bash
pi remove git:github.com/JackMatanky/academic-writer
pi install git:github.com/JackMatanky/academic-writer
```

---

## For Developers

Skills (`skills/`), agents (`agents/`), and extensions (`extensions/`) are the package source — there is no separate build step that generates them; pi loads them directly via convention directories.

With [mise](https://mise.jdx.dev) (recommended — pins the toolchain, manages the `uv`-synced `.venv` for you):

```bash
mise install       # provisions Node/uv/Python, npm-installs both trees, uv-syncs pyproject.toml
mise run typecheck # strict TS check on extensions/
mise run test      # full test suite
```

Without mise:

```bash
npm install && npm --prefix extensions install  # installs pi-subagents, pi-mcp-adapter, pi-web-access
uv sync                                          # python-docx, lxml, pdfplumber, pytest, pyyaml
npm run typecheck                                # strict TS check on extensions/
uv run pytest tests/                             # full test suite
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

Multi-format export and citation-style rendering use [Pandoc](https://pandoc.org) and CSL style files. The package vendors three offline defaults from the [citation-style-language/styles](https://github.com/citation-style-language/styles) repository (`apa.csl`, `modern-language-association.csl`, `chicago-notes-bibliography.csl`), and `scripts/resolve-csl.py` can resolve custom `.csl` paths or download/cache additional repository style ids into `.academic-helper/csl/`.

---

## License

MIT

## Support

- Package issues: [github.com/JackMatanky/academic-writer](https://github.com/JackMatanky/academic-writer)
- Zotero MCP: [github.com/54yyyu/zotero-mcp](https://github.com/54yyyu/zotero-mcp)
