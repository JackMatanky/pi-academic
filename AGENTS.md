# Academic Writer — Pi Package Conventions

This is a [pi package](https://pi.dev/docs/latest/packages) for Humanities researchers. The user is
a single researcher on a local machine; the package should never assume team workflows.

## Commands

With [mise](https://mise.jdx.dev) (recommended — pins Node 26 / Python 3.12 / uv / hk / taplo, manages the uv-synced `.venv`):

- `mise install` — provisions Node/uv/Python/hk/taplo and (via the `postinstall` hook) installs npm deps in both `.` and `extensions/`, plus `uv sync` (installs `pyproject.toml`/`uv.lock` deps into `.venv`)
- `mise run fmt` — formats Python, TS/JS, JSON/YAML, and TOML
- `mise run lint` — runs formatting checks, Ruff, and strict TS
- `mise run test` (alias `t`) — full pytest suite
- `mise run typecheck` — strict TS check on `extensions/`
- `mise run ci` — lint + test
- `mise run install-hooks` — installs hk-managed pre-commit/pre-push hooks (run once after cloning, or use `hk install --global`)

Without mise, the equivalent raw commands:

- `npm install && npm --prefix extensions install` — installs `pi-subagents`, `pi-mcp-adapter`, `pi-web-access`, `@earendil-works/pi-coding-agent`, plus root/extension dev tooling
- `uv sync` — `python-docx`, `lxml`, `pdfplumber` (`project.dependencies`) plus `pytest`, `pyyaml`, `ruff` (`dependency-groups.dev`)
- `npx prettier --check "**/*.{ts,js,json,yml,yaml}" && uv run ruff check --select E9,F63,F7,F82 .` — raw lint pieces before TS
- `npm run typecheck` — strict TS check on `extensions/`
- `uv run python -m pytest tests/` — run the full test suite

## Source layout

| Path                                                                    | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/<skill-name>/SKILL.md`                                | Skill definition (markdown + YAML frontmatter, pi Agent-Skills format)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `agents/<name>.md`                                                      | Agent definition (markdown + YAML frontmatter, `pi-subagents` format)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `extensions/pi-academic-writer/index.ts`                                | Registers package-aware Academic Writer tools (`academic_writer_status`, `academic_writer_health`, `academic_writer_migrate_profile`, `academic_writer_get_profile`, `academic_writer_update_profile`, `academic_writer_article_paths`, `academic_writer_list_project_files`, `academic_writer_extract_document`, `academic_writer_audit_citations`, `academic_writer_export_article`, `academic_writer_read_resource`, `academic_writer_resolve_csl`, `academic_writer_generate_docx`, `academic_writer_list_agents`, `academic_writer_fix_typography`) so skills never need package-root environment variables or ad-hoc shell parsing. |
| `extensions/pi-academic-writer/research.ts`                             | Canonical project research-note library, per-article argument-map validation, Markdown rendering, frozen selected-note snapshots, queries, and migration.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `.academic-writer/research-notes.json` / `articles/<slug>.outline.json` | Persistent note library and canonical recursive argument outline; article-local `.notes.json` snapshots freeze selected evidence when the outline is approved.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Research tools in `extensions/pi-academic-writer/index.ts`              | Registers `academic_writer_write_research_notes`, `academic_writer_review_research_notes`, `academic_writer_write_outline`, `academic_writer_render_outline`, `academic_writer_snapshot_notes`, `academic_writer_query_research`, and `academic_writer_migrate_article_outline`; citation workflows consume article-local frozen snapshots.                                                                                                                                                                                                                                                                                               |
| `extensions/lifecycle/index.ts`                                         | Session lifecycle handlers (dashboard, stop notification, session log). It must not mount `pi-mcp-adapter`; Pi loads that dependency directly so MCP tools/flags are registered once.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `thresholds.json`                                                       | Packaged default for all numeric quality gates. `academic_writer_read_resource(name: thresholds)` resolves `.academic-writer/thresholds.json` first (the per-project override `init`/`setup` copies on first run) and falls back to this file — never inline a threshold in skills or agents.                                                                                                                                                                                                                                                                                                                                             |
| `package.json`                                                          | pi manifest — explicit `pi.extensions`/`pi.skills`, `peerDependencies` (`pi-subagents`, `pi-mcp-adapter`, `pi-web-access`, `@earendil-works/pi-coding-agent`; researcher-installed, never bundled) + the `"pi-subagents": {"agents": ["./agents"]}` discovery key                                                                                                                                                                                                                                                                                                                                                                         |
| `pyproject.toml` / `uv.lock`                                            | Python dev/build tooling deps (`python-docx`, `lxml`, `pdfplumber`; dev: `pytest`, `pyyaml`) — managed by `uv`, not published                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `scripts/resolve-csl.py`                                                | Resolves popular CSL aliases, Zotero/CSL repository ids, direct `.csl` URLs, cached `.academic-writer/csl/*.csl`, or project/user `.csl` paths to a local style file for Pandoc                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Conventions

- **Profile-scoped**: every skill/agent that touches `.academic-writer/` must check `.academic-writer/profile.md` exists first (or be the `init`/`setup` skill creating it).
- **Thresholds**: package contributors edit `thresholds.json` at repo root to change shipped defaults, never inline numbers in skills or agents. Researchers override per project by editing `.academic-writer/thresholds.json` (see `academic_writer_read_resource` resolution order above) — never tell a researcher to edit the package's own copy.
- **Strict TypeScript**: `extensions/` must compile under `tsc --noEmit`; never use `any` (use `unknown` and narrow).
- **Skill frontmatter**: `name`, `description`, optional `allowed-tools` (space-delimited), optional `metadata: {author, version}`. No `user-invocable` — every pi skill is both model- and `/skill:name`-invocable.
- **Agent frontmatter**: `name`, `description`, `tools` (comma-delimited for `pi-subagents`), and optional `spawns` for OMP nested-agent grants. A restricted nested caller needs `subagent` in its `tools` under pi and `spawns: <agent>` under OMP. Pi MCP visibility grants use `mcp:<server>` or `mcp:<server>/<tool>`; OMP MCP names are resolved at runtime. Omit `model:` to inherit the harness default; override via `subagents.agentOverrides.<name>.model` (pi) or `task.agentModelOverrides.<name>` (OMP).
- **Research notes and outlines**: `.academic-writer/research-notes.json` is the mutable source-linked library; `articles/<slug>.outline.json` is the canonical recursive argument map. Only verified, fresh notes can support approved points. Freeze selected notes to `articles/<slug>.notes.json` with the approval; all section-writing/auditing uses that article-local snapshot. Rendered `.outline.md` is generated, never hand-edited. Migration alone may create claim/reasoning-free `unmapped` draft points with preserved paragraph text. Local-file `sourceId`s are content fingerprints; PDF anchors use zero-based `pdfPageIndex` plus human-readable locator and quoted text.
- **Scoped agent writes**: do not grant generic `write`/`edit` to agents limited to one artifact. Grant the appropriate `academic_writer_write_*` tool instead; its destination is fixed by the extension. This restriction works without an optional permission plugin and under both pi and OMP.
- **No global pollution**: never write to `$HOME` or paths outside the project directory.
- **Citation authoring has two modes, keyed off `citationStyle`**: `inline-parenthetical` (Hebrew default) writes literal styled citation text, unchanged end to end. Every other value is citeproc mode: section-writer writes pandoc-markdown citation markers (`[@citeKey, p. N]`, or `[@key1; @key2, p. N]` for co-located citations) resolved at export time by Pandoc's `--citeproc` against `.academic-writer/bibliography.bib` and a resolved CSL file. Popular aliases such as `apa`, `mla`, `chicago`, and `chicago-author-date` map to Zotero/CSL style ids and download/cache on first use; users may also choose any Zotero/CSL repository style id, direct `.csl` URL, or custom `.csl` path. Never invent a `citeKey` — it must come from a `sources.json` record populated by `d…
- **MCP config belongs to MCP**: never put Zotero API keys, library IDs, NotebookLM tokens, or other MCP server credentials in `.academic-writer/profile.md` or package source. Academic Writer records only tool intent and project scope (`tools.zotero.enabled`, optional `tools.zotero.collection`, `tools.notebooklm.enabled`, optional `tools.notebooklm.notebook`). Runtime MCP server wiring must live in standard MCP config. If a skill scaffolds project-local `.mcp.json`, it must use safe local defaults (`ZOTERO_LOCAL=true`) and warn that secrets belong in user-global MCP config or command interpolation, not a git-tracked project file.
- **Bare MCP tools require direct MCP config**: agents/skills call Zotero (`zotero_get_recent`, `zotero_get_item_fulltext`) and NotebookLM (`notebook_list`, `notebook_query`, `source_add`, `studio_create`) tools by bare name, so configured `zotero` and `notebooklm-mcp` servers must use `settings.toolPrefix: "none"` and per-server `directTools: true`. Do not reintroduce programmatic `createMcpAdapter({ config: ... })`; that isolated snapshot ignores `.mcp.json` and global MCP config. Under oh-my-pi, these bare names are not called directly — agents/skills resolve the live tool name first via `academic_writer_resolve_mcp_tool` (oh-my-pi exposes MCP tools as `mcp__<server>_<tool>`); the bare names above remain accurate and directly callable under plain pi.
- **Whole-server MCP grants include write tools**: `mcp:zotero` grants every tool the `zotero-mcp` (54yyyu) server exposes, including mutation tools (`zotero_add_item`, `zotero_update_item`, `zotero_manage_note`). Upstream groups only optional tools into `ZOTERO_MCP_TOOLSETS`; write tools are core and cannot be hidden server-side, so an agent that must stay read-only gets single tools via `mcp:zotero/<tool>` instead of the whole server.

## Slash commands

Skills are model-invoked by default; natural-language triggering is primary. `/skill:<name>` is the explicit fallback.

| Command | Purpose |
|---|---|
| `/skill:academic-write` | Frame a research question or write a new article |
| `/skill:academic-research` | Investigate a topic or fact-check sources |
| `/skill:academic-edit` | Revise an article, including single-section and structural modes |
| `/skill:academic-review` | Substantive article review or mechanical proofreading |
| `/skill:academic-setup` | Quick/full setup, profile updates, and integration maintenance |
| `/skill:academic-voice` | Refresh style from new articles or deepen/calibrate the voice profile |
| `/skill:academic-feedback` | Apply researcher feedback to prose and profile patterns |
| `/skill:academic-health` | Check integration and project health |
| `/skill:academic-export` | Export finished work to additional formats |
| `/skill:academic-present` | Generate presentation/submission deliverables |
| `/skill:academic-help` | List commands and explain workflows |

## Agents

| Agent file | Role |
|---|---|
| `agents/deep-reader.md` | Explores original sources; maps evidence and gaps before thesis proposal. |
| `agents/architect.md` | Proposes thesis options and recursive argument-map outlines. |
| `agents/section-writer.md` | Drafts one assigned section from frozen evidence and runs the paragraph pipeline. |
| `agents/auditor.md` | Independent citation hard gate; verifies claims against actual sources. |
| `agents/synthesizer.md` | Reviews full-article coherence, flow, repetition, and reverse-outline diagnostics. |
| `agents/proofreader.md` | Returns suggestion-only mechanical proofreading findings; never edits. |
| `agents/voice-profile-builder.md` | Corpus fingerprinting or transcript distillation, selected by explicit mode. |
| `agents/voice-facilitator.md` | One interview session or scheduled voice calibration, selected by explicit mode. |

## Pipeline pattern

The `write` and `edit` skills use a chained-with-gates pattern:

1. Conversational planning phase (architect agent, human in the loop).
2. Parallel section writing (one `section-writer` subagent per section).
3. Per-paragraph 8-skill pipeline (draft → 6 checks → citation audit hard gate).
4. Synthesis pass + self-review scorecard.

DOCX generation branches by citation mode in Step 9 of `write`/`edit`: `inline-parenthetical` still goes through the JSON-schema + `academic_writer_generate_docx` path (RTL/footnote handling); citeproc mode goes through `academic_writer_export_article` with `formats: ["docx"]`, `bibliography: ".academic-writer/bibliography.bib"`, and a resolved `csl` path, so skills do not mutate article markdown with export-only YAML frontmatter. Resolve CSL paths with `academic_writer_resolve_csl`; don't hardcode a closed list beyond the resolver's popular alias map. The citeproc path does not apply Hebrew RTL post-processing — document that limitation when target language is Hebrew.

## Anti-patterns

- Don't inline thresholds — read `thresholds.json`.
- Don't create `.academic-writer/` outside the `academic-setup` skill.
- Don't author skill descriptions that omit "Use when…" trigger phrases.
- Don't use Claude Code conventions (`mcp__server__tool`, `AskUserQuestion`, `WebSearch`, `/academic-writer:<name>` slash commands, `user-invocable`/`allowedTools`/`model` frontmatter) — this package targets pi, not Claude Code.
- Don't move `pi-subagents`/`pi-mcp-adapter`/`pi-web-access`/`@earendil-works/pi-coding-agent` into `dependencies` or `bundledDependencies` — Pi never auto-loads a dependency's own extensions, so bundling would only duplicate-register their tools/flags against a researcher's separately installed copies (the exact `mcp`-tool conflict this package hit and fixed once already). Keep them `peerDependencies: "*"` and documented as required companion installs in README.
