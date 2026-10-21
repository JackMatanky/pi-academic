import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { test, type TestContext } from "vitest";

import {
  measureText,
  positionAgainst,
  splitSentences,
  tokenize,
} from "../pi-academic/prose/style-metrics.js";
import { createToolHarness, get } from "./helpers.js";

const { callTool } = createToolHarness();

const withPassive = (sentence: string): number | null =>
  measureText(`${sentence} ${sentence} ${sentence}`, "en", {
    minParagraphWords: 1,
  }).values.passiveRate;

const withIng = (sentence: string): number | null =>
  measureText(`${sentence} ${sentence} ${sentence}`, "en", {
    minParagraphWords: 1,
  }).values.ingTailRate;

test("splitSentences keeps scholarly abbreviations and Hebrew page references inside one sentence", () => {
  assert.equal(
    splitSentences(
      "He cites the passage (Guide, I, p. 45) in full. Then he stops.",
      "en",
    ).length,
    2,
  );
  assert.equal(
    splitSentences("הרמב״ם כותב זאת (עמ. 12) בבירור. אחר כך הוא עוצר.", "he")
      .length,
    2,
  );
});

test("tokenize keeps Hebrew gershayim inside the word", () => {
  assert.deepEqual(tokenize('הרמב"ם כתב'), ["הרמב״ם", "כתב"]);
});

test("passive rate counts agentless passives only", () => {
  assert.equal(
    withPassive("The attributes are negated rather than affirmed."),
    100,
  );
  assert.equal(
    withPassive("The attributes are negated by the philosopher."),
    0,
  );
  assert.equal(withPassive("The door is open and the road is often wide."), 0);
  assert.equal(
    withPassive("The result has been shown in several studies."),
    100,
  );
});

test("participial -ing rate counts trailing clauses, not subject gerunds or gerund series", () => {
  assert.equal(
    withIng("The text reframes the debate, showing why the reader hesitates."),
    100,
  );
  assert.equal(
    withIng("For a reader, translating the idiom preserves the person."),
    0,
  );
  assert.equal(
    withIng(
      "He proceeds by purging the idea, transforming the practice, and grounding it.",
    ),
    0,
  );
  assert.equal(withIng("The study is long, including notes."), 0);
});

test("rates need enough text and lexical diversity needs a full window", () => {
  const short = measureText(
    "One short sentence here. Another follows it.",
    "en",
    {
      minParagraphWords: 1,
    },
  );

  assert.equal(short.values.sentenceCv, null);
  assert.equal(short.values.mattr, null);
  assert.equal(short.values.firstPersonRate, null);
});

test("Hebrew gets the language-neutral subset only", () => {
  const text = Array.from(
    { length: 6 },
    () => "זהו משפט קצר בעברית על הנושא. ",
  ).join("");

  const hebrew = measureText(text, "he", { minParagraphWords: 1 });

  assert.equal(hebrew.values.passiveRate, null);
  assert.equal(hebrew.values.hedgeRate, null);
  assert.ok((hebrew.values.sentenceMean ?? 0) > 0);
});

test("positionAgainst places a value and refuses a reference that is too small", () => {
  assert.equal(positionAgainst(1, [1, 2]), null);

  const reference = [10, 20, 30, 40];

  assert.equal(positionAgainst(5, reference)?.position, "below");
  assert.equal(positionAgainst(25, reference)?.position, "within");
  assert.equal(positionAgainst(99, reference)?.position, "above");
  assert.equal(positionAgainst(25, reference)?.refMedian, 25);
});

const SHORT = "The argument fails.";

const MIDDLE =
  "The attributes are negated rather than affirmed in this chapter.";

const LONG =
  "When the reader returns to the canonical text after long study, the familiar idioms of scripture no longer carry the comfort they once did, and the hesitation that follows is not a failure of faith but its most serious form.";

const FIRST =
  "I read the passage as a deliberate invitation to that hesitation.";

const paragraph = (...sentences: string[]): string => sentences.join(" ");

const reference = (order: string[][]): string =>
  order.map((sentences) => paragraph(...sentences)).join("\n\n");

const REFERENCES = [
  reference([
    [MIDDLE, LONG, SHORT, FIRST],
    [LONG, SHORT, MIDDLE, LONG],
    [FIRST, MIDDLE, SHORT, LONG],
  ]),
  reference([
    [SHORT, LONG, MIDDLE, FIRST],
    [MIDDLE, SHORT, LONG, MIDDLE],
    [LONG, FIRST, SHORT, MIDDLE],
  ]),
  reference([
    [LONG, MIDDLE, FIRST, SHORT],
    [SHORT, MIDDLE, LONG, LONG],
    [MIDDLE, FIRST, LONG, SHORT],
  ]),
];

const GOOD = reference([
  [MIDDLE, SHORT, LONG, FIRST],
  [LONG, MIDDLE, SHORT, MIDDLE],
  [FIRST, LONG, SHORT, MIDDLE],
]);

const FLAT =
  "Moreover, the text clarifies the point, highlighting the role of reason. Moreover, the text shows the idea, emphasizing the need for care. Moreover, the study notes the gap, underscoring the value of work. Moreover, the work adds the view, showcasing the power of thought.";

const BAD = [FLAT, FLAT, FLAT].join("\n\n");

function project(t: TestContext, blindReady = true): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "style-")));

  t.onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "ref"));

  if (blindReady) mkdirSync(join(root, ".pi-academic"));

  for (const [index, text] of REFERENCES.entries()) {
    writeFileSync(join(root, "ref", `r${index}.md`), text);
  }

  writeFileSync(join(root, "good.md"), GOOD);
  writeFileSync(join(root, "bad.md"), BAD);

  return root;
}

test("style metrics places a draft against reference documents", async (t) => {
  const root = project(t);

  const result = await callTool(root, "pi_academic_style_metrics", {
    path: "bad.md",
    language: "English",
    referencePaths: ["ref"],
  });

  assert.equal(result.isError, false, result.content[0]?.text ?? "");
  assert.match(result.content[0]?.text ?? "", /Reference: 3 documents/u);
  assert.match(
    result.content[0]?.text ?? "",
    /Outside the reference range:[^\n]*connectorOpenerRate/u,
  );
});

test("style metrics refuses ambiguous input", async (t) => {
  const root = project(t);

  const none = await callTool(root, "pi_academic_style_metrics", {
    language: "English",
  });

  assert.equal(none.isError, true);
});

test("style eval ranks the draft that matches the reference closer, and audits lint rules", async (t) => {
  const root = project(t);

  const result = await callTool(root, "pi_academic_style_eval", {
    reference: ["ref"],
    variants: [
      { name: "good", path: "good.md" },
      { name: "bad", path: "bad.md" },
    ],
    language: "English",
    auditLint: true,
  });

  assert.equal(result.isError, false, result.content[0]?.text ?? "");

  const good = Number(get(result.details, "variants", 0, "distance"));
  const bad = Number(get(result.details, "variants", 1, "distance"));

  assert.ok(good < bad, `good ${good} should be closer than bad ${bad}`);
  assert.notEqual(get(result.details, "lintAudit"), null);
});

test("style eval writes a shuffled blind sheet and a separate key", async (t) => {
  const root = project(t);

  const result = await callTool(root, "pi_academic_style_eval", {
    reference: ["ref"],
    variants: [
      { name: "good", path: "good.md" },
      { name: "also", path: "good.md" },
    ],
    language: "English",
    blind: true,
    seed: "s",
  });

  assert.equal(result.isError, false, result.content[0]?.text ?? "");

  const sheet = readFileSync(
    join(root, String(get(result.details, "blind", "sheet"))),
    "utf8",
  );

  const key = readFileSync(
    join(root, String(get(result.details, "blind", "key"))),
    "utf8",
  );

  assert.match(sheet, /## Paragraph 3/u);
  assert.doesNotMatch(sheet, /good|also/u);
  assert.match(key, /"labels"/u);
});

test("style eval refuses a blind sheet over misaligned paragraphs", async (t) => {
  const root = project(t);

  writeFileSync(join(root, "short.md"), paragraph(MIDDLE, LONG, SHORT));

  const result = await callTool(root, "pi_academic_style_eval", {
    reference: ["ref"],
    variants: [
      { name: "a", path: "good.md" },
      { name: "b", path: "short.md" },
    ],
    language: "English",
    blind: true,
  });

  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text ?? "", /aligned paragraphs/u);
});

test("style eval needs enough measurable reference documents", async (t) => {
  const root = project(t);

  const result = await callTool(root, "pi_academic_style_eval", {
    reference: ["ref/r0.md"],
    variants: [{ name: "good", path: "good.md" }],
    language: "English",
  });

  assert.equal(result.isError, true);
});
