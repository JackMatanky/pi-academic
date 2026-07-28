---
name: academic-writer-present
description: "Post-article deliverables — generate conference presentation outlines, journal submission summaries, and book chapter proposals from a completed article. Use after publishing an article when you need conference/journal/proposal deliverables."
allowed-tools: bash read write find grep academic_writer_get_profile academic_writer_list_project_files
metadata: {author: "Yotam Fromm", version: "0.2.23"}
---

# Academic Writer — Post-Article Deliverables

Generate presentation materials and submission documents from a completed article.

## Load Profile

Call `academic_writer_get_profile` and use returned `targetLanguage` and `fieldOfStudy`.

Call `academic_writer_list_project_files` with `kind: "articles"` and use the returned newest-first `files`.

If multiple articles exist:
Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "Which article would you like to create deliverables for?"
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase).

Read the selected article with the `Read` tool. Extract its thesis, section structure, and key arguments.

## Select Deliverable

Ask the researcher (present as a numbered list, keep the explanatory blurb under each option):
> "What would you like to generate from this article?"
> 1. **Conference Presentation Outline** — 20-30 minute talk outline with argument flow
>    ```
>    Output: Structured outline for oral delivery
>    Length: 20-30 min talk (~2500 words spoken)
>    Focus:  Argument flow, not full text
>    Format: Markdown with speaker notes
>    ```
> 2. **Journal Submission Abstract** — Structured abstract for journal submission
>    ```
>    Output: 150-300 word abstract
>    Parts:  Topic, method, findings, contribution
>    Format: Ready to paste into submission form
>    ```
> 3. **Book Chapter Proposal** — Proposal to develop this article into a book chapter
>    ```
>    Output: 1-2 page proposal
>    Parts:  Chapter summary, fit with volume,
>            expanded scope, bibliography
>    Format: Markdown
>    ```
> 4. **Audio Overview (NotebookLM)** — AI-generated audio summary / podcast of the article
>    ```
>    Output: Audio podcast discussing the article
>    Format: AI-generated conversational audio
>    Needs:  NotebookLM enabled in profile
>    ```
> 5. **Study Guide (NotebookLM)** — Structured study guide from article content
>    ```
>    Output: Key concepts, questions, summaries
>    Format: Markdown study guide
>    Needs:  NotebookLM enabled in profile
>    ```
> 6. **All of the above** — Generate all deliverables (NotebookLM items only if enabled)
Wait for their reply and match it against the options (accept the option number, the label text, or a close paraphrase; multiple selections allowed).

## Conference Presentation Outline

Generate in `targetLanguage`:

```markdown
# [Article Title] — Conference Presentation

## Talk Structure (20-30 min)

### Opening (3 min)
- Hook: [engaging opening tied to a key source or question]
- Research question: [from article]
- Why this matters: [significance in 2 sentences]

### Background (5 min)
- [Key context the audience needs]
- [State of the field — what's been said]
- [The gap this research fills]

### Argument (15 min)
#### Point 1: [from section X]
- Key evidence: [strongest citation]
- Speaker note: [how to present this]

#### Point 2: [from section Y]
- Key evidence: [strongest citation]
- Speaker note: [how to present this]

#### Point 3: [from section Z]
- Key evidence: [strongest citation]
- Speaker note: [how to present this]

### Conclusion (5 min)
- Main finding: [thesis restated for oral delivery]
- Implications: [wider significance]
- Open question: [for Q&A]

## Anticipated Questions
1. [likely question] — [suggested response]
2. [likely question] — [suggested response]
3. [likely question] — [suggested response]
```

Save to `articles/[article-name]-presentation.md`.

## Journal Submission Abstract

Generate a structured abstract (150-300 words) in `targetLanguage`:

1. **Topic & research question** (1-2 sentences)
2. **Methodology & sources** (1-2 sentences)
3. **Main findings** (2-3 sentences)
4. **Contribution to the field** (1 sentence)

Also generate keywords (5-7) from the article content.

Save to `articles/[article-name]-abstract.md`.

## Book Chapter Proposal

Generate in `targetLanguage`:

```markdown
# Chapter Proposal: [Expanded Title]

## Chapter Summary
[2-3 paragraphs expanding the article's argument for a book chapter]

## How This Chapter Fits
[1 paragraph on how it connects to broader themes in the field]

## Expanded Scope
[What would be added beyond the article — new sources, deeper analysis, additional sections]

## Proposed Length
[Word count estimate, typically 8,000-12,000 words]

## Key Sources
[Bibliography of primary and secondary sources]
```

Save to `articles/[article-name]-chapter-proposal.md`.

## Audio Overview (NotebookLM)

**Skip if `tools.notebooklm.enabled` is false.** Tell the researcher: "Enable NotebookLM with `/skill:academic-writer-update-tools` to generate audio overviews."

1. **Create a notebook** for this article using the `notebook_create` MCP tool with the article title
2. **Add the article** as a source using the `source_add` MCP tool (paste the article markdown content)
3. **Generate audio overview** using the `studio_create` MCP tool with type "audio"
4. **Check status** using the `studio_status` MCP tool — audio generation may take a few minutes
5. **Download** the audio file using the `download_artifact` MCP tool when ready

Save notification: "Audio overview is being generated. Check status with `nlm studio status`."

## Study Guide (NotebookLM)

**Skip if `tools.notebooklm.enabled` is false.** Tell the researcher: "Enable NotebookLM with `/skill:academic-writer-update-tools` to generate study guides."

1. **Reuse the notebook** created for Audio Overview, or create one if it doesn't exist
2. **Generate study guide** using the `studio_create` MCP tool with type "study guide"
3. **Check status** and **download** when ready using the `studio_status` and `download_artifact` MCP tools

Save the study guide content to `articles/[article-name]-study-guide.md`.

## Completion

> "Generated:
> - [list of deliverables created with file paths]
>
> All files are in the `articles/` directory."
