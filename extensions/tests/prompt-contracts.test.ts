import assert from "node:assert/strict";

import { test } from "vitest";

import { readRepo } from "./helpers.js";

test("[test_section_A_blocks_mibchinat_paragraph_opener] section A blocks mibchinat paragraph opener", () => {
  const text = readRepo(
    "skills/academic-write/references/anti-ai-patterns-hebrew.md",
  );

  assert.ok(text.includes("מבחינת"), "Missing 'מבחינת'");
  assert.ok(
    text.includes("Per-paragraph cap: 0 as opener"),
    "Missing 'Per-paragraph cap: 0 as opener'",
  );
});

test("[test_section_A_enforces_opening_formula] section A enforces opening formula", () => {
  const text = readRepo(
    "skills/academic-write/references/anti-ai-patterns-hebrew.md",
  );

  assert.ok(text.includes("opening_formula"), "Missing 'opening_formula'");
  assert.ok(text.includes("במאמר זה"), "Missing 'במאמר זה'");
  assert.ok(
    text.includes("Per-article cap: 0 violations"),
    "Missing 'Per-article cap: 0 violations'",
  );
});

test("[test_section_F_exists_with_meta_summary_patterns] section F exists with meta summary patterns", () => {
  const text = readRepo(
    "skills/academic-write/references/anti-ai-patterns-hebrew.md",
  );

  assert.ok(
    text.includes("### F. Editorial Meta-Summary"),
    "Missing '### F. Editorial Meta-Summary'",
  );

  for (const pat of [
    "מסכמ",
    "ומכאן עולה",
    "הראוי לבחינה מדוקדקת",
    "ניתן ללמוד כי",
  ]) {
    assert.ok(text.includes(pat), `missing F pattern: ${pat}`);
  }
});

test("[test_section_G_hard_rule_present] section G hard rule present", () => {
  const text = readRepo(
    "skills/academic-write/references/anti-ai-patterns-hebrew.md",
  );

  assert.ok(
    text.includes("### G. Unsourced Factual Assertions"),
    "Missing '### G. Unsourced Factual Assertions'",
  );
  assert.ok(
    text.includes("Per-article cap: 0"),
    "Missing 'Per-article cap: 0'",
  );
  assert.ok(
    text.includes("[NEEDS REVIEW: source for"),
    "Missing '[NEEDS REVIEW: source for'",
  );
});

test("[test_section_H_blocks_quantitative_padding] section H blocks quantitative padding", () => {
  const text = readRepo(
    "skills/academic-write/references/anti-ai-patterns-hebrew.md",
  );

  assert.ok(
    text.includes("### H. Topic Drift & Padding"),
    "Missing '### H. Topic Drift & Padding'",
  );
  assert.ok(
    text.includes("מאה עשרים ושמונה משוררים") ||
      text.includes("Quantitative trivia"),
    "Missing 'מאה עשרים ושמונה משוררים' or 'Quantitative trivia'",
  );
});

test("[test_academic_checks_chapter_coverage] academic checks chapter coverage", () => {
  const text = readRepo("agents/academic.md");
  assert.ok(text.includes("chapter_coverage"), "Missing 'chapter_coverage'");
  assert.ok(
    text.toLowerCase().includes("reject") ||
      text.toLowerCase().includes("re-dispatch") ||
      text.toLowerCase().includes("return to the researcher"),
    "Missing rejection/re-dispatch/return to the researcher",
  );
});

test("[test_editor_audit_checks_unsourced_factual_claims] editor audit checks unsourced factual claims", () => {
  const text = readRepo("agents/editor.md");
  assert.ok(
    text.includes("Section G") || text.includes("Unsourced Factual"),
    "Missing 'Section G' or 'Unsourced Factual'",
  );
  assert.ok(
    text.includes("[NEEDS REVIEW: source for"),
    "Missing '[NEEDS REVIEW: source for'",
  );
});

test("[test_editor_audit_lists_factual_cue_categories] editor audit lists factual cue categories", () => {
  const text = readRepo("agents/editor.md");
  const cues = ["dating", "dimensions", "technique", "scholarly consensus"];
  cues.forEach((cue) => {
    assert.ok(
      text.toLowerCase().includes(cue),
      `Missing factual-cue category: ${cue}`,
    );
  });
});

test("[test_researcher_has_chapter_enumeration_trigger] researcher has chapter enumeration trigger", () => {
  const text = readRepo("agents/researcher.md");
  assert.ok(
    text.includes("לאורך הספרים") ||
      text.includes("across all books") ||
      text.includes("across both books"),
    "Missing chapter enumeration trigger",
  );
  assert.ok(text.includes("chapter_coverage"), "Missing 'chapter_coverage'");
});

test("[test_researcher_chapter_coverage_schema] researcher chapter coverage schema", () => {
  const text = readRepo("agents/researcher.md");
  assert.ok(text.includes("covered"), "Missing 'covered'");
  assert.ok(
    text.includes("skipped-irrelevant"),
    "Missing 'skipped-irrelevant'",
  );
});

test("[test_writer_loads_banned_terms] writer loads banned terms", () => {
  const text = readRepo("agents/writer.md");
  assert.ok(text.includes("bannedTerms"), "Missing 'bannedTerms'");
});

test("[test_writer_skill_2_rewrites_banned_terms] writer skill 2 rewrites banned terms", () => {
  const text = readRepo("agents/writer.md");
  assert.ok(text.includes("Skill 2"), "Missing 'Skill 2'");
  assert.ok(
    text.toLowerCase().includes("replacement"),
    "Missing 'replacement'",
  );
});

test("[test_write_skill_has_existing_article_precondition] write skill has existing article precondition", () => {
  const text = readRepo("skills/academic-write/SKILL.md");
  assert.ok(text.includes("articles/"), "Missing 'articles/'");
  assert.ok(
    text.includes("/skill:academic-edit"),
    "Missing '/skill:academic-edit'",
  );
  assert.ok(
    text.toLowerCase().includes("already exists") ||
      text.includes("test -f") ||
      text.includes("[ -f"),
    "Missing 'already exists' or 'test -f' or '[ -f'",
  );
});
