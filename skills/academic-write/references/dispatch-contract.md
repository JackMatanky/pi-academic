# Dispatch Contract

Choose the form by harness: call `academic_writer_status`; its `harness` field is `omp` or `pi`.

## Rules (both harnesses)

1. Name `agent` on every dispatched task (`deep-reader`, `architect`, `section-writer`, `auditor`, `synthesizer`, `proofreader`, `voice-profile-builder`).
2. Put shared background once and keep per-task text to what differs.
3. Collect every result before running a gate or assembling output, and assemble in outline order.
4. Gates read the structured result field, never a line of prose.

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

### `proofreader_result`

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["agent", "language", "changes", "summary"],
  "properties": {
    "agent": { "type": "string", "enum": ["proofreader"] },
    "language": { "type": "string" },
    "changes": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["line", "type", "level", "before", "after", "rationale"],
        "properties": {
          "line": { "type": "integer", "minimum": 0 },
          "type": {
            "type": "string",
            "enum": [
              "typo",
              "punctuation",
              "word",
              "grammar",
              "typography",
              "idea-flag"
            ]
          },
          "level": {
            "type": "string",
            "enum": ["letter", "word", "sentence", "idea"]
          },
          "before": { "type": "string" },
          "after": { "type": ["string", "null"] },
          "rationale": { "type": "string" }
        }
      }
    },
    "summary": { "type": "string" }
  }
}
```
