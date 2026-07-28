import { existsSync } from "node:fs";
import { join } from "node:path";
import { PACKAGE_ROOT } from "../lib/paths.js";

function normalizeLanguage(language: unknown): "english" | "hebrew" {
  if (typeof language !== "string") return "hebrew";
  const normalized = language.trim().toLowerCase();
  return normalized.startsWith("en") || normalized === "english" ? "english" : "hebrew";
}

export function resolveResourcePath(name: string, projectRoot: string, language?: unknown): string {
  switch (name) {
    case "thresholds": {
      const projectOverride = join(projectRoot, ".academic-helper", "thresholds.json");
      return existsSync(projectOverride) ? projectOverride : join(PACKAGE_ROOT, "thresholds.json");
    }
    case "words":
      return join(PACKAGE_ROOT, "words.md");
    case "scorecard":
      return join(PACKAGE_ROOT, "skills", "academic-writer-review", "references", "scorecard.json");
    case "style_fingerprint_rubric":
      return join(PACKAGE_ROOT, "skills", "academic-writer-write", "references", "style-fingerprint-rubric.md");
    case "anti_ai_patterns": {
      const lang = normalizeLanguage(language);
      return join(PACKAGE_ROOT, "skills", "academic-writer-write", "references", `anti-ai-patterns-${lang}.md`);
    }
    case "voice_profile_load":
      return join(PACKAGE_ROOT, "skills", "academic-writer-write", "references", "voice-profile-load.md");
    case "run_state_contract":
      return join(PACKAGE_ROOT, "skills", "academic-writer-write", "references", "run-state-contract.md");
    case "citation_export_contract":
      return join(PACKAGE_ROOT, "skills", "academic-writer-write", "references", "citation-export-contract.md");
    case "citation_review_gate":
      return join(PACKAGE_ROOT, "skills", "academic-writer-review", "references", "citation-review-gate.md");
    default:
      throw new Error(
        `Unknown Academic Writer resource ${JSON.stringify(name)}. Supported resources: thresholds, words, scorecard, style_fingerprint_rubric, anti_ai_patterns, voice_profile_load, run_state_contract, citation_export_contract, citation_review_gate.`,
      );
  }
}
