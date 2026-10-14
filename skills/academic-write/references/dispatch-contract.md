# Dispatch Contract

Choose the form by harness: call `academic_writer_status`; its `harness` field is `omp` or `pi`.

## Rules (both harnesses)

1. Name `agent` on every dispatched task (`researcher`, `academic`, `writer`, `editor`).
2. Put shared background once and keep per-task text to what differs.
3. Collect every result before running a gate or assembling output, and assemble in outline order.
4. Gates read the structured result field, never a line of prose.

## Per-agent mode and input requirements

- Orchestrator → `writer`: MD_PATH, sectionId, citationStyle, targetLanguage, articleStructure, enabled tools, targetWordCount, and outlineOverview. The writer fetches its own evidence via `section_bundle`; do not pass mutable notes, registries, or pasted section specs.
- `writer` → `editor` (audit): the dispatch task MUST state `mode: "audit"` and carry the paragraph text; sectionId, paragraphIndex, paragraphId and article path; relevant note IDs, sourceRef values, locators, and textQuote selectors as retrieval leads; tools from the profile; and `citationStyle` for Check D/E.
- Orchestrating skill → `editor` (review): the dispatch task MUST state `mode: "review"` and carry MD_PATH (the assembled article), the thesis, the complete styleFingerprint, the `articleStructure` conventions, the linkingWords reference, `targetLanguage`, and the tools config.

## oh-my-pi

Shape: `task({ context: "<shared background>", tasks: [{ agent, task, solutionSpace, outputSchema, schemaMode: "strict" }] })`. One call per wave; `context` is required. Results arrive asynchronously; read each child's result (`structuredOutput.data` when `outputSchema` was set). Call `wait` only when nothing else is left to do.

Never put an `output:` key in agent frontmatter (on pi it means an output file).

## pi

Parallel: `subagent({ tasks: [{ agent, task, outputSchema }], concurrency: 4 })`. Single: `subagent({ agent, task, outputSchema })`. The child must return schema-valid JSON through `structured_output`.

## Result schemas

### `auditor_result`

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "verdict",
    "paragraphId",
    "claimsVerified",
    "issues",
    "needsReview",
    "approvedText"
  ],
  "properties": {
    "verdict": { "type": "string", "enum": ["PASS", "FAIL", "PARTIAL"] },
    "paragraphId": { "type": "string" },
    "claimsVerified": { "type": "integer", "minimum": 0 },
    "issues": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["claim", "reason"],
        "properties": {
          "claim": { "type": "string" },
          "reason": { "type": "string" },
          "rewriteInstruction": { "type": "string" }
        }
      }
    },
    "needsReview": { "type": "array", "items": { "type": "string" } },
    "approvedText": { "type": ["string", "null"] }
  }
}
```

### `editor_review_result`

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["mode", "findings", "revisionNotes"],
  "properties": {
    "mode": { "const": "review" },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["severity", "quote", "location", "note"],
        "properties": {
          "severity": { "enum": ["fatal", "major", "minor"] },
          "quote": { "type": "string" },
          "location": { "type": "string" },
          "note": { "type": "string" }
        }
      }
    },
    "revisionNotes": { "type": "string" },
    "revisedArticle": { "type": ["string", "null"] }
  }
}
```
