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
import { test, type TestContext } from "node:test";

import { Type } from "typebox";

import {
  isValid,
  JsonArraySchema,
  JsonObjectSchema,
  parseJsonText,
  type JsonObject,
  type JsonValue,
} from "../lib/schema.js";
import { createToolHarness, get, type ToolResult } from "./helpers.js";

const { callTool } = createToolHarness();

function scratch(t: TestContext): string {
  const dir = mkdtempSync(join(tmpdir(), "aw-sources-"));

  t.after(() => rmSync(dir, { recursive: true, force: true }));

  return dir;
}

function str(value: JsonValue | undefined): string {
  assert.ok(isValid(Type.String(), value), "expected a string");

  return value;
}

function readJson(path: string): JsonValue {
  return parseJsonText(readFileSync(path, "utf8"));
}

const details = (result: ToolResult, ...path: (string | number)[]) =>
  get(result.details, ...path);

const findingCodes = (value: JsonValue | undefined): string[] => {
  const findings = get(value, "findings");

  assert.ok(isValid(JsonArraySchema, findings));

  return findings.map((finding) => str(get(finding, "code")));
};

interface OutlineOptions {
  slug: string;
  title: string;
  noteId: string;
  coverage: string;
}

function outlineFor({ slug, title, noteId, coverage }: OutlineOptions) {
  return {
    schemaVersion: 1,
    article: {
      slug,
      title,
      targetLanguage: "English",
      citationStyle: "apa",
    },
    researchQuestion: "Question?",
    thesis: { text: "Claim", status: "approved" },
    status: "approved",
    items: [
      {
        id: "section-1",
        kind: "section",
        title: "Argument",
        purpose: "Establish the claim",
        thesisContribution: "Supports thesis",
        items: [
          {
            id: "point-1",
            kind: "point",
            role: "argument",
            claim: "Claim",
            reasoning: "Reasoning",
            noteUses: [
              {
                noteId,
                function: "supports",
                handling: "analyze",
                coverage,
              },
            ],
          },
        ],
      },
    ],
  };
}

function writeLocalSourceRegistry(root: string, fingerprint: string): string {
  const sourceId = `local:${fingerprint}`;

  writeFileSync(
    join(root, ".academic-writer", "sources.json"),
    JSON.stringify([
      {
        sourceId,
        sourceType: "local-file",
        sourceFingerprint: fingerprint,
      },
    ]),
  );

  return sourceId;
}

test("[test_research_notes_outline_and_frozen_bundle] notes, outline guards, frozen snapshot and bundle", async (t) => {
  const root = scratch(t);
  const state = join(root, ".academic-writer");

  mkdirSync(state);
  mkdirSync(join(root, "articles"));

  const fingerprint = "sha256:fixture";
  const sourceId = writeLocalSourceRegistry(root, fingerprint);

  const written = await callTool(root, "academic_writer_write_research_notes", {
    notesJson: [
      {
        kind: "quotation",
        coreStatement: "Evidence",
        sourceRef: sourceId,
        anchor: {
          locator: { display: "PDF p. 3" },
          pdfPageIndex: 2,
          textQuote: { exact: "Exact words" },
          sourceFingerprint: fingerprint,
        },
        tags: ["argument"],
      },
    ],
  });

  assert.equal(written.details.ok, true);

  const note = details(written, "value", 0);

  assert.equal(get(note, "review", "state"), "unchecked");

  const noteId = str(get(note, "id"));

  const reviewed = await callTool(
    root,
    "academic_writer_review_research_notes",
    { noteIds: [noteId], state: "verified" },
  );

  assert.equal(reviewed.details.ok, true);

  const outline = outlineFor({
    slug: "essay",
    title: "Essay",
    noteId,
    coverage: "primary",
  });

  const savedOutline = await callTool(root, "academic_writer_write_outline", {
    outlineJson: outline,
  });

  assert.equal(savedOutline.details.ok, true);

  const referenceOnly = outlineFor({
    slug: "essay",
    title: "Essay",
    noteId,
    coverage: "reference",
  });

  const rejectedReference = await callTool(
    root,
    "academic_writer_write_outline",
    { outlineJson: referenceOnly },
  );

  assert.equal(rejectedReference.details.ok, false);
  assert.ok(
    str(rejectedReference.details.error).includes("requires primary use"),
  );

  const duplicatePrimary = structuredClone(outline);
  const firstSection = duplicatePrimary.items[0];

  assert.ok(firstSection);
  firstSection.items.push({
    id: "point-duplicate",
    kind: "point",
    role: "argument",
    claim: "Repeated claim",
    reasoning: "Repeated evidence must not be primary twice",
    noteUses: structuredClone(firstSection.items[0]?.noteUses ?? []),
  });

  const rejectedDuplicate = await callTool(
    root,
    "academic_writer_write_outline",
    { outlineJson: duplicatePrimary },
  );

  assert.equal(rejectedDuplicate.details.ok, false);
  assert.ok(str(rejectedDuplicate.details.error).includes("Duplicate primary"));

  const article = { article: "articles/essay.md" };

  assert.equal(
    (await callTool(root, "academic_writer_render_outline", article)).details
      .ok,
    true,
  );
  assert.equal(
    (await callTool(root, "academic_writer_snapshot_notes", article)).details
      .ok,
    true,
  );

  const frozenPath = join(root, "articles", "essay.notes.json");
  const frozenNotes = readFileSync(frozenPath);

  assert.ok(isValid(JsonObjectSchema, note), "note is an object");

  const unchanged = await callTool(
    root,
    "academic_writer_write_research_notes",
    { notesJson: [note] },
  );

  assert.equal(details(unchanged, "value", 0, "review", "state"), "verified");

  const changed: JsonObject = {
    ...note,
    coreStatement: "Changed in project library",
  };

  const update = await callTool(root, "academic_writer_write_research_notes", {
    notesJson: [changed],
  });

  assert.equal(details(update, "value", 0, "review", "state"), "unchecked");

  const unverified = await callTool(
    root,
    "academic_writer_diagnose_outline",
    article,
  );

  assert.ok(
    findingCodes(details(unverified, "value")).includes("unverified-note-link"),
  );

  const registryPath = join(state, "sources.json");
  const first = get(readJson(registryPath), 0);

  assert.ok(isValid(JsonObjectSchema, first));
  writeFileSync(
    registryPath,
    JSON.stringify([{ ...first, sourceFingerprint: "sha256:changed" }]),
  );

  const stale = await callTool(
    root,
    "academic_writer_diagnose_outline",
    article,
  );

  assert.ok(findingCodes(details(stale, "value")).includes("stale-note-link"));

  const bundle = await callTool(root, "academic_writer_query_research", {
    operation: "section_bundle",
    article: "articles/essay.md",
    sectionId: "section-1",
  });

  assert.equal(bundle.details.ok, true);
  assert.equal(
    details(bundle, "value", "notes", 0, "coreStatement"),
    "Evidence",
  );

  const failedSnapshot = await callTool(
    root,
    "academic_writer_snapshot_notes",
    article,
  );

  assert.equal(failedSnapshot.details.ok, false);
  assert.deepEqual(readFileSync(frozenPath), frozenNotes);
});

test("[test_ingest_uses_content_identity_and_marks_changed_notes_stale] ingest identity follows content and stales notes", async (t) => {
  const root = scratch(t);
  const sourceDir = join(root, ".academic-writer", "sources");

  mkdirSync(sourceDir, { recursive: true });

  const source = join(sourceDir, "local.txt");

  writeFileSync(source, "First version");

  const ingest = () =>
    callTool(root, "academic_writer_ingest_sources", { paths: [source] });

  const record = details(await ingest(), "sources", 0);
  const recordId = str(get(record, "sourceId"));
  const recordFingerprint = str(get(record, "sourceFingerprint"));

  assert.equal(recordId, `local:${recordFingerprint}`);
  assert.match(recordFingerprint, /^sha256:[0-9a-f]{64}$/);

  const note = details(
    await callTool(root, "academic_writer_write_research_notes", {
      notesJson: [
        {
          kind: "paraphrase",
          coreStatement: "Researcher paraphrase",
          researcherNote: "I rewrote the source idea",
          sourceRef: recordId,
        },
      ],
    }),
    "value",
    0,
  );

  await ingest();

  const unchanged = readJson(join(root, ".academic-writer", "sources.json"));

  assert.equal(get(unchanged, 0, "sourceId"), recordId);

  writeFileSync(source, "Second, changed version");

  const changed = details(await ingest(), "sources", 0);

  assert.notEqual(get(changed, "sourceId"), recordId);

  const saved = readJson(join(root, ".academic-writer", "research-notes.json"));

  assert.equal(get(saved, "notes", 0, "id"), get(note, "id"));
  assert.equal(get(saved, "notes", 0, "review", "state"), "stale");
});

function makePdf(): Uint8Array {
  const first = "BT /F1 12 Tf 25 250 Td (FIRST PAGE MARKER) Tj ET";
  const second = "BT /F1 12 Tf 25 250 Td (SECOND PAGE MARKER) Tj ET";

  const page = (contents: number) =>
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 7 0 R >> >> /Contents ${contents} 0 R >>`;

  const stream = (body: string) =>
    `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}\nendstream`;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    page(4),
    stream(first),
    page(6),
    stream(second),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let data = "%PDF-1.4\n";
  const offsets: number[] = [];

  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(data));
    data += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xref = Buffer.byteLength(data);

  data += `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;

  for (const offset of offsets)
    data += `${String(offset).padStart(10, "0")} 00000 n \n`;
  data += `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  return Buffer.from(data, "latin1");
}

test("[test_pdf_ingest_preserves_zero_based_page_boundaries] PDF ingest keeps zero-based pages", async (t) => {
  const root = scratch(t);
  const source = join(root, "two-pages.pdf");

  writeFileSync(source, makePdf());

  const ingest = async () =>
    details(
      await callTool(root, "academic_writer_ingest_sources", {
        paths: [source],
      }),
      "sources",
      0,
    );

  const record = await ingest();
  const repeated = await ingest();

  assert.equal(get(repeated, "sourceId"), get(record, "sourceId"));
  assert.equal(
    get(repeated, "sourceFingerprint"),
    get(record, "sourceFingerprint"),
  );
  assert.deepEqual(
    [
      get(repeated, "pages", 0, "pdfPageIndex"),
      get(repeated, "pages", 1, "pdfPageIndex"),
    ],
    [0, 1],
  );
  assert.deepEqual(
    [
      get(record, "pages", 0, "pdfPageIndex"),
      get(record, "pages", 1, "pdfPageIndex"),
    ],
    [0, 1],
  );
  assert.ok(str(get(record, "pages", 0, "text")).includes("FIRST PAGE MARKER"));
  assert.ok(
    str(get(record, "pages", 1, "text")).includes("SECOND PAGE MARKER"),
  );
});

test("[test_local_source_version_and_non_citable_outline_guards] unbound paraphrases stay stale and analysis notes are not citable", async (t) => {
  const root = scratch(t);

  mkdirSync(join(root, ".academic-writer"));

  const sourceId = writeLocalSourceRegistry(root, "sha256:current");

  const missingFingerprint = await callTool(
    root,
    "academic_writer_write_research_notes",
    {
      notesJson: [
        {
          id: "unbound-paraphrase",
          kind: "paraphrase",
          coreStatement: "Paraphrased claim",
          sourceRef: sourceId,
          researcherNote: "Researcher-authored paraphrase",
        },
      ],
    },
  );

  assert.equal(
    details(missingFingerprint, "value", 0, "review", "state"),
    "stale",
  );

  const verified = await callTool(
    root,
    "academic_writer_review_research_notes",
    { noteIds: ["unbound-paraphrase"], state: "verified" },
  );

  assert.equal(details(verified, "value", 0, "review", "state"), "stale");

  const analysis = await callTool(
    root,
    "academic_writer_write_research_notes",
    {
      notesJson: [
        {
          id: "analysis-only",
          kind: "analysis",
          coreStatement: "Researcher interpretation",
        },
      ],
    },
  );

  assert.equal(analysis.details.ok, true);

  await callTool(root, "academic_writer_review_research_notes", {
    noteIds: ["analysis-only"],
    state: "verified",
  });

  const outline = outlineFor({
    slug: "analysis-test",
    title: "Analysis Test",
    noteId: "analysis-only",
    coverage: "primary",
  });

  const rejected = await callTool(root, "academic_writer_write_outline", {
    outlineJson: outline,
  });

  assert.equal(rejected.details.ok, false);
  assert.ok(str(rejected.details.error).includes("Non-citable note kind"));
  assert.ok(!existsSync(join(root, "articles", "analysis-test.outline.json")));
});

test("[test_source_cache_rejects_unconfirmed_zotero_identity_without_overwrite] unconfirmed Zotero identity is rejected without overwriting", async (t) => {
  const root = scratch(t);
  const state = join(root, ".academic-writer");

  mkdirSync(state);

  const sourceFile = join(state, "sources.json");
  const bibliographyFile = join(state, "bibliography.bib");

  writeFileSync(sourceFile, "original sources\n");
  writeFileSync(bibliographyFile, "original bibliography\n");

  const bibliography = "@book{new, title={New}}";

  const failed = await callTool(root, "academic_writer_write_sources_cache", {
    sourcesJson: [
      {
        sourceType: "zotero",
        sourceId: "zotero:wrong:key",
        libraryId: "library",
        itemKey: "key",
      },
    ],
    bibliography,
  });

  assert.equal(failed.isError, true);
  assert.ok(failed.content[0]?.text.includes("Zotero sourceId"));
  assert.equal(readFileSync(sourceFile, "utf8"), "original sources\n");
  assert.equal(
    readFileSync(bibliographyFile, "utf8"),
    "original bibliography\n",
  );

  await callTool(root, "academic_writer_write_sources_cache", {
    sourcesJson: [
      {
        sourceType: "zotero",
        sourceId: null,
        libraryId: "library",
        itemKey: "key",
      },
    ],
    bibliography,
  });

  assert.equal(get(readJson(sourceFile), 0, "sourceId"), "zotero:library:key");
  assert.equal(readFileSync(bibliographyFile, "utf8"), bibliography);
});
