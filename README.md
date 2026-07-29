# Academic Writer — Pi Package

AI-first academic writing assistant for Humanities researchers. Writes rigorously cited, style-matched articles and exports them as `.docx` — plus PDF, HTML, ODT, LaTeX, and EPUB via Pandoc, with CSL-based citation rendering from a real Zotero- or local-source `bibliography.bib` (popular style aliases, Zotero/CSL repository styles, or custom `.csl` files).

---

## What It Does

- **Writes in your voice** — analyzes your past articles to extract your style, then applies it to new work
- **Guided workflow** — subject → sources → thesis → outline → write → review → export
- **Parallel processing** — all sections written simultaneously for speed
- **Citation-verified** — every claim checked against your source library; nothing fabricated
- **Anti-AI filter** — every paragraph scored on 5 dimensions to eliminate generic AI writing patterns
- **Quality gate** — 6-dimension self-review scorecard before export; score below 40/60 triggers your review
- **Abstract generation** — automatic תקציר with optional dual-language support
- **Session dashboard** — shows profile, article count, tool status, plus active/last run state at startup

---

## Quick Start

### 1. Install Required Companion Packages

Academic Writer delegates subagent orchestration, MCP server wiring, and web search to three community Pi packages. Pi does not auto-load a dependency's own extensions just because it's listed in `package.json` — install these once, globally; every Pi project that uses them reuses the same install:

```bash
pi install npm:pi-subagents
pi install npm:pi-mcp-adapter
pi install npm:pi-web-access
```

### 2. Install the Package

From the folder where you do your research:

```bash
pi install git:github.com/JackMatanky/academic-writer
```

Pi prompts you to trust the project on first run — see [Project Trust](https://pi.dev/docs/latest/settings#project-trust).

### 3. Initialize Your Profile

```
/skill:academic-writer-init
```

One-time setup. You'll be asked for:
- Your field of study
- Citation style (Inline Parenthetical, popular aliases such as APA/MLA/Chicago, a Zotero/CSL style id, or a custom `.csl` file)
- 5–10 past articles for style analysis (place them in `past-articles/`)
- Which integrations to enable

Your profile is saved to `.academic-writer/profile.md` and loaded automatically.

### 4. Write Your First Article

```
/skill:academic-writer-write
```

### 5. Export to Other Formats (optional)

```
/skill:academic-writer-export
```

Converts a written article to PDF, HTML, ODT, LaTeX, or EPUB via Pandoc after the deterministic citation audit passes.

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
| **Local sources** | Project-local PDFs, DOCX, Markdown, or text without Zotero | Put files in `.academic-writer/sources/`; Academic Writer ingests them with `academic_writer_ingest_sources` and generates citekeys/BibTeX. |
| **Zotero** | Preferred reference manager for source PDFs (local library or web API) | [github.com/54yyyu/zotero-mcp](https://github.com/54yyyu/zotero-mcp) — install `zotero-mcp-server`, then configure the `zotero` MCP server in standard MCP config (`.mcp.json` or `~/.config/mcp/mcp.json`) |
| **NotebookLM** | AI-powered source Q&A, audio overviews, study guides | [github.com/jacob-bd/notebooklm-mcp-cli](https://github.com/jacob-bd/notebooklm-mcp-cli) — install `notebooklm-mcp-cli`, run `nlm login`, then configure the `notebooklm-mcp` MCP server in standard MCP config |
| **Sefaria** | Optional Judaic primary text lookup and verse context expansion | Configure a Sefaria MCP server with bare direct tools (`toolPrefix: "none"`, `directTools: true`); no credentials go in `.academic-writer/profile.md`. |
| **Pandoc** | Multi-format export (PDF/HTML/ODT/LaTeX/EPUB) and citeproc rendering for downloaded or custom CSL styles | [pandoc.org/installing.html](https://pandoc.org/installing.html) — PDF needs a Unicode-capable TeX engine too: Tectonic (`brew install tectonic`) or XeLaTeX (`brew install --cask basictex && sudo tlmgr install collection-xetex`) |

This package doesn't hardcode a specific model provider for prose drafting — pi already gives you that choice. To run `section-writer` (or any other agent) on a specific model, pin `subagents.agentOverrides.<agent-name>.model` in your pi settings.

**Citation styles:** Inline Parenthetical (Hebrew academic default) is written as literal styled text, unchanged regardless of export format. Every other citation style uses citeproc: section-writer emits `[@citeKey]` references, Pandoc renders them with a CSL file, and article-local `articles/<slug>.bibliography.bib` is used first, falling back to `.academic-writer/bibliography.bib`. The resolver accepts popular aliases (`apa`, `mla`, `chicago`, `chicago-author-date`, `nature`, `ieee`, etc.), any style id from [Zotero](https://www.zotero.org/styles) / [citation-style-language/styles](https://github.com/citation-style-language/styles), direct `.csl` URLs, or a custom `.csl` file, then caches downloads in `.academic-writer/csl/`.

**Scoped libraries:** During setup or `/skill:academic-writer-update-tools`, you can set a default Zotero collection, NotebookLM notebook, and Sefaria enabled/disabled state for the project. Academic Writer stores only the collection/notebook id and display name in `.academic-writer/profile.md`; credentials stay in MCP config.

**MCP configuration:** Academic Writer does not store MCP server credentials in `.academic-writer/profile.md` and does not require shell-exported environment variables. MCP servers are read from Pi's normal MCP config stack. Local Zotero, NotebookLM, and Sefaria setups can use this project-local `.mcp.json` (safe to commit only if it contains no secrets):

```json
{
  "settings": { "toolPrefix": "none" },
  "mcpServers": {
    "zotero": {
      "command": "zotero-mcp",
      "args": ["serve"],
      "env": { "ZOTERO_LOCAL": "true" },
      "directTools": true
    },
    "notebooklm-mcp": {
      "command": "notebooklm-mcp",
      "directTools": true
    },
    "sefaria": {
      "command": "sefaria-mcp",
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
├── articles/                   ← Output Markdown, DOCX, and exports
├── AUTHOR_VOICE.md             ← Distilled voice profile (git-tracked)
├── .voice/                     ← Voice-subsystem working state (fingerprint, interview transcripts, audit)
└── .academic-writer/
    ├── profile.md               ← Your profile (auto-created)
    ├── sources/                 ← Optional local PDFs/DOCX/MD/TXT sources
    ├── sources.json             ← Current-run source registry/cache
    ├── bibliography.bib         ← Current-run BibTeX cache; articles keep frozen copies beside each draft
    ├── csl/                     ← Cached/downloaded or custom CSL files for citeproc export
    ├── research-brief.md        ← Output from /skill:academic-writer-ideate
    ├── agent-memory/            ← Per-agent persistent notes
    ├── runs/                    ← Active/last run state shown in the dashboard
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

**PDF export fails / "xelatex not found" or "tectonic not found"** — install one supported PDF engine:
```bash
brew install tectonic
# or:
brew install --cask basictex
sudo tlmgr install collection-xetex
```
HTML/ODT/LaTeX/EPUB export via `/skill:academic-writer-export` don't need this — only PDF does (the default `pdflatex` engine cannot render Hebrew script; use Tectonic or XeLaTeX).

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
mise install           # provisions Node/uv/Python/hk/taplo, npm-installs both trees, uv-syncs pyproject.toml
mise run fmt           # format Python, TS/JS, JSON/YAML, and TOML
mise run lint          # formatting checks + ruff + strict TS
mise run test          # full test suite
mise run ci            # lint + test
mise run install-hooks # install hk-managed pre-commit/pre-push hooks
```

Without mise:

```bash
npm install && npm --prefix extensions install  # dev tooling only — peerDependencies aren't wired as active Pi extensions here
uv sync                                          # python-docx, lxml, pdfplumber, pytest, pyyaml, ruff
npx prettier --check "**/*.{ts,js,json,yml,yaml}"
uv run ruff check --select E9,F63,F7,F82 .
npm run typecheck                                # strict TS check on extensions/
uv run python -m pytest tests/                  # full test suite
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

Multi-format export and citation-style rendering use [Pandoc](https://pandoc.org) and CSL style files. `scripts/resolve-csl.py` downloads and caches styles from [Zotero](https://www.zotero.org/styles) / [citation-style-language/styles](https://github.com/citation-style-language/styles), maps popular aliases to canonical style ids, and resolves custom `.csl` paths or direct `.csl` URLs.

---

## License

MIT

## Support

- Package issues: [github.com/JackMatanky/academic-writer](https://github.com/JackMatanky/academic-writer)
- Zotero MCP: [github.com/54yyyu/zotero-mcp](https://github.com/54yyyu/zotero-mcp)
