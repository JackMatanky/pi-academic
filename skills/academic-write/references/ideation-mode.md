<!-- Consolidated mode guidance for ideation-mode.md. -->

# Academic Writer — Research Ideation

Guided ideation flow that helps researchers formulate strong research questions before writing.

## Load Profile

Call `academic_writer_get_profile`.

If it returns `ok: false`, tell the researcher to run `/skill:academic-setup` first.

Use returned `fieldOfStudy`, `targetLanguage`, and `tools` configuration.

## Step 1: Topic Exploration

Ask the researcher, as a free-text prompt (no fixed options — record whatever they say):

> "What topic or area are you thinking about exploring? This can be vague — we'll sharpen it together."

Show examples relevant to their `fieldOfStudy`:

> "Examples:
>
> - A specific text or passage you've been thinking about
> - A debate in your field you want to contribute to
> - A concept that seems under-explored
> - Something you noticed in your sources that doesn't fit existing explanations"

---

## Step 2: 5W1H Brainstorming

Apply the 5W1H framework to the topic. Generate questions in `targetLanguage`:

| Dimension        | Question                                              | Purpose                    |
| ---------------- | ----------------------------------------------------- | -------------------------- |
| **What** (מה)    | What is the phenomenon, text, or concept?             | Define the object of study |
| **Who** (מי)     | Who are the key figures, authors, or communities?     | Identify actors            |
| **When** (מתי)   | What is the historical period or textual dating?      | Temporal context           |
| **Where** (איפה) | What is the geographic, cultural, or textual context? | Spatial/contextual frame   |
| **Why** (למה)    | Why does this matter? Why now?                        | Significance and urgency   |
| **How** (כיצד)   | How does this work? How was it received/transmitted?  | Mechanism or process       |

Present the brainstorm:

> "Here's a 5W1H exploration of your topic:
>
> **What:** [...]
> **Who:** [...]
> **When:** [...]
> **Where:** [...]
> **Why:** [...]
> **How:** [...]
>
> Which angles interest you most?"

---

## Step 3: Gap Analysis

**Harness-neutral MCP dispatch:** every bare-named tool call below (any tool name that is not prefixed `academic_writer_`, e.g. `zotero_get_item_fulltext`, `notebook_list`, `get_text`) must be resolved first: call `academic_writer_resolve_mcp_tool({logical_name: "<bare_name>"})` once per distinct bare name per run, then use the returned `live_name` for every subsequent call to that tool this run. If `live_name` is `null`, treat that integration as unavailable for this run (same as today's "if available" gating).

If Zotero is enabled, scan `tools.zotero.collection` when configured; otherwise scan the researcher's library by calling `zotero_get_recent(limit=100)` or listing collection items.

For each source, check its metadata against the topic:

- What has been written about this topic in the researcher's sources?
- What perspectives or arguments are represented?
- What's missing — which angles are NOT covered?

Present the gap analysis:

> "Based on your source library:
>
> **Covered ground:**
>
> - [Source A] addresses [aspect X]
> - [Source B] discusses [aspect Y]
>
> **Gaps I identified:**
>
> - No source addresses [aspect Z]
> - The relationship between [X] and [Y] is unexplored
> - [Historical period / figure / concept] is mentioned but never analyzed
>
> These gaps could be fertile ground for a research question."

---

## Step 4: Approach Framing

Present Humanities-appropriate research approaches:

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):

> "What kind of study fits your topic best?"
>
> 1. **Textual Analysis** — Close reading of a specific text or corpus
>
>    ```text
>    Focus: One or more primary texts
>    Method: Close reading, literary/philological analysis
>    Output: New interpretation or reading
>    Best for: Discovering meaning in texts
>    ```
>
> 2. **Comparative Study** — Comparing two or more texts, figures, or traditions
>
>    ```text
>    Focus: Two+ texts, thinkers, or traditions
>    Method: Systematic comparison on defined axes
>    Output: Reveals connections or tensions
>    Best for: Cross-cultural or cross-period analysis
>    ```
>
> 3. **Historical Survey** — Tracing the development of an idea, practice, or text over time
>
>    ```text
>    Focus: An idea or practice across time
>    Method: Chronological analysis with sources
>    Output: Developmental narrative
>    Best for: Showing change over time
>    ```
>
> 4. **Conceptual Analysis** — Analyzing a philosophical, theological, or cultural concept
>
>    ```text
>    Focus: A concept or term
>    Method: Definition, usage mapping, critical analysis
>    Output: Clarified or redefined concept
>    Best for: Philosophical and theological work
>    ```
>
> 5. **Reception History** — How a text or idea was received, interpreted, and transformed
>
>    ```text
>    Focus: How a text was read across generations
>    Method: Track interpretive traditions
>    Output: Map of readings and their contexts
>    Best for: Exegetical and hermeneutical studies
>    ```
>
> 6. **Other** — Describe your own approach
>    Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

---

## Step 5: Research Question Formulation

Based on the topic, gaps, and approach, propose 3 structured research questions in `targetLanguage`:

For each question, provide:

1. **The question** — clear, specific, answerable
2. **Thesis direction** — what the likely argument would be
3. **Key sources** — which of the researcher's sources are most relevant
4. **Feasibility** — can this be answered with available sources?

Present and ask:

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):

> "Here are three research questions I've formulated. Which one excites you?"
>
> 1. **Question 1** — SHORT_SUMMARY_1
> 2. **Question 2** — SHORT_SUMMARY_2
> 3. **Question 3** — SHORT_SUMMARY_3
> 4. **I want to refine one** — Tell me which to adjust
> 5. **None — let me describe my own** — Free-text input
>    Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

---

## Step 6: Generate Research Brief

Write a `research-brief.md` file that feeds directly into `/skill:academic-write`:

```bash
mkdir -p .pi-academic
```

Use the `Write` tool to create `.pi-academic/research-brief.md`:

```markdown
# Research Brief

## Research Question

[The approved question]

## Thesis Direction

[Preliminary thesis statement]

## Approach

[Selected methodology]

## Key Sources

1. [Source with ID] — relevance
2. [Source with ID] — relevance
3. ...

## Gap This Addresses

[What's missing in existing scholarship]

## Scope

- Estimated sections: [N]
- Primary texts: [list]
- Secondary literature: [list]

## 5W1H Summary

- What: [...]
- Who: [...]
- When: [...]
- Where: [...]
- Why: [...]
- How: [...]

---

_Generated by /skill:academic-write on [DATE]_
_Feed this into /skill:academic-write to start writing._
```

## Completion

> "Your research brief has been saved to `.pi-academic/research-brief.md`.
>
> **Research question:** [question]
> **Approach:** [approach]
> **Key sources:** [N] identified
>
> To start writing, run `/skill:academic-write`. The brief will be loaded automatically as a starting point."
