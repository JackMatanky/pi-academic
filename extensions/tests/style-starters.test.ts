import assert from "node:assert/strict";

import { test } from "vitest";

import { firstViolation } from "../lib/schema.js";
import {
  ComponentsSchema,
  PageSchema,
} from "../pi-academic-writer/style-design.js";
import {
  STYLE_STARTERS,
  starterByName,
} from "../pi-academic-writer/style-starters.js";

test("[test_style_starters_match_schemas] every shipped starter satisfies the design schemas", () => {
  assert.deepEqual(
    STYLE_STARTERS.map((starter) => starter.name),
    ["academic-default", "apa-7", "mla-9", "chicago"],
  );

  for (const starter of STYLE_STARTERS) {
    assert.ok(
      !firstViolation(PageSchema, starter.page),
      `${starter.name}: invalid page`,
    );
    assert.ok(
      !firstViolation(ComponentsSchema, starter.components),
      `${starter.name}: invalid components`,
    );
    assert.deepEqual(starter.formats, {});
  }
});

test("[test_style_starters_fallback] unknown starter names fall back to academic-default", () => {
  assert.equal(starterByName("academic-default").name, "academic-default");
  assert.equal(starterByName("no-such-starter").name, "academic-default");
});
