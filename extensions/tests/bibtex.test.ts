import assert from "node:assert/strict";

import { test } from "vitest";

import { parseBibEntries } from "../pi-academic/parsers/bibtex.js";

test("an @ inside a field value never splits an entry", () => {
  const bib = [
    "@article{jones2000,",
    "  title = {A study of things},",
    "  note = {contact @author at mail@example.com or @weird_handle},",
    "  year = {2000},",
    "}",
    "",
    "@book{smith2020,",
    "  title = {Other Work},",
    "}",
    "",
  ].join("\n");

  const entries = parseBibEntries(bib);

  assert.deepEqual([...entries.keys()], ["jones2000", "smith2020"]);

  const jones = entries.get("jones2000");

  assert.equal(jones?.type, "article");
  assert.match(jones?.text ?? "", /@author at mail@example\.com/);
  assert.match(jones?.cleanedText ?? "", /A study of things/);
  assert.doesNotMatch(jones?.cleanedText ?? "", /[{}]/);
});

test("nested braces and escaped braces stay balanced", () => {
  const bib = [
    "@misc{nested1999,",
    "  title = {The {Curly} {Brace} book},",
    "  annote = {a \\{ literal \\} brace},",
    "}",
    "",
  ].join("\n");

  const entries = parseBibEntries(bib);

  assert.equal(entries.size, 1);

  const entry = entries.get("nested1999");

  assert.equal(entry?.type, "misc");
  assert.match(entry?.text ?? "", /literal \\\} brace/);
});

test("an unclosed entry recovers at the next line-initial entry", () => {
  const bib = [
    "@article{broken1971,",
    "  title = {Never closed",
    "@article{next1972,",
    "  title = {Fine},",
    "}",
    "",
  ].join("\n");

  const entries = parseBibEntries(bib);

  assert.deepEqual([...entries.keys()], ["broken1971", "next1972"]);
  assert.match(entries.get("next1972")?.text ?? "", /Fine/);
});
