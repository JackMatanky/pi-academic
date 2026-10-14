import assert from "node:assert/strict";

import { Type } from "typebox";
import { test } from "vitest";

import {
  firstViolation,
  isValid,
  JsonValueSchema,
  parseJsonText,
} from "../lib/schema.js";

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

test("parseJsonText accepts every JSON value and throws on malformed syntax", () => {
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
  assert.throws(() => parseJsonText("[1,"), SyntaxError);
});

test("firstViolation unescapes RFC 6901 JSON pointers in error paths", () => {
  const schema = Type.Object({
    "styles/chicago-18": Type.String(),
  });

  const violation = firstViolation(schema, { "styles/chicago-18": 123 });
  assert.ok(violation);
  assert.deepEqual(violation.path, ["styles/chicago-18"]);
});
