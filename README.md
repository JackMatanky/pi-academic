# Pi Academic — Pi and oh-my-pi Package

AI-first academic writing assistant for Humanities researchers. Writes rigorously cited, style-matched articles and exports them as DOCX, ODT, LaTeX, or PDF via Pandoc, with CSL-based citation rendering from a real Zotero- or local-source `bibliography.bib` (popular style aliases, Zotero/CSL repository styles, or custom `.csl` files).

---

## What It Does

- **Writes in your voice** — analyzes your past articles to extract your style, then applies it to new work
- **Guided workflow** — Sources → Evidence cards → Argument → Draft → Review and revise; return to reading or reshape the argument as needed
- **Parallel processing** — all sections written simultaneously for speed
- **Citation-verified** — every claim checked against your source library; nothing fabricated
- **Prose quality checks** — deterministic English pattern findings are advisory; agents review them in context alongside the researcher's style profile.
- **Quality gate** — 6-dimension self-review scorecard before export; score below 40/60 triggers your review
- **Abstract generation** — automatic תקציר with optional dual-language support
- **Session dashboard** — shows profile, article count, tool status, plus active/last run state at startup

---

## Quick Start

### 1. Install Required Companion Packages

Pi Academic delegates subagent orchestration, MCP server wiring, and web search to three community Pi packages. Pi does not auto-load a dependency's own extensions just because it's listed in `package.json` — install these once, globally; every Pi project that uses them reuses the same install:

```bash
pi install npm:pi-subagents
pi install npm:pi-mcp-adapter
pi install npm:pi-web-access
```

### 2. Install the Package

From the folder where you do your research:

```bash
pi install git:github.com/JackMatanky/pi-academic
```

Pi prompts you to trust the project on first run — see [Project Trust](https://pi.dev/docs/latest/settings#project-trust).

**Under oh-my-pi (OMP):**

```bash
omp plugin install github:JackMatanky/pi-academic
```

To work on the package locally, clone it and run `omp install ./pi-academic`.

The package depends on `typebox` and `harper.js` at runtime. Three of the four companion peers
(`pi-subagents`, `pi-mcp-adapter`, `pi-web-access`) are unnecessary under OMP —
it ships native equivalents (`task` subagent dispatch, native MCP discovery,
native `web_search`). Only `@earendil-works/pi-coding-agent` is needed for local
type-checking.

### 3. Initialize Your Profile

```text
/skill:academic-setup
```

One-time setup. You'll be asked for:

- Your field of study
- Citation style (Inline Parenthetical, popular aliases such as APA/MLA/Chicago, a Zotero/CSL style id, or a custom `.csl` file)
- 5–10 past articles for style analysis (place them in `past-articles/`)
- Which integrations to enable

Your profile is saved to `.pi-academic/profile.md` and loaded automatically.

### 4. Write Your First Article

```text
/skill:academic-write
```

### 5. Export to Other Formats (optional)

```text
/skill:academic-export
```

Converts an audited article to DOCX, ODT, LaTeX (`.tex`), or PDF; project-local style packages configure document appearance independently from CSL citation style.

---

### Project-local document styles

Appearance is independent of author voice and CSL citations. Set the profile's `outputFormatPreferences.stylePackage` to a directory name under `.pi-academic/styles/`; each package has a matching version-1 `design.json` and optional native assets. The shipped starters (`academic-default`, plus `apa-7`, `mla-9`, and `chicago` encoding those styles' formatting conventions) are defined in the package and generated on install; `pi_academic_style_package` with `action: "install-starter"` writes one into the project and never overwrites an existing package.

`design.json` defines page size/orientation/margins and component properties for title/subtitle, abstract, body, six heading levels, block quotes, footnotes, bibliography, tables, captions, headers/footers, page numbers, and code. Properties you omit are merged from the shipped starter. Supported properties are limited to font family/size, emphasis, alignment, color/shading, spacing/line spacing, indents, keep-with-next, page breaks, and table borders/cell padding. Each format applies what it can: `pi_academic_export_article` and `pi_academic_style_package` report every property you changed that a format cannot express (for example ODT table borders, LaTeX table header rows, and LaTeX heading level six) instead of dropping it silently. Components left at the starter's values never produce warnings.
LaTeX follows Pandoc's emitted heading levels (level six is omitted), and any explicitly selected font must be installed and discoverable by the PDF TeX engine; a missing font falls back to the TeX default. These are renderer/toolchain limits, not silent style fallbacks.

Optional format assets use relative package-local paths: `formats.docx.referenceDocument` and `formats.odt.referenceDocument` point to native reference files; `formats.latex.template`, `formats.latex.preamble`, `formats.pdf.template`, and `formats.pdf.preamble` point to TeX files. PDF uses PDF-specific TeX assets first, then shared LaTeX assets; `formats.pdf.engine` may select `xelatex` or `tectonic`. Native references are authoritative for their format and validated at export. An invalid package fails that format rather than silently dropping styling. Export supports DOCX, ODT, LaTeX, and PDF only; PDF requires an installed TeX engine.

Run `/skill:academic-setup` to select or install a package (the starter ships with editable native Word, LibreOffice, and LaTeX files under `native/`) and `/skill:academic-export` to choose outputs or make a one-export package override. The `pi_academic_generate_docx` generator, which writes real Word footnotes and right-to-left text for literal-citation articles, uses the same profile package. `pi_academic_style_package` lists, installs the starter, and validates a package for every format, reporting what each format cannot express.

The literal-citation DOCX path creates missing output directories and retains
footnotes even when a supplied `after` anchor no longer matches the paragraph;
unmatched notes attach at the current position rather than disappearing.

## Writing Workflow

**The workflow follows the researcher's decisions:**

1. **Sources:** choose relevant local files and, optionally, Zotero materials.
2. **Evidence cards:** review exact source-backed quotations, paraphrases, or summaries; correct or exclude each item. Candidates remain unverified until explicitly confirmed.
3. **Argument:** review a readable outline showing each section's purpose and each point's claim, reasoning, and evidence role. Approve the thesis and outline before the article's evidence snapshots are frozen.
4. **Draft:** sections are written from those frozen, article-specific evidence bundles. Later source additions do not silently change them.
5. **Review and revise:** review citation-audit results and the `pi_academic_reverse_outline` paragraph index. Return to sources or revise the argument when needed; edits preserve unrequested text.

Local files work without Zotero; Zotero is optional and preferred when enabled. Structured notes, canonical outline data, and article-local snapshots remain internal sources of truth.
The `notesJson`, `outlineJson`, `sourcesJson`, and `fieldsJson` tool parameters accept structured arrays or objects, not serialized JSON strings. `pi_academic_generate_docx` accepts markdown or article JSON input; `evidenceMapJson` remains serialized text for advisory diagnosis.
Substantive reviewers use those units to infer paragraph roles, evidence, and explanation, and raise repetition, support, missing analysis, or abrupt transitions as tentative questions—not automatic verdicts. The tool itself makes no semantic judgments and does not rewrite or persist results.

For English prose, the `pi_academic_lint_prose` tool reports deterministic, advisory surface-pattern findings for contextual review. It does not rewrite text, judge authorship, or prove quality.

`/skill:academic-import` converts a Word `.docx` into a Pandoc markdown article with its footnotes (`pi_academic_import_docx`; Word highlights can be kept or stripped). In a citeproc style, `pi_academic_relink_citations` then matches footnoted citations to `.pi-academic/sources.json` by author surname and title, turning notes that contain only citations into inline `[@key, p. N]` markers and rewriting citations inside longer notes. It never guesses between two records, never drops a page locator, and reports every citation it could not match; run without `apply` first for a report.

Cross-references between notes ("See note 19 above") use a Pandoc-syntax anchor and link (`[]{#fn-name}` and `[](#fn-name)`) that export resolves to the note's final number, counting notes citeproc builds. The Word import converts the literal form, relink carries anchors through, and the citation audit fails on a link without an anchor or a duplicate anchor and warns about literal note numbers left in the text.

In citeproc mode, export starts the bibliography on a new page (DOCX, ODT, PDF) and gives it the heading its citation style prescribes (References, Works Cited, Bibliography). CSL files carry no such title, so the package supplies it from a small table; an article's own `reference-section-title`, an existing heading, or a non-English `lang` takes precedence.

`pi_academic_diagnose_outline` adds read-only advisory checks for required argument fields and note-link resolution/freshness at outline review; it never approves an outline or judges argument quality.

`pi_academic_reverse_outline({article})` returns exact heading/paragraph units with source line ranges and mechanically detected Pandoc citation markers. Use it as an index for substantive review, not as an automated assessment; the reviewer supplies all role, support, and progression judgments. It ignores fenced code and does not modify the article.
For cross-book assignments, `pi_academic_diagnose_outline` accepts the researcher's evidence map as optional `evidenceMapJson`; chapter coverage belongs to that separate map, not the canonical outline schema. It checks the coverage structure, status/reason requirements, evidence-ID resolution, and completeness from chapter 1 through each verified `chapter_counts` boundary. A malformed coverage declaration or missing/invalid chapter count produces an advisory finding; absent coverage remains optional.

### Check ownership and authority

| Check or decision                                                                          | Status                                                 | Authoritative input and caller                                                                   | Coverage                                          | Consequence                                                                                            |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Research-note eligibility and outline structure/link freshness                             | Decisive                                               | Research-note library, source identities, canonical article outline; write/review/snapshot tools | Research-note/outline runtime tests               | Invalid, unchecked, stale, or unresolved evidence cannot enter an approved snapshot.                   |
| Frozen section evidence and citation-key/mode audit                                        | Decisive for recorded structure and citation integrity | Article-local note snapshot, article text, source registry, bibliography; writer and export      | Research-note bundle and citation-audit tests     | Export is blocked for failed citation audit; audit does not prove the cited source supports the prose. |
| Export completion                                                                          | Decisive per requested format                          | Pandoc result plus existence of the requested output artifact; export tool                       | `test_export_passes_citeproc_options_to_pandoc`   | A zero-exit process without an output file is reported as failure for that format.                     |
| Outline diagnostics, reverse outline, and prose lint                                       | Advisory                                               | Current outline/article text; orchestrator and substantive reviewers                             | Diagnostic, reverse-outline, and prose-lint tests | Findings guide review; they do not approve or reject the argument or prose.                            |
| Claim support, scholarly validity, argument quality, author voice, and researcher approval | Not automated                                          | Original sources, researcher judgment, and contextual agent review                               | Not established by mechanical tests               | Require human/agent evaluation; tool output is not evidence of correctness.                            |

---

## Research Notes and Outlines

The writing workflow uses source-linked research notes and an article-specific argument map rather than a separate evidence-ownership registry:

- `pi_academic_ingest_sources` extracts PDF, DOCX, Markdown, and text files under `.pi-academic/sources/`. Local source identity is derived from a SHA-256 fingerprint of file content; PDF text remains associated with its zero-based page index. Zotero remains optional. Zotero source IDs use `zotero:<libraryId>:<itemKey>`; local evidence notes bind to the ingested content fingerprint.
- `pi_academic_write_research_notes` stores atomic source-backed notes in `.pi-academic/research-notes.json`; each can carry a passage quote, human-readable locator, tags, and a review state. Only verified quotation, paraphrase, and synthesis notes may support an approved outline; analysis, question, and idea notes are never citation evidence.
- `pi_academic_write_outline` validates the recursive argument map in `articles/<slug>.outline.json`: sections explain their contribution to the thesis; argument points identify claims, reasoning, and explicit primary/reference note uses. A note has one primary use in an article; further uses are references.
- After approval, `pi_academic_snapshot_notes` freezes the outline's selected verified evidence in `articles/<slug>.notes.json`. `pi_academic_query_research` returns a section bundle from that frozen snapshot, so later edits to the project note library do not rewrite an article's evidence base.
- `pi_academic_render_outline` produces a generated `articles/<slug>.outline.md` view. Edit the JSON source of truth, not the generated Markdown. `pi_academic_migrate_article_outline` creates a draft map from an existing article without changing the article text; only migration may create claim/reasoning-free `unmapped` points containing preserved draft text.

`pi_academic_review_research_notes` is an explicit researcher review action. Unchecked, stale, missing, or unmapped evidence cannot pass outline approval.

---

## Commands

Skills are directly invocable; use natural-language requests or these commands:

| Command                    | Purpose                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `/skill:academic-write`    | Frame a research question or write a new article                                          |
| `/skill:academic-research` | Investigate a topic or fact-check sources without starting an article                     |
| `/skill:academic-edit`     | Edit an article, including one-section and structural-edit modes                          |
| `/skill:academic-review`   | Substantive review or mechanical proofread mode                                           |
| `/skill:academic-setup`    | Quick/full onboarding, profile-field updates, or integration maintenance                  |
| `/skill:academic-voice`    | Refresh corpus-derived style or interview, calibrate, audit, and recompress voice profile |
| `/skill:academic-feedback` | Apply researcher feedback to article and profile patterns                                 |
| `/skill:academic-health`   | Diagnose profile, integrations, source index, and export readiness                        |
| `/skill:academic-export`   | Export a finished article to additional formats                                           |
| `/skill:academic-import`   | Import a Word .docx, with footnotes, into a Pandoc markdown article                       |
| `/skill:academic-present`  | Create presentation and submission deliverables                                           |
| `/skill:academic-help`     | Explore commands and package workflows                                                    |

## Integrations

All integrations are optional. Choose which to enable during `/skill:academic-setup`.

| Tool              | What it does                                                                         | Setup                                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Local sources** | Project-local PDFs, DOCX, Markdown, or text without Zotero                           | Put files in `.pi-academic/sources/`; Pi Academic ingests them with `pi_academic_ingest_sources` and generates citekeys/BibTeX.                                                                                          |
| **Zotero**        | Preferred reference manager for source PDFs (local library or web API)               | [github.com/54yyyu/zotero-mcp](https://github.com/54yyyu/zotero-mcp) — install `zotero-mcp-server`, then configure the `zotero` MCP server in standard MCP config (`.mcp.json` or `~/.config/mcp/mcp.json`)                          |
| **NotebookLM**    | AI-powered source Q&A, audio overviews, study guides                                 | [github.com/jacob-bd/notebooklm-mcp-cli](https://github.com/jacob-bd/notebooklm-mcp-cli) — install `notebooklm-mcp-cli`, run `nlm login`, then configure the `notebooklm-mcp` MCP server in standard MCP config                      |
| **Sefaria**       | Optional Judaic primary text lookup and verse context expansion                      | Configure a Sefaria MCP server with bare direct tools (`toolPrefix: "none"`, `directTools` listing `get_text` and `search`); no credentials go in `.pi-academic/profile.md`.                                                     |
| **Pandoc**        | DOCX/ODT/LaTeX/PDF export and citeproc rendering for downloaded or custom CSL styles | [pandoc.org/installing.html](https://pandoc.org/installing.html) — PDF needs a Unicode-capable TeX engine too: Tectonic (`brew install tectonic`) or XeLaTeX (`brew install --cask basictex && sudo tlmgr install collection-xetex`) |

This package doesn't hardcode a specific model provider for prose drafting — pi already gives you that choice. To run the `writer` (or any other agent) on a specific model, pin `subagents.agentOverrides.<agent-name>.model` in your pi settings. Under omp use `task.agentModelOverrides.<agent-name>` or a `@role` alias; the editor's audit mode benefits most from a strong model.

**Citation styles:** Inline Parenthetical (Hebrew academic default) is written as literal styled text, unchanged regardless of export format. Every other citation style uses citeproc: the writer emits `[@citeKey]` references, Pandoc renders them with a CSL file, and article-local `articles/<slug>.bibliography.bib` is used first, falling back to `.pi-academic/bibliography.bib`. The resolver accepts popular aliases (`apa`, `mla`, `chicago`, `chicago-author-date`, `nature`, `ieee`, etc.), any style id from [Zotero](https://www.zotero.org/styles) / [citation-style-language/styles](https://github.com/citation-style-language/styles), direct `.csl` URLs, or a custom `.csl` file, then caches downloads in `.pi-academic/csl/`.

**Scoped libraries:** During setup or `/skill:academic-setup`, you can set a default Zotero collection, NotebookLM notebook, and Sefaria enabled/disabled state for the project. Pi Academic stores only the collection/notebook id and display name in `.pi-academic/profile.md`; credentials stay in MCP config.

**MCP configuration:** Pi Academic does not store MCP server credentials in `.pi-academic/profile.md` and does not require shell-exported environment variables. MCP servers are read from the harness's normal MCP config stack (pi: `.mcp.json`, `.pi/mcp.json`, `~/.config/mcp/mcp.json`; omp: `.omp/mcp.json`, `~/.omp/agent/mcp.json`, plus a root `.mcp.json`). Local Zotero, NotebookLM, and Sefaria setups can use this project-local `.mcp.json` (safe to commit only if it contains no secrets):

```json
{
  "settings": { "toolPrefix": "none" },
  "mcpServers": {
    "zotero": {
      "command": "zotero-mcp",
      "args": ["serve"],
      "env": { "ZOTERO_LOCAL": "true" },
      "directTools": [
        "zotero_get_recent",
        "zotero_get_collections",
        "zotero_get_collection_items",
        "zotero_get_item_fulltext",
        "zotero_get_item_metadata",
        "zotero_get_pdf_outline",
        "zotero_read_pdf_pages",
        "zotero_search_items",
        "zotero_semantic_search",
        "zotero_get_search_database_status",
        "zotero_update_search_database"
      ]
    },
    "notebooklm-mcp": {
      "command": "notebooklm-mcp",
      "directTools": [
        "notebook_list",
        "notebook_query",
        "notebook_create",
        "source_add",
        "studio_create",
        "studio_status"
      ]
    },
    "sefaria": {
      "command": "sefaria-mcp",
      "directTools": ["get_text", "search"]
    }
  }
}
```

For Zotero web/API mode, keep secrets in user-global MCP config (`~/.config/mcp/mcp.json`) or use command interpolation (for example macOS Keychain via `!security ...`) instead of writing API keys into a git-tracked project file. If you prefer shell env vars, MCP config still supports `${ZOTERO_API_KEY}` / `${ZOTERO_LIBRARY_ID}` interpolation.

---

## File Structure (Your Project)

```text
your-research-folder/
├── past-articles/              ← Drop your published papers here (PDFs or DOCXs)
├── articles/                   ← Output Markdown, DOCX, and exports
└── .pi-academic/
    ├── profile.md               ← Your profile (auto-created)
    ├── voice/                   ← Voice profile (profile.md), mining state
    ├── sources/                 ← Optional local PDFs/DOCX/MD/TXT sources
    ├── sources.json             ← Current-run source registry/cache
    ├── bibliography.bib         ← Current-run BibTeX cache; articles keep frozen copies beside each draft
    ├── csl/                     ← Cached/downloaded or custom CSL files for citeproc export
    ├── research-brief.md        ← Output from /skill:academic-write
    ├── styles/                  ← Project-local document style packages
    └── runs/                    ← Active/last run state shown in the dashboard
```

---

## Troubleshooting

**"No profile found"** — run `/skill:academic-setup` first.

**"Old .academic-writer/ data"**: the package was formerly named `academic-writer`; `.academic-writer/` directories are not read. Run `/skill:academic-setup` to create `.pi-academic/`.

**"Zotero not detected"** — install the server and make sure a `zotero` MCP server is configured:

```bash
pip install zotero-mcp-server
```

For local Zotero, add the `.mcp.json` snippet from the Integrations section. Zotero desktop must be running with the local API enabled (Settings → Advanced). The `zotero` server must expose direct bare tools (`settings.toolPrefix: "none"` plus `directTools` listing the tools this package calls) because the package calls tools like `zotero_get_recent` directly.

**Articles won't export to .docx / .odt** — install [Pandoc](https://pandoc.org) (`brew install pandoc`). Every DOCX, ODT, LaTeX, and PDF export, and the literal-citation DOCX generator, run through it.

**PDF export fails / "xelatex not found" or "tectonic not found"** — install one supported PDF engine:

```bash
brew install tectonic
# or:
brew install --cask basictex
sudo tlmgr install collection-xetex
```

ODT/LaTeX export via `/skill:academic-export` needs Pandoc; PDF also needs a Unicode-capable TeX engine (use Tectonic or XeLaTeX). DOCX uses the selected reference style package on both export paths.

**Package behaves strangely after an update** — reinstall it:

```bash
pi remove git:github.com/JackMatanky/pi-academic
pi install git:github.com/JackMatanky/pi-academic
```

---

## For Developers

Skills (`skills/`), agents (`agents/`), and extensions (`extensions/`) are the package source — there is no separate build step that generates them; pi loads them directly via convention directories.

With [mise](https://mise.jdx.dev) (recommended — pins the toolchain, including Node 26, Taplo, and Vite+):

```bash
mise install           # provisions tools and npm-installs both trees
mise run fmt           # Vite+ formats TS/JS/JSON/YAML; Taplo formats TOML
mise run lint          # formatting checks + Vite+ anti-slop lint + strict TS
mise run test          # Vitest suite through Vite+
mise run ci            # lint + test
mise run install-hooks # install hk-managed pre-commit/pre-push hooks
```

Without mise:

```bash
npm install && npm --prefix extensions install  # dependencies + local Vite+
npx vp fmt --check "**/*.{ts,js,json,yml,yaml}" && taplo check mise.toml
npx vp lint extensions && npm run typecheck     # lint + strict TS check
npm test                                        # Vitest via vp test; PDF also needs xelatex/tectonic
```

**Versioning is automatic.** Every push to `main` triggers CI that bumps the patch version in `package.json`, tags the release, and creates a GitHub Release. Do not bump versions manually.

---

## Acknowledgements

This is a fork of [yodem/academic-writer](https://github.com/yodem/academic-writer)
by Yotam Fromm — the original Claude Code plugin this package is built on.
All core skills, agents, and the citation-verification pipeline originate there;
this fork distributes it as a [pi package](https://pi.dev/docs/latest/packages)
that also runs under oh-my-pi, and replaces the Candlekeep integration with Zotero MCP.

Under pi, the integration depends on three community packages by [Nico Bailon](https://github.com/nicobailon), without which this package's subagent, MCP, and web-search architecture would not be possible:

- [pi-subagents](https://github.com/nicobailon/pi-subagents) — subagent orchestration, replacing Claude Code's `Agent`/Task tool and `agents/*.md` loading.
- [pi-mcp-adapter](https://github.com/nicobailon/pi-mcp-adapter) — MCP server wiring, replacing `plugin.json`'s `mcpServers` key.
- [pi-web-access](https://github.com/nicobailon/pi-web-access) — the `web_search` tool used by the editor's (audit mode) external-verification check.

Source-library access is provided by [zotero-mcp](https://github.com/54yyyu/zotero-mcp) (54yyyu), replacing the original Candlekeep integration.

Multi-format export and citation-style rendering use [Pandoc](https://pandoc.org) and CSL style files. The CSL resolver downloads and caches styles from [Zotero](https://www.zotero.org/styles) / [citation-style-language/styles](https://github.com/citation-style-language/styles), maps popular aliases to canonical style ids, and resolves custom `.csl` paths or direct `.csl` URLs.

---

## License

MIT

## Support

- Package issues: [github.com/JackMatanky/pi-academic](https://github.com/JackMatanky/pi-academic)
- Zotero MCP: [github.com/54yyyu/zotero-mcp](https://github.com/54yyyu/zotero-mcp)
