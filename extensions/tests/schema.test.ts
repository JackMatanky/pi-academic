import assert from "node:assert/strict";

import { test } from "vitest";

import { JsonValueSchema, isValid, parseJsonText } from "../lib/schema.js";

test("recursive JSON schema accepts nested JSON and rejects non-JSON values", () => {
  assert.equal(
    isValid(JsonValueSchema, {
      nested: ["text", 7, false, null, { valid: true }],
    }),
    true,
  );
  assert.equal(isValid(JsonValueSchema, { nested: undefined }), false);
  assert.equal(
    isValid(JsonValueSchema, () => "not JSON"),
    false,
  );
});

test("parseJsonText accepts every JSON value and rejects invalid parsed numbers", () => {
  for (const [text, expected] of [
    ['"text"', "text"],
    ["7", 7],
    ["false", false],
    ["null", null],
    ['[1,{"key":"value"}]', [1, { key: "value" }]],
    ['{"nested":[true]}', { nested: [true] }],
  ] as const) {
    assert.deepEqual(parseJsonText(text), expected);
  }

  assert.throws(() => parseJsonText("{"), SyntaxError);
  assert.throws(() => parseJsonText("1e999"), /JSON text.*\(root\)/);
});
