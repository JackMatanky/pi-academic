# Academic Writer — Pi Package Conventions

This is a [pi package](https://pi.dev/docs/latest/packages) for Humanities researchers. The user is
a single researcher on a local machine; the package should never assume team workflows.

## Commands

With [mise](https://mise.jdx.dev) (recommended — pins Node 26 / Python 3.12 / uv, manages the uv-synced `.venv`):

- `mise install` — provisions Node/uv/Python and (via the `postinstall` hook) installs npm deps in both `.` and `extensions/`, plus `uv sync` (installs `pyproject.toml`/`uv.lock` deps into `.venv`)
- `mise run test` (alias `t`) — full pytest suite
- `mise run typecheck` — strict TS check on `extensions/`
- `mise run ci` — typecheck + test
- `mise run install-hooks` — installs the git pre-push hook (run once after cloning)

Without mise, the equivalent raw commands:

- `npm install && npm --prefix extensions install` — installs `pi-subagents`, `pi-mcp-adapter`, `pi-web-access`, plus the `extensions/` typecheck sandbox
- `uv sync` — `python-docx`, `lxml`, `pdfplumber` (`project.dependencies`) plus `pytest`, `pyyaml` (`dependency-groups.dev`)
- `npm run typecheck` — strict TS check on `extensions/`
- `uv run pytest tests/` — run the full test suite (also runs via the installed pre-push hook, `bash scripts/install-hooks.sh`)

## Source layout

| Path | What |
|---|---|
| `skills/academic-writer-<name>/SKILL.md` | Skill definition (markdown + YAML frontmatter, pi Agent-Skills format) |
| `agents/<name>.md` | Agent definition (markdown + YAML frontmatter, `pi-subagents` format) |
| `extensions/academic-writer-tools/index.ts` | Registers package-aware Academic Writer tools (`academic_writer_read_resource`, `academic_writer_resolve_csl`, `academic_writer_generate_docx`, `academic_writer_list_agents`, `academic_writer_fix_typography`) so skills never need package-root environment variables. |
| `extensions/lifecycle/index.ts` | Session lifecycle handlers (dashboard, stop notification, session log). It must not mount `pi-mcp-adapter`; Pi loads that dependency directly so MCP tools/flags are registered once. |
| `thresholds.json` | Single source of truth for all numeric quality gates |
| `package.json` | pi manifest — `dependencies` (`pi-subagents`, `pi-mcp-adapter`, `pi-web-access`) + the `"pi-subagents": {"agents": ["./agents"]}` discovery key |
| `pyproject.toml` / `uv.lock` | Python dev/build tooling deps (`python-docx`, `lxml`, `pdfplumber`; dev: `pytest`, `pyyaml`) — managed by `uv`, not published |
| `scripts/lib/csl/*.csl` | Vendored default CSL style files for citeproc export (`apa.csl`, `modern-language-association.csl`, `chicago-notes-bibliography.csl`), from [citation-style-language/styles](https://github.com/citation-style-language/styles) |
| `scripts/resolve-csl.py` | Resolves bundled CSL aliases, project/user `.csl` paths, cached `.academic-helper/csl/*.csl`, or Citation Style Language repository ids to a local style file for Pandoc |

## Conventions

- **Profile-scoped**: every skill/agent that touches `.academic-helper/` must check `.academic-helper/profile.md` exists first (or be the `init`/`setup` skill creating it).
- **Thresholds**: edit `thresholds.json` at repo root, never inline numbers in skills or agents.
- **Strict TypeScript**: `extensions/` must compile under `tsc --noEmit`; never use `any` (use `unknown` and narrow).
- **Skill frontmatter**: `name`, `description`, optional `allowed-tools` (space-delimited), optional `metadata: {author, version}`. No `user-invocable` — every pi skill is both model- and `/skill:name`-invocable.
- **Agent frontmatter**: `name`, `description`, `tools` (**comma**-delimited — `pi-subagents`' frontmatter parser splits only on commas, never whitespace). MCP grants use `mcp:<server>` (whole server) or `mcp:<server>/<tool>` (single tool) — never the Claude Code `mcp__server__tool` form. No `model:` — omitting it inherits the current Pi default model. To pin an agent to a specific model/provider (e.g. run `section-writer` on Gemini), set `subagents.agentOverrides.<name>.model` in pi settings — this package never hardcodes a provider.
- **No global pollution**: never write to `$HOME` or paths outside the project directory.
- **Citation authoring has two modes, keyed off `citationStyle`**: `inline-parenthetical` (Hebrew default) writes literal styled citation text, unchanged end to end. Every other value is citeproc mode: section-writer writes pandoc-markdown citation markers (`[@citeKey, p. N]`, or `[@key1; @key2, p. N]` for co-located citations) resolved at export time by Pandoc's `--citeproc` against `.academic-helper/bibliography.bib` and a resolved CSL file. The bundled aliases `apa`, `mla`, and `chicago` remain for backward compatibility, but users may choose any CSL repository style id or custom `.csl` path. Never invent a `citeKey` — it must come from a `sources.json` record populated by `deep-reader`. Don't reintroduce literal citation text for citeproc styles, and don't apply citeproc markers to `inline-parenthetical` — the two modes are mutually exclusive per article.
- **MCP config belongs to MCP**: never put Zotero API keys, library IDs, NotebookLM tokens, or other MCP server credentials in `.academic-helper/profile.md` or package source. Academic Writer records only tool intent (`tools.zotero.enabled`, `tools.notebooklm.enabled`, etc.). Runtime MCP server wiring must live in standard MCP config. If a skill scaffolds project-local `.mcp.json`, it must use safe local defaults (`ZOTERO_LOCAL=true`) and warn that secrets belong in user-global MCP config or command interpolation, not a git-tracked project file.
- **Bare Zotero tools require direct MCP config**: because agents call `zotero_get_recent`, `zotero_get_item_fulltext`, etc. by bare name, any configured `zotero` server must use `settings.toolPrefix: "none"` and `mcpServers.zotero.directTools: true`. Do not reintroduce programmatic `createMcpAdapter({ config: ... })`; that isolated snapshot ignores `.mcp.json` and global MCP config.

## Slash commands

Skills are model-invoked by default; natural-language triggering is primary. `/skill:academic-writer-<name>` is the explicit fallback for every skill below.

| Command | Purpose |
|---|---|
| `/skill:academic-writer-write` | Start a new article from scratch |
| `/skill:academic-writer-edit` | Revise a drafted article |
| `/skill:academic-writer-edit-section` | Revise one section only |
| `/skill:academic-writer-proofread` | Mechanical הגהה pass — fixes + change report |
| `/skill:academic-writer-init` | Full onboarding (first install) |
| `/skill:academic-writer-setup` | Quick onboarding |
| `/skill:academic-writer-research` | Investigate a topic |
| `/skill:academic-writer-ideate` | Frame a research question |
| `/skill:academic-writer-review` | Score an article before submission |
| `/skill:academic-writer-health` | Check integration health |
| `/skill:academic-writer-help` | List available commands |
| `/skill:academic-writer-export` | Convert an article to PDF/HTML/ODT/LaTeX/EPUB via Pandoc |
| `/skill:academic-writer-voice` | Stage 2 deep voice profile (7-session adversarial interview) |
| `/skill:academic-writer-feedback` | Apply free-form feedback to an article or profile |
| `/skill:academic-writer-learn` | Analyze past articles to refresh the style fingerprint |
| `/skill:academic-writer-present` | Generate NotebookLM audio overviews / study guides |
| `/skill:academic-writer-update-field` | Update a single profile field |
| `/skill:academic-writer-update-tools` | Enable/disable integrations (Zotero, NotebookLM) |

## Agents

| Agent file | Role |
|---|---|
| `agents/deep-reader.md` | Explores Zotero source documents; maps evidence before thesis |
| `agents/architect.md` | Generates thesis options or structured article outline |
| `agents/section-writer.md` | Writes one complete section through the 8-skill quality pipeline |
| `agents/auditor.md` | Citation hard gate — verifies claims against `sources.json` |
| `agents/proofreader.md` | Mechanical הגהה — returns a change list (typo/punctuation/grammar/idea-flag); never edits |
| `agents/synthesizer.md` | Post-section review for coherence and cross-section flow |
| `agents/voice-miner.md` | Stage 1 voice subsystem — reads corpus and emits markdown style fingerprint |
| `agents/voice-interviewer.md` | Stage 2 — runs one adversarial interview session at a time |
| `agents/voice-distiller.md` | Compresses transcripts + fingerprint into `AUTHOR_VOICE.md` |
| `agents/voice-calibrator.md` | Validates the voice profile after sessions 3 and 7 |

## Pipeline pattern

The `write` and `edit` skills use a chained-with-gates pattern:
1. Conversational planning phase (architect agent, human in the loop).
2. Parallel section writing (one `section-writer` subagent per section).
3. Per-paragraph 8-skill pipeline (draft → 6 checks → citation audit hard gate).
4. Synthesis pass + self-review scorecard.

DOCX generation branches by citation mode in Step 9 of `write`/`edit`: `inline-parenthetical` still goes through the JSON-schema + `scripts/generate-docx.py` path (RTL/footnote handling); citeproc mode goes through `pandoc "$MD_PATH" --citeproc -o "$DOCX_PATH"` directly, relying on `bibliography:`/`csl:` YAML frontmatter written into the markdown by Step 9a. Resolve CSL paths with `scripts/resolve-csl.py`; don't hardcode a closed list beyond backward-compatible bundled aliases. The citeproc path does not apply Hebrew RTL post-processing — document that limitation when target language is Hebrew.


## Anti-patterns

- Don't inline thresholds — read `thresholds.json`.
- Don't create `.academic-helper/` outside the `setup` or `init` skills.
- Don't author skill descriptions that omit "Use when…" trigger phrases.
- Don't use Claude Code conventions (`mcp__server__tool`, `AskUserQuestion`, `WebSearch`, `/academic-writer:<name>` slash commands, `user-invocable`/`allowedTools`/`model` frontmatter) — this package targets pi, not Claude Code.
