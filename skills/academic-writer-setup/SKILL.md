---
name: academic-writer-setup
description: "First-time setup for Academic Writer — creates researcher profile, detects integrations, analyzes writing style from past articles. Use for a quick onboarding (faster than init); does not include source indexing."
allowed-tools: bash read write find grep academic_writer_read_resource academic_writer_resolve_csl academic_writer_migrate_profile academic_writer_get_profile academic_writer_list_project_files
metadata: {author: "Yotam Fromm", version: "0.2.19"}
---

# Academic Writer Setup

> **Do NOT use this skill** for source indexing or full style fingerprinting — use `/skill:academic-writer-init` instead. This is the *quick* setup; init is the deep setup.

Quick onboarding wizard. Creates the researcher profile, detects integrations, and optionally fingerprints writing style. For deeper initialization (full 25-dimension style analysis, source indexing), run `/skill:academic-writer-init`.

## Phase 0: Preflight

Run silently before anything else:

```bash
mkdir -p past-articles .academic-writer .academic-writer/logs
# If .academic-writer/thresholds.json is missing, call academic_writer_read_resource with name: thresholds, then write that content to .academic-writer/thresholds.json.
```

Call `academic_writer_migrate_profile`, then check for existing profile by calling `academic_writer_get_profile`.

If it returns `ok: true`, load and show current settings, then:

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "A profile already exists. What would you like to do?"
> 1. **Update existing profile** — Keep existing data, modify only selected fields.
>    ```
>    Update Mode
>    ───────────
>    ✓ Existing settings preserved
>    → Only re-run steps you choose
>    ```
> 2. **Start fresh** — Delete and recreate from scratch.
>    ```
>    Fresh Start
>    ───────────
>    ⚠ Current profile will be replaced
>    → Walk through all steps again
>    ```
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

---

## Phase 1: Detect Integrations

Run ALL detection commands in **one parallel batch**:

- **Zotero**: call `zotero_get_recent(limit=1)`; DETECTED if it returns without an error, NOT_DETECTED otherwise.
- **NotebookLM**: call `notebook_list()`; DETECTED if it returns without an error, NOT_DETECTED otherwise. Also check `command -v nlm`, `command -v notebooklm-mcp`, and `nlm login --check` so you can distinguish missing install/auth from missing MCP config.

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
> 1. **Hebrew** — RTL, David font, inline-parenthetical citations.
>    ```
>    Hebrew Mode
>    ───────────
>    Direction:  RTL
>    Font:       David 11pt
>    Citations:  (מחבר, כותרת, עמ' N)
>    ```
> 2. **English** — LTR, Times New Roman, citeproc/CSL citations.
>    ```
>    English Mode
>    ────────────
>    Direction:  LTR
>    Font:       Times New Roman 12pt
>    Citations:  Any CSL style (bundled APA/MLA/Chicago, CSL repository id, or custom .csl)
>    ```
> 3. **Other** — You'll type the language name in the next prompt.
>    ```
>    Other
>    ─────
>    → Type the language name
>    → RTL/LTR auto-detected
>    ```
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

### Citation Style

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "Which citation style do you use?"
> 1. **Inline Parenthetical (Recommended for Hebrew)** — (Author, Title, Page) in running text.
>    ```
>    Example: (לוי, משנת הנפש, עמ' 42)
>    ```
> 2. **Bundled citeproc style** — packaged CSL defaults: Chicago, MLA, or APA.
>    ```
>    Examples:
>      chicago → Chicago notes + bibliography
>      mla     → Modern Language Association
>      apa     → American Psychological Association
>    ```
> 3. **CSL repository style** — style id from https://github.com/citation-style-language/styles.
>    ```
>    Examples: nature, chicago-author-date, modern-humanities-research-association
>    ```
> 4. **Custom CSL file** — path to a `.csl` file you provide.
>    ```
>    Example: .academic-writer/csl/my-journal.csl
>    ```
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

Map selection the same way as `/skill:academic-writer-init`: `inline-parenthetical` stays literal mode; bundled aliases (`chicago`, `mla`, `apa`), CSL repository ids, and custom `.csl` paths are citeproc mode. Validate every citeproc style before saving by calling `academic_writer_resolve_csl` with `style: STYLE_OR_PATH` and `download: true`.

### Tool Selection

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option; multiple selections allowed):
> "Which integrations would you like to enable?"
> 1. **Zotero** — ✓ Detected / ✗ Not found
>    ```
>    Zotero
>    ──────────
>    Type:  MCP server (zotero-mcp)
>    What:  Local/cloud reference library
>    Config: standard MCP config (.mcp.json or ~/.config/mcp/mcp.json)
>    Needs: settings.toolPrefix="none" + directTools=true
>    ```
> 2. **NotebookLM** — ✓ Detected / ✗ Not found
>    ```
>    NotebookLM
>    ──────────
>    Type:  MCP server (notebooklm-mcp) + nlm CLI
>    What:  AI-powered source Q&A,
>           audio overviews, study guides
>
>    Install: uv tool install notebooklm-mcp-cli
>    Auth:    nlm login
>    Config:  standard MCP config (.mcp.json or ~/.config/mcp/mcp.json)
>    Needs:   settings.toolPrefix="none" + directTools=true
>    ```
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase; multiple selections allowed).

Pre-check tools that were detected. MongoDB Agent Skills is silently included always.

If Zotero is selected but not detected:
- First check whether the binary exists: `command -v zotero-mcp >/dev/null 2>&1 && echo "INSTALLED" || echo "NOT_FOUND"`.
- If the binary is missing, show: `pip install zotero-mcp-server`, then continue after the researcher confirms installation.
- If the binary exists but `zotero_get_recent(limit=1)` is unavailable/failing because MCP is not configured, explain that Academic Writer uses standard MCP config instead of package-owned environment variables. Offer to scaffold this safe local-mode project `.mcp.json` only if the researcher approves and no `.mcp.json` exists:
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
- If `.mcp.json` already exists, never overwrite it. Read it, show the snippet, and tell the researcher to merge the `zotero` block unless the JSON is simple enough to update safely. Do not write API keys into a project file; Zotero web/API credentials belong in user-global MCP config or command interpolation.

If NotebookLM is selected but `notebook_list()` is unavailable:
- If `nlm` or `notebooklm-mcp` is missing, show: `uv tool install notebooklm-mcp-cli`, then continue after the researcher confirms installation and runs `nlm login`.
- If the CLI is installed/authenticated but MCP is not configured, offer to scaffold this safe project `.mcp.json` block only if the researcher approves and no `.mcp.json` exists:
  ```json
  {
    "settings": { "toolPrefix": "none" },
    "mcpServers": {
      "notebooklm-mcp": {
        "command": "notebooklm-mcp",
        "directTools": true
      }
    }
  }
  ```
- If `.mcp.json` already exists, never overwrite it. Read it, show the snippet, and tell the researcher to merge the `notebooklm-mcp` block unless the JSON is simple enough to update safely.

---

## Phase 3: Style Fingerprint (Optional)

Check for past articles:

Call `academic_writer_list_project_files` with `kind: "past_articles"` and count the returned `files`.

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "Found N papers in past-articles/. Analyze them for style fingerprinting?"
> 1. **Yes, analyze my writing style (Recommended)** — Extracts your voice across 25 dimensions so articles sound like you.
>    ```
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
> 2. **Skip for now** — Articles will use generic academic style until you run this.
>    ```
>    Skip
>    ────
>    ⚠ No style fingerprint yet
>    → Add papers to past-articles/ anytime
>    → Re-run: /skill:academic-writer-init
>    ```
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
  "zotero": { "enabled": true, "mode": "local" },
  "notebooklm": { "enabled": false }
}
` ` `

## Output Format Preferences

```json
{ "csl": "optional CSL repository id or bundled alias", "cslPath": "optional custom .csl path" }
` ` `

## Style Fingerprint

```json
null
` ` `

## Sources

```json
[]
` ` `
```

(Replace backtick triplets with actual ` ``` ` when writing the file.)



---

## Completion

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "Setup complete. What would you like to do next?"
> 1. **Write my first article** — /skill:academic-writer-write. Start the writing pipeline now.
>    ```
>    /skill:academic-writer-write
>    ────────────────
>    Conversational pipeline:
>    subject → sources → thesis
>    → outline → write → .docx
>    ```
> 2. **Run deeper initialization** — /skill:academic-writer-init. Full style analysis (25 dimensions) and source indexing.
>    ```
>    /skill:academic-writer-init
>    ─────────────────────
>    → Deep 25-dimension fingerprint
>    → Article structure analysis
>    → Zotero source indexing
>    ```
> 3. **Done for now** — Profile saved. Run /skill:academic-writer-write anytime.
>    ```
>    Key commands:
>      /skill:academic-writer-write         ← write
>      /skill:academic-writer-health  ← check
>      /skill:academic-writer-update-tools ← change tools
>    ```
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

Show summary table:

> | Setting | Value |
> |---------|-------|
> | Field | [field] |
> | Language | [language] |
> | Citation style | [style] |
> | Tools enabled | [list] |
> | Style fingerprint | ✓ Analyzed / — Skipped |
