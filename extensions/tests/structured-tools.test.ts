import type { JsonObject } from "../lib/schema.js";

import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test } from "vitest";

import { createToolHarness } from "./helpers.js";

const { callTool, definitions } = createToolHarness();

const outline = {
  schemaVersion: 1,
  article: {
    slug: "essay",
    title: "Essay",
    targetLanguage: "English",
    citationStyle: "apa",
  },
  researchQuestion: "Why?",
  thesis: { text: "Because", status: "proposed" },
  status: "draft",
  items: [],
};

test("structured write tools validate nested parameters before changing files", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "aw-structured-"));
  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, ".academic-writer"));
  mkdirSync(join(root, "articles"));
  writeFileSync(
    join(root, ".academic-writer/profile.md"),
    "---\nfieldOfStudy: History\n---\n",
  );
  writeFileSync(
    join(root, "articles/essay.md"),
    "# Essay\n\n## Body\n\nText.\n",
  );

  const cases: Array<{
    name: string;
    valid: JsonObject;
    path: string;
    invalid: JsonObject[];
    field: string;
    errors: string[];
  }> = [
    {
      name: "academic_writer_write_research_notes",
      valid: {
        notesJson: [{ id: "idea", kind: "idea", coreStatement: "An idea" }],
      },
      path: ".academic-writer/research-notes.json",
      invalid: [
        { notesJson: [{ kind: "idea" }] },
        {
          notesJson: [
            {
              kind: "idea",
              coreStatement: "An idea",
              anchor: { locator: { display: 7 } },
            },
          ],
        },
      ],
      field: "notesJson",
      errors: ["coreStatement", "display"],
    },
    {
      name: "academic_writer_write_outline",
      valid: { outlineJson: outline },
      path: "articles/essay.outline.json",
      invalid: [
        {
          outlineJson: {
            ...outline,
            article: {
              title: "Essay",
              targetLanguage: "English",
              citationStyle: "apa",
            },
          },
        },
        {
          outlineJson: { ...outline, thesis: { text: 7, status: "proposed" } },
        },
      ],
      field: "outlineJson",
      errors: ["slug", "text"],
    },
    {
      name: "academic_writer_write_sources_cache",
      valid: {
        sourcesJson: [
          { sourceType: "zotero", libraryId: "lib", itemKey: "item" },
        ],
        bibliography: "@book{item, title={Book}}",
      },
      path: ".academic-writer/sources.json",
      invalid: [
        { sourcesJson: [{ libraryId: "lib" }], bibliography: "different" },
        {
          sourcesJson: [
            { sourceType: "zotero", extractionConfidence: { author: 7 } },
          ],
          bibliography: "different",
        },
      ],
      field: "sourcesJson",
      errors: ["sourceType", "author"],
    },
    {
      name: "academic_writer_update_profile",
      valid: { fieldsJson: { tools: { zotero: { enabled: true } } } },
      path: ".academic-writer/profile.md",
      invalid: [
        { fieldsJson: { tools: { zotero: {} } } },
        { fieldsJson: { tools: { zotero: { enabled: "yes" } } } },
      ],
      field: "fieldsJson",
      errors: ["enabled", "enabled"],
    },
    {
      name: "academic_writer_assemble_docx_json",
      valid: {
        input: "articles/essay.md",
        output: ".academic-writer/essay.json",
        formatJson: { bodySize: 12 },
      },
      path: ".academic-writer/essay.json",
      invalid: [
        {
          input: "articles/essay.md",
          output: ".academic-writer/essay.json",
          formatJson: { bodySize: "twelve" },
        },
        {
          input: "articles/essay.md",
          output: ".academic-writer/essay.json",
          formatJson: [],
        },
      ],
      field: "formatJson",
      errors: ["bodySize", "formatJson"],
    },
  ];

  for (const entry of cases) {
    assert.ok(definitions.has(entry.name));
    const success = await callTool(root, entry.name, entry.valid);
    assert.equal(
      success.isError,
      false,
      `${entry.name}: ${success.content[0]?.text}`,
    );
    const destination = join(root, entry.path);

    if (existsSync(destination)) {
      const before = readFileSync(destination);

      for (const [index, invalid] of entry.invalid.entries()) {
        const failed = await callTool(root, entry.name, invalid);
        assert.equal(failed.isError, true, entry.name);
        assert.match(failed.content[0]?.text ?? "", new RegExp(entry.field));
        const expectedField = entry.errors[index];
        assert.ok(expectedField);
        assert.match(failed.content[0]?.text ?? "", new RegExp(expectedField));
        assert.deepEqual(readFileSync(destination), before, entry.name);
      }
    } else {
      assert.fail(`${entry.name} did not write ${entry.path}`);
    }
  }

  assert.equal(
    readFileSync(join(root, ".academic-writer/bibliography.bib"), "utf8"),
    "@book{item, title={Book}}",
  );
});
