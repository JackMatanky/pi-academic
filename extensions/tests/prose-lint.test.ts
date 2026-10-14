import assert from "node:assert/strict";

import { test } from "vitest";

import { lintProse } from "../pi-academic-writer/prose/prose-lint.js";

test("lintProse flags conversational residue and inflated significance in prose", () => {
  const text =
    "Great question. The finding stands as a testament to the archive.";

  const result = lintProse(text);

  assert.equal(result.status, "advisory");
  assert.equal(result.language, "english");
  assert.equal(result.findings.length, 2);
  assert.equal(result.findings[0]?.id, "chatbot-residue");
  assert.equal(result.findings[1]?.id, "inflated-significance");
});

test("lintProse ignores mixed-length fences and nested-looking lines", () => {
  const text = [
    "This is normal prose before the code fence.",
    "",
    "````markdown",
    "Great question. I hope this helps.",
    "```typescript",
    "// stands as a testament and let's dive in",
    "const message = 'Of course';",
    "```",
    "Taken together, this evolving landscape continues.",
    "````",
    "",
    "Subsequent analysis proceeds along distinct lines.",
  ].join("\n");

  const result = lintProse(text);

  assert.equal(result.status, "advisory");
  assert.equal(result.findings.length, 0);
});

test("lintProse ignores tilde fences and mixed backtick contents", () => {
  const text = [
    "Normal prose here.",
    "",
    "~~~~markdown",
    "```python",
    "print('I hope this helps')",
    "```",
    "~~~~",
    "",
    "Great question in prose.",
  ].join("\n");

  const result = lintProse(text);

  assert.equal(result.status, "advisory");
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.id, "chatbot-residue");
  assert.equal(result.findings[0]?.line, 9);
});
