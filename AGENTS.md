# Academic Writer — Pi Package Conventions

This is a [pi package](https://pi.dev/docs/latest/packages) for Humanities researchers. The user is
a single researcher on a local machine; the package should never assume team workflows.

## Commands

With [mise](https://mise.jdx.dev) (recommended — pins Node 26 / Python 3.12, manages `.venv`):

- `mise install` — provisions Node/Python and (via the `postinstall` hook) installs npm deps in both `.` and `extensions/`, plus `pip install -r requirements.txt` into `.venv`
- `mise run test` (alias `t`) — full pytest suite
- `mise run typecheck` — strict TS check on `extensions/`
- `mise run ci` — typecheck + test
- `mise run install-hooks` — installs the git pre-push hook (run once after cloning)

Without mise, the equivalent raw commands:

- `npm install && npm --prefix extensions install` — installs `pi-subagents`, `pi-mcp-adapter`, `pi-web-access`, plus the `extensions/` typecheck sandbox
- `pip install -r requirements.txt` — `python-docx`, `lxml`, `pdfplumber`, `pytest`, `PyYAML`
- `npm run typecheck` — strict TS check on `extensions/`
- `python3 -m pytest tests/` — run the full test suite (also runs via the installed pre-push hook, `bash scripts/install-hooks.sh`)

## Source layout

| Path | What |
|---|---|
| `skills/academic-writer-<name>/SKILL.md` | Skill definition (markdown + YAML frontmatter, pi Agent-Skills format) |
| `agents/<name>.md` | Agent definition (markdown + YAML frontmatter, `pi-subagents` format) |
| `extensions/env-inject/index.ts` | Injects `$ACADEMIC_WRITER_ROOT` into every `bash` tool call |
| `extensions/lifecycle/index.ts` | Session lifecycle handlers (dashboard, stop notification, session log) + mounts `mcp.ts` |
| `extensions/lifecycle/mcp.ts` | Registers the `zotero` MCP server via `pi-mcp-adapter` |
| `thresholds.json` | Single source of truth for all numeric quality gates |
| `package.json` | pi manifest — `dependencies` (`pi-subagents`, `pi-mcp-adapter`, `pi-web-access`) + the `"pi-subagents": {"agents": ["./agents"]}` discovery key |

## Conventions

- **Profile-scoped**: every skill/agent that touches `.academic-helper/` must check `.academic-helper/profile.md` exists first (or be the `init`/`setup` skill creating it).
- **Thresholds**: edit `thresholds.json` at repo root, never inline numbers in skills or agents.
- **Strict TypeScript**: `extensions/` must compile under `tsc --noEmit`; never use `any` (use `unknown` and narrow).
- **Skill frontmatter**: `name`, `description`, optional `allowed-tools` (space-delimited), optional `metadata: {author, version}`. No `user-invocable` — every pi skill is both model- and `/skill:name`-invocable.
- **Agent frontmatter**: `name`, `description`, `tools` (**comma**-delimited — `pi-subagents`' frontmatter parser splits only on commas, never whitespace). MCP grants use `mcp:<server>` (whole server) or `mcp:<server>/<tool>` (single tool) — never the Claude Code `mcp__server__tool` form. No `model:` — omitting it inherits the current Pi default model. To pin an agent to a specific model/provider (e.g. run `section-writer` on Gemini), set `subagents.agentOverrides.<name>.model` in pi settings — this package never hardcodes a provider.
- **No global pollution**: never write to `$HOME` or paths outside the project directory.

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

Auditor is the only mandatory hard gate — it must reject paragraphs whose citations don't match `sources.json` or fail external verification.

## Anti-patterns

- Don't inline thresholds — read `thresholds.json`.
- Don't create `.academic-helper/` outside the `setup` or `init` skills.
- Don't author skill descriptions that omit "Use when…" trigger phrases.
- Don't use Claude Code conventions (`mcp__server__tool`, `AskUserQuestion`, `WebSearch`, `/academic-writer:<name>` slash commands, `user-invocable`/`allowedTools`/`model` frontmatter) — this package targets pi, not Claude Code.
