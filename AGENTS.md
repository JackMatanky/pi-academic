# Academic Writer — Pi and oh-my-pi Package Conventions

This is a [pi package](https://pi.dev/docs/latest/packages) for Humanities researchers
that also targets oh-my-pi. The user is a single researcher on a local machine;
the package should never assume team workflows.

## Commands

With [mise](https://mise.jdx.dev) (recommended — pins Node 26, hk, Taplo, and Vite+):

- `mise install` — provisions tools and (via the `postinstall` hook) installs npm deps in both `.` and `extensions/`
- `mise run fmt` — formats TS/JS, JSON/YAML, and TOML with Vite+ and Taplo
- `mise run lint` — checks formatting, runs Vite+ lint rules (including vendored anti-slop rules), and strict TypeScript
- `mise run test` (alias `t`) — runs the Vitest suite through Vite+ (`vp test`)
- `mise run typecheck` — strict TS check on `extensions/`
- `mise run ci` — lint + test
- `mise run install-hooks` — installs hk-managed pre-commit/pre-push hooks (run once after cloning, or use `hk install --global`)

Without mise, the equivalent raw commands:

- `npm install && npm --prefix extensions install` — installs runtime/peer development dependencies, Vite+, and extension dependencies
- `npx vp fmt --check "**/*.{ts,js,json,yml,yaml}" && taplo check mise.toml` — formatting checks
- `npx vp lint extensions && npm run typecheck` — lint and strict TS check
- `npm test` — runs the Vitest suite via `vp test` (needs `pandoc`; the PDF build test also needs `xelatex` or `tectonic` and is skipped without one)

## Source layout

| Path                                                                    | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skills/<skill-name>/SKILL.md`                                | Skill definition (markdown + YAML frontmatter, pi Agent-Skills format)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `agents/<name>.md`                                                      | Agent definition (markdown + YAML frontmatter, `pi-subagents` format)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `extensions/pi-academic-writer/index.ts` + `tools/*.ts` + `tool-kit.ts` | `index.ts` only calls the `register*Tools` functions in `tools/` (`core`, `profile`, `source`, `export`, `research`, `voice`). Each tool is registered through `registerTool` in `tool-kit.ts`: params are typed from the TypeBox schema, handlers return `{text, details}` and report failure by throwing `ToolFailure` (the only way Pi sets `isError`). Every tool declares an `effect` (read/write/exec, mapped to the omp approval tier) and optionally `core` (always loaded on omp). Skills never need package-root environment variables or ad-hoc shell parsing. |
| `extensions/lib/fs-safe.ts` / `markdown.ts` / `schema.ts` | `resolveInside` (every path a tool accepts must stay inside the project, symlinks included), `writeFileAtomic`, `withFileLock` (read-modify-write of shared JSON), `errorMessage`; `fenceAfter` tracks fenced code so heading/citation/footnote scans skip code; `schema.ts` is the decoding boundary: `JsonValue`, `parseJsonText`, `isValid`/`assertValid`/`parseWith`, `readJsonFile`/`tryReadJsonFile`, `firstViolation` over TypeBox schemas. |
| `extensions/pi-academic-writer/project-files.ts` / `documents.ts` / `source-registry.ts` / `docx-assembly.ts` / `commands.ts` / `mcp-names.ts` | Article paths and listings; document text extraction (md/txt/docx/pdf, with a warning when the DOCX Pandoc path is unavailable); local-source ingest that merges into `sources.json`/`bibliography.bib` and keeps citekeys stable; markdown to DOCX-JSON assembly (sections, footnotes); command lookup and health; MCP tool-name candidates. |
| `extensions/pi-academic-writer/research-*.ts`                           | Research library split by concern: `research-core` (TypeBox schemas and the `Note`/`Outline` types derived from them), `research-notes` (note library, review, staleness, under a file lock), `research-outline` (argument-map validation, rendering, frozen snapshots, migration), `research-query` (fixed-scope queries and diagnostics). |
| `.academic-writer/research-notes.json` / `articles/<slug>.outline.json` | Persistent note library and canonical recursive argument outline; article-local `.notes.json` snapshots freeze selected evidence when the outline is approved.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Research tools in `extensions/pi-academic-writer/tools/research-tools.ts` | Registers `academic_writer_write_research_notes`, `academic_writer_review_research_notes`, `academic_writer_write_outline`, `academic_writer_render_outline`, `academic_writer_snapshot_notes`, `academic_writer_query_research`, `academic_writer_diagnose_outline`, `academic_writer_reverse_outline`, and `academic_writer_migrate_article_outline`; citation workflows consume article-local frozen snapshots. |
| `extensions/lifecycle/index.ts` | Session dashboard on `session_start` (skipped when there is no UI); on pi, warns when the `subagent` or `web_search` companion is missing. It must not mount `pi-mcp-adapter`; Pi loads that dependency directly so MCP tools/flags are registered once. |
| `extensions/lib/harness.ts` | `detectHarness`: pi vs omp, computed once per entry point and passed down. |
| `extensions/pi-academic-writer/output-bound.ts` | 50 KB / 2,000-line cap on tool output, with the full text spilled to `.academic-writer/runs/tool-output/` when `.academic-writer/` exists. |
| `extensions/pi-academic-writer/thresholds-default.ts`                   | Typed shipped default for all numeric quality gates. `academic_writer_read_resource(name: thresholds)` resolves `.academic-writer/thresholds.json` first (the per-project override that init/setup writes after asking the researcher) and falls back to this default — never inline a threshold in skills or agents.                                                                                                                                                                                            |
| `package.json`                                                          | pi manifest — explicit `pi.extensions`/`pi.skills`, `pi.subagents.agents` (the `./agents` discovery directory), `peerDependencies` (`pi-subagents`, `pi-mcp-adapter`, `pi-web-access`, `@earendil-works/pi-coding-agent`; researcher-installed, never bundled) + runtime `dependencies` (`typebox`, `harper.js`, …)                                                                                                                                                                                                                                           |
| `extensions/pi-academic-writer/style-design.ts`                         | Style package schema: validation, merging omitted properties from the typed starter defaults in `style-starters.ts`, native-asset containment, and which properties the researcher changed (so warnings cover only those) |
| `extensions/pi-academic-writer/style-starters.ts`                       | The shipped starter definitions (academic-default, apa-7, mla-9, chicago) as typed TypeScript objects with comments; `installStarterPackage` serializes them to the project's `design.json` |
| `extensions/pi-academic-writer/style-docx.ts` / `style-odt.ts` / `style-latex.ts` | Turn a validated design into a Pandoc `--reference-doc` (DOCX/ODT, patched from Pandoc's own default so footnotes work) or a LaTeX `--include-in-header` preamble; properties a format cannot express are returned as warnings, never dropped silently |
| `extensions/pi-academic-writer/document-style.ts`                       | Per-format asset rendering (`renderDocumentStyle`), package validation (`checkStylePackage`), starter install, scratch directories under `.academic-writer/runs/` |
| `extensions/pi-academic-writer/docx-generator.ts` / `pandoc.ts`         | Literal-citation DOCX: article JSON to escaped Pandoc markdown with real footnotes and RTL, built by Pandoc; `pandoc.ts` is the only place Pandoc is spawned |
| `extensions/pi-academic-writer/csl-resolver.ts` / `citation-audit.ts`   | CSL alias/id/URL/path resolution with a project cache, and the deterministic citation-key audit |
| `templates/voice/profile.md`                                            | The empty four-section voice profile template; `academic_writer_read_resource(name: voice_profile_template)` exposes it and setup seeds `.academic-writer/voice/profile.md` from it |
| `extensions/pi-academic-writer/prose-lint.ts` / `academic_writer_lint_prose` | Read-only English prose-pattern linter; emits advisory JSON findings for contextual agent review and does not modify drafts. |
| `extensions/pi-academic-writer/harper.ts` / `academic_writer_proofread` | Harper (`harper.js`) English grammar/spelling linter behind the core proofread tool; lazy per-dialect wasm singleton, advisory findings, fails closed via `ToolFailure`. Hebrew stays with `academic_writer_fix_typography` + the inline הגהה sweep. `academic_writer_write_section` (core-tools) is the writer's only section output path: `articles/<slug>/sections/<sectionId>.md`, validated and atomic. |

## Conventions

- **Profile-scoped**: every skill/agent that touches `.academic-writer/` must check `.academic-writer/profile.md` exists first (or be the `init`/`setup` skill creating it).
- **Thresholds**: package contributors edit the typed default in `extensions/pi-academic-writer/thresholds-default.ts` to change shipped defaults, never inline numbers in skills or agents. Setup asks the researcher which values to use and writes `.academic-writer/thresholds.json` as the project override (see `academic_writer_read_resource` resolution order above) — never tell a researcher to edit the package's own defaults.
- **Strict TypeScript**: `extensions/` must compile under `tsc --noEmit` with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`/`Parameters`, and `verbatimModuleSyntax`; never use `any`. Optional option fields that callers forward from possibly-undefined values are declared `?: T | undefined`.
- **Decode at the boundary**: JSON files, tool arguments and parsed markdown are decoded once with a TypeBox schema (`lib/schema.ts`) into a named type derived with `Static<>`; code past the boundary never uses `typeof` checks, `Record<string, unknown>` or `as` assertions. `mise run lint` runs Vite+ lint with the vendored anti-slop rules in
  `tools/oxlint/anti-slop/`; do not suppress findings.
- **Project paths and writes**: any path that comes from a tool argument goes through `resolveInside(projectRoot, path)` before it is read or written; shared JSON is written with `writeFileAtomic`, and read-modify-write cycles run under `withFileLock`. Tool failures throw `ToolFailure` (via `fail()`), because Pi only sets `isError` when `execute` throws.
- **Skill frontmatter**: `name`, `description`, optional `allowed-tools` (space-delimited), optional `metadata: {author, version}`. No `user-invocable` — every pi skill is both model- and `/skill:name`-invocable.
- **Agent frontmatter**: `name`, `description`, `tools` (comma-delimited for `pi-subagents`), optional `spawns` for OMP nested-agent grants, and optional `allowedAgents` for the pi-subagents equivalent. A restricted nested caller needs `subagent` in its `tools` plus `spawns: <agent>` under OMP and `allowedAgents: <agent>` under pi. Agents are discovered from the pi manifest key `pi.subagents.agents` (a directory list; there is no top-level `pi-subagents` key). Pi MCP visibility grants use `mcp:<server>` or `mcp:<server>/<tool>`; OMP MCP names are resolved at runtime. Omit `model:` to inherit the harness default; override via `subagents.agentOverrides.<name>.model` (pi) or `task.agentModelOverrides.<name>` (OMP).
- **Research notes and outlines**: `.academic-writer/research-notes.json` is the mutable source-linked library; `articles/<slug>.outline.json` is the canonical recursive argument map. Only verified, fresh notes can support approved points. Freeze selected notes to `articles/<slug>.notes.json` with the approval; all section-writing/auditing uses that article-local snapshot. Rendered `.outline.md` is generated, never hand-edited. Migration alone may create claim/reasoning-free `unmapped` draft points with preserved paragraph text. Local-file `sourceId`s are content fingerprints; PDF anchors use zero-based `pdfPageIndex` plus human-readable locator and quoted text.
- **Scoped agent writes**: do not grant generic `write`/`edit` to agents limited to one artifact. Grant the appropriate `academic_writer_write_*` tool instead; its destination is fixed by the extension. This restriction works without an optional permission plugin and under both pi and OMP.
- **No global pollution**: never write to `$HOME` or paths outside the project directory.
- **Citation authoring has two modes, keyed off `citationStyle`**: `inline-parenthetical` (Hebrew default) writes literal styled citation text, unchanged end to end. Every other value is citeproc mode: the writer writes pandoc-markdown citation markers (`[@citeKey, p. N]`, or `[@key1; @key2, p. N]` for co-located citations) resolved at export time by Pandoc's `--citeproc` against `.academic-writer/bibliography.bib` and a resolved CSL file. Popular aliases such as `apa`, `mla`, `chicago`, and `chicago-author-date` map to Zotero/CSL style ids and download/cache on first use; users may also choose any Zotero/CSL repository style id, direct `.csl` URL, or custom `.csl` path. Never invent a `citeKey` — it must come from a `sources.json` record populated by the researcher. Don't reintroduce literal citation text for citeproc styles, and don't apply citeproc markers to `inline-parenthetical` — the two modes are mutually exclusive per article.
- **MCP config belongs to MCP**: never put Zotero API keys, library IDs, NotebookLM tokens, or other MCP server credentials in `.academic-writer/profile.md` or package source. Academic Writer records only tool intent and project scope (`tools.zotero.enabled`, optional `tools.zotero.collection`, `tools.notebooklm.enabled`, optional `tools.notebooklm.notebook`). Runtime MCP server wiring must live in standard MCP config. If a skill scaffolds project-local `.mcp.json`, it must use safe local defaults (`ZOTERO_LOCAL=true`) and warn that secrets belong in user-global MCP config or command interpolation, not a git-tracked project file.
- **Bare MCP tools require direct MCP config**: agents/skills call Zotero (`zotero_get_recent`, `zotero_get_item_fulltext`) and NotebookLM (`notebook_list`, `notebook_query`, `source_add`, `studio_create`) tools by bare name, so configured `zotero` and `notebooklm-mcp` servers must use `settings.toolPrefix: "none"` and per-server `directTools` listing the tools skills call (see `skills/academic-setup/references/integration-setup.md`). Do not reintroduce programmatic `createMcpAdapter({ config: ... })`; that isolated snapshot ignores `.mcp.json` and global MCP config. Under oh-my-pi, these bare names are not called directly — agents/skills resolve the live tool name first via `academic_writer_resolve_mcp_tool` (oh-my-pi exposes MCP tools as `mcp__<server>_<tool>`); the bare names above remain accurate and directly callable under plain pi.
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
| `agents/academic.md` | Plans: thesis options and recursive argument-map outlines; coordinates the writing wave (researcher/writer/editor) when a skill delegates it. |
| `agents/researcher.md` | Explores original sources; maps evidence and gaps before thesis proposal. |
| `agents/writer.md` | Drafts one assigned section from frozen evidence, persists it via `academic_writer_write_section`, and runs the paragraph pipeline. |
| `agents/editor.md` | Audit mode: independent citation hard gate per paragraph. Review mode: whole-article coherence, flow, repetition, and reverse-outline diagnostics. Read-only. |

## Pipeline pattern

The `write` and `edit` skills use a chained-with-gates pattern:

1. Conversational planning phase (the `academic` agent plans; researcher maps evidence; human in the loop).
2. Parallel section writing (one `writer` subagent per section; each persists its section file via `academic_writer_write_section`, the skill assembles).
3. Per-paragraph 8-skill pipeline (draft → 6 checks → editor audit mode as the citation hard gate).
4. Editor review mode (synthesis pass) + self-review scorecard.

DOCX generation branches by citation mode in Step 9 of `write`/`edit`: `inline-parenthetical` still goes through the JSON-schema + `academic_writer_generate_docx` path (RTL/footnote handling); citeproc mode goes through `academic_writer_export_article` with `formats: ["docx"]`, `bibliography: ".academic-writer/bibliography.bib"`, and a resolved `csl` path, so skills do not mutate article markdown with export-only YAML frontmatter. Resolve CSL paths with `academic_writer_resolve_csl`; don't hardcode a closed list beyond the resolver's popular alias map. The citeproc path does not apply Hebrew RTL post-processing — document that limitation when target language is Hebrew.

## Anti-patterns

- Don't inline thresholds — read `thresholds.json`.
- Don't create `.academic-writer/` outside the `academic-setup` skill.
- Don't author skill descriptions that omit "Use when…" trigger phrases.
- Don't use Claude Code conventions (`mcp__server__tool`, `AskUserQuestion`, `WebSearch`, `/academic-writer:<name>` slash commands, `user-invocable`/`allowedTools`/`model` frontmatter) — this package targets pi and oh-my-pi, not Claude Code; oh-my-pi's own `mcp__<server>_<tool>` names are resolved at runtime by `academic_writer_resolve_mcp_tool`, never written by hand.
- Don't move `pi-subagents`/`pi-mcp-adapter`/`pi-web-access`/`@earendil-works/pi-coding-agent` into `dependencies` or `bundledDependencies`: pi loads only resources a package's pi manifest declares, so a bundled copy would register the companions' tools a second time next to the researcher's own installed copy (the `mcp`-tool conflict this package hit once). Keep them `peerDependencies: "*"`, documented as required companion installs in README; lifecycle warns on pi when `subagent` or `web_search` is missing.
- Keep `typebox` and `harper.js` in `dependencies`: the extension imports them at
  runtime. Pi aliases
  `typebox` to its own copy; oh-my-pi does not alias the bare package. Same for `yaml`,
  which parses `.academic-writer/profile.md` frontmatter. Companion harness
  packages remain `peerDependencies` as described above.
