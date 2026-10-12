<!-- Consolidated mode guidance for quick-onboarding.md. -->

# Academic Writer Setup

> **Do NOT use this skill** for source indexing or full style fingerprinting — use `/skill:academic-setup` instead. This is the *quick* setup; init is the deep setup.

Quick onboarding wizard. Creates the researcher profile, detects integrations, and optionally fingerprints writing style. For deeper initialization (full 25-dimension style analysis, source indexing), run `/skill:academic-setup`.

## Phase 0: Preflight

Run silently before anything else:

```bash
mkdir -p past-articles .academic-writer
# If .academic-writer/thresholds.json is missing, call academic_writer_read_resource with name: thresholds, then write that content to .academic-writer/thresholds.json.
```

Call `academic_writer_migrate_profile`, then check for existing profile by calling `academic_writer_get_profile`.

If it returns `ok: true`, load and show current settings, then:

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "A profile already exists. What would you like to do?"
>
> 1. **Update existing profile** — Keep existing data, modify only selected fields.
>
>    ```text
>    Update Mode
>    ───────────
>    ✓ Existing settings preserved
>    → Only re-run steps you choose
>    ```
>
> 2. **Start fresh** — Delete and recreate from scratch.
>
>    ```text
>    Fresh Start
>    ───────────
>    ⚠ Current profile will be replaced
>    → Walk through all steps again
>    ```
>
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

---

**Harness-neutral MCP dispatch:** every bare-named tool call below (any tool name that is not prefixed `academic_writer_`, e.g. `zotero_get_item_fulltext`, `notebook_list`, `get_text`) must be resolved first: call `academic_writer_resolve_mcp_tool({logical_name: "<bare_name>"})` once per distinct bare name per run, then use the returned `live_name` for every subsequent call to that tool this run. If `live_name` is `null`, treat that integration as unavailable for this run (same as today's "if available" gating).

## Phase 1: Detect Integrations

Run ALL detection commands in **one parallel batch**:

- **Zotero**: call `zotero_get_recent(limit=1)`; DETECTED if it returns without an error, NOT_DETECTED otherwise.
- **NotebookLM**: call `notebook_list()`; DETECTED if it returns without an error, NOT_DETECTED otherwise. Also check `command -v nlm`, `command -v notebooklm-mcp`, and `nlm login --check` so you can distinguish missing install/auth from missing MCP config.
- **Sefaria**: check whether bare `get_text` / `search` tools are available; DETECTED only if present. Also check `command -v sefaria-mcp`.

MongoDB Agent Skills is auto-configured silently — do not show it to the user.

---

## Phase 2: Profile Setup

### Field of Study

Ask the researcher, as a free-text prompt (no fixed options — record whatever they say):
> "What is your field of study and area of specialization?"

> "The more specific, the better. Examples: *Early Modern Jewish Philosophy*, *Talmudic Literature*, *Biblical Studies — Pentateuch*"

### Article Language

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "What language will you write your articles in?"
>
> 1. **Hebrew** — RTL, David font, inline-parenthetical citations.
>
>    ```text
>    Hebrew Mode
>    ───────────
>    Direction:  RTL
>    Font:       David 11pt
>    Citations:  (מחבר, כותרת, עמ' N)
>    ```
>
> 2. **English** — LTR, Times New Roman, citeproc/CSL citations.
>
>    ```text
>    English Mode
>    ────────────
>    Direction:  LTR
>    Font:       Times New Roman 12pt
>    Citations:  Any CSL style (popular alias, Zotero/CSL style id, URL, or custom .csl)
>    ```
>
> 3. **Other** — You'll type the language name in the next prompt.
>
>    ```text
>    Other
>    ─────
>    → Type the language name
>    → RTL/LTR auto-detected
>    ```
>
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

### Citation Style

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "Which citation style do you use?"
>
> 1. **Inline Parenthetical (Recommended for Hebrew)** — (Author, Title, Page) in running text.
>
>    ```text
>    Example: (לוי, משנת הנפש, עמ' 42)
>    ```
>
> 2. **Popular citeproc style** — Pick a common style; Academic Writer downloads/caches it from Zotero/CSL on first use.
>
>    ```text
>      apa                  → APA 7th edition
>      mla                  → MLA 9th edition
>      chicago              → Chicago 18 notes + bibliography
>      chicago-author-date  → Chicago 18 author-date
>      turabian             → Turabian notes + bibliography
>      harvard              → Harvard Cite Them Right
>      ieee                 → IEEE
>      nature               → Nature
>      vancouver            → Vancouver
>      ama                  → American Medical Association
>      apsa                 → American Political Science Association
>      asa                  → American Sociological Association
>      mhra                 → Modern Humanities Research Association
>      elsevier-harvard     → Elsevier Harvard
>
>    If none match, choose option 3 or 4.
>    ```
>
> 3. **Zotero/CSL repository style** — style id from <https://www.zotero.org/styles> or <https://github.com/citation-style-language/styles>.
>
>    ```text
>    Examples: nature, chicago-author-date, modern-humanities-research-association
>    ```
>
> 4. **Custom CSL file or URL** — path/URL to a `.csl` file you provide.
>
>    ```text
>    Examples: .academic-writer/csl/my-journal.csl, https://www.zotero.org/styles/apa
>    ```
>
> Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).
>
> Map selection the same way as `/skill:academic-setup`: `inline-parenthetical` stays literal mode; popular aliases, Zotero/CSL repository ids, `.csl` URLs, and custom `.csl` paths are citeproc mode. Validate every citeproc style before saving by calling `academic_writer_resolve_csl` with `style: STYLE_OR_PATH` and `download: true`.

### Tool Selection

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option; multiple selections allowed):
> "Which integrations would you like to enable?"
>
> 1. **Zotero** — ✓ Detected / ✗ Not found
>
>    ```text
>    Zotero
>    ──────────
>    Type:  MCP server (zotero-mcp)
>    What:  Local/cloud reference library
>    Config: standard MCP config (.mcp.json or ~/.config/mcp/mcp.json)
>    Needs: settings.toolPrefix="none" + directTools listing the Zotero tools this package calls
>    ```
>
> 2. **NotebookLM** — ✓ Detected / ✗ Not found
>
>    ```text
>    NotebookLM
>    ──────────
>    Type:  MCP server (notebooklm-mcp) + nlm CLI
>    What:  AI-powered source Q&A,
>           audio overviews, study guides
>
>    Install: uv tool install notebooklm-mcp-cli
>    Auth:    nlm login
>    Config:  standard MCP config (.mcp.json or ~/.config/mcp/mcp.json)
>    Needs:   settings.toolPrefix="none" + directTools listing the NotebookLM tools this package calls
>    ```
>
> 3. **Sefaria** — ✓ Detected / ✗ Not found
>
>    ```text
>    Sefaria
>    ───────
>    Type:  MCP server with bare get_text/search tools
>    What:  Judaic primary text context expansion
>    Config: standard MCP config, no secrets in profile
>    Needs: settings.toolPrefix="none" + directTools=["get_text", "search"]
>    ```
>
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase; multiple selections allowed).

Pre-check tools that were detected. MongoDB Agent Skills is silently included always.

If Zotero is selected but not detected:

- First check whether the binary exists: `command -v zotero-mcp >/dev/null 2>&1 && echo "INSTALLED" || echo "NOT_FOUND"`.
- If the binary is missing, show: `pip install zotero-mcp-server`, then continue after the researcher confirms installation.
- Optional semantic search: `zotero_semantic_search` needs the extras build `pip install "zotero-mcp-server[semantic]"` plus an index build; `zotero_search_items` works without it. Mention this only if the researcher asks about topic/semantic search.
- If the binary exists but `zotero_get_recent(limit=1)` is unavailable/failing because MCP is not configured, explain that Academic Writer uses standard MCP config instead of package-owned environment variables. Offer to scaffold this safe local-mode project `.mcp.json` only if the researcher approves and no `.mcp.json` exists:

  ```json
  {
    "settings": { "toolPrefix": "none" },
    "mcpServers": {
      "zotero": {
        "command": "zotero-mcp",
        "args": ["serve"],
        "env": { "ZOTERO_LOCAL": "true" },
        "directTools": ["zotero_get_recent", "zotero_get_collections", "zotero_get_collection_items", "zotero_get_item_fulltext", "zotero_get_item_metadata", "zotero_get_pdf_outline", "zotero_read_pdf_pages", "zotero_search_items", "zotero_semantic_search", "zotero_get_search_database_status", "zotero_update_search_database"]
      }
    }
  }
  ```

Under oh-my-pi the `settings`/`directTools` keys are ignored and tools appear as `mcp__<server>_<tool>`, which `academic_writer_resolve_mcp_tool` finds; a root `.mcp.json` is a supported portable fallback (omp's primary files are `.omp/mcp.json` and `~/.omp/agent/mcp.json`).

- If `.mcp.json` already exists, never overwrite it. Read it, show the snippet, and tell the researcher to merge the `zotero` block unless the JSON is simple enough to update safely. Do not write API keys into a project file; Zotero web/API credentials belong in user-global MCP config or command interpolation.
- After any MCP server block is added for the first time (yours or the researcher's), call `academic_writer_status` before re-probing: on `harness: pi`, tell the researcher to restart pi (direct MCP tools are cached at startup, so `zotero_get_recent(limit=1)` stays unavailable until the new session starts); on `harness: omp`, run `/mcp reload` instead of restarting.

If NotebookLM is selected but `notebook_list()` is unavailable:

- If `nlm` or `notebooklm-mcp` is missing, show: `uv tool install notebooklm-mcp-cli`, then continue after the researcher confirms installation and runs `nlm login`.
- If the CLI is installed/authenticated but MCP is not configured, offer to scaffold this safe project `.mcp.json` block only if the researcher approves and no `.mcp.json` exists:

  ```json
  {
    "settings": { "toolPrefix": "none" },
    "mcpServers": {
      "notebooklm-mcp": {
        "command": "notebooklm-mcp",
        "directTools": ["notebook_list", "notebook_query", "notebook_create", "source_add", "studio_create", "studio_status"]
      }
    }
  }
  ```

Under oh-my-pi the `settings`/`directTools` keys are ignored and tools appear as `mcp__<server>_<tool>`, which `academic_writer_resolve_mcp_tool` finds; a root `.mcp.json` is a supported portable fallback (omp's primary files are `.omp/mcp.json` and `~/.omp/agent/mcp.json`).

- If `.mcp.json` already exists, never overwrite it. Read it, show the snippet, and tell the researcher to merge the `notebooklm-mcp` block unless the JSON is simple enough to update safely.

If Zotero is enabled and detected, call `zotero_get_collections()` and ask whether to use all library items or one default collection for Academic Writer. If they choose a collection, save `tools.zotero.collection` as `{ "key": "COLLECTION_KEY", "name": "DISPLAY_NAME" }`.

If NotebookLM is enabled and detected, call `notebook_list()` and ask whether to use all notebooks or one default notebook for Academic Writer. If they choose one, save `tools.notebooklm.notebook` as `{ "id": "NOTEBOOK_ID", "name": "DISPLAY_NAME" }`.

Store only collection/notebook identifiers and display names in the profile. Never store API keys, library credentials, or NotebookLM auth tokens.

---

## Phase 2b: Document Appearance

Follow `references/document-style.md` and store the result as `outputFormatPreferences.stylePackage` (leave unset for the shipped default).

---

## Phase 3: Style Fingerprint (Optional)

Check for past articles:

Call `academic_writer_list_project_files` with `kind: "past_articles"` and count the returned `files`.

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "Found N papers in past-articles/. Analyze them for style fingerprinting?"
>
> 1. **Yes, analyze my writing style (Recommended)** — Extracts your voice across 25 dimensions so articles sound like you.
>
>    ```text
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
>
> 2. **Skip for now** — Articles will use generic academic style until you run this.
>
>    ```text
>    Skip
>    ────
>    ⚠ No style fingerprint yet
>    → Add papers to past-articles/ anytime
>    → Re-run: /skill:academic-setup
>    ```
>
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

If no files found, show only the "Skip" option with instructions to add papers.

If "Yes": analyze across all 25 dimensions (sentence level, vocabulary, paragraph structure, tone, transitions, citation style, rhetorical patterns, representative excerpts, article structure). Show fingerprint summary and confirm before saving.

## Phase 4: Save Profile

Use the Write tool to create `.academic-writer/profile.md`:

```markdown
# Academic Writer Profile

---
fieldOfStudy: FIELD
citationStyle: SELECTED_CITATION_STYLE
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
  "zotero": { "enabled": true, "mode": "mcp-config", "collection": { "key": "optional Zotero collection key", "name": "optional display name" } },
  "notebooklm": { "enabled": false, "mode": "mcp-config", "notebook": { "id": "optional NotebookLM notebook id", "name": "optional display name" } }
}
` ` `

## Output Format Preferences

```json
{ "csl": "optional CSL style id or popular alias", "cslPath": "optional custom .csl path or URL" }
` ` `

## Style Fingerprint

```json
null
` ` `

…
` ` `
```

…

…
> | Style fingerprint | ✓ Analyzed / — Skipped |
