import { join } from "node:path";

import { PACKAGE_ROOT } from "../lib/paths.js";

/**
 * Narrows resource language options to the packaged anti-AI pattern files.
 *
 * @param language - Optional language selector for language-specific resources.
 */
function normalizeLanguage(language: string | undefined): "english" | "hebrew" {
  if (language === undefined) return "hebrew";
  const normalized = language.trim().toLowerCase();

  return normalized.startsWith("en") || normalized === "english"
    ? "english"
    : "hebrew";
}

/**
 * Resolves a stable Academic Writer resource name to its package file path.
 * Thresholds are not resolved here — the read tool serves the project override
 * or the typed default directly.
 *
 * @param name - Stable packaged resource name.
 * @param _projectRoot - Unused; kept for call-shape stability.
 * @param language - Optional language selector for language-specific resources.
 */
export function resolveResourcePath(
  name: string,
  _projectRoot: string,
  language?: string,
): string {
  switch (name) {
    case "words":
      return join(PACKAGE_ROOT, "words.md");
    case "scorecard":
      return join(
        PACKAGE_ROOT,
        "skills",
        "academic-review",
        "references",
        "scorecard.json",
      );
    case "style_fingerprint_rubric":
      return join(
        PACKAGE_ROOT,
        "skills",
        "academic-write",
        "references",
        "style-fingerprint-rubric.md",
      );
    case "anti_ai_patterns": {
      const lang = normalizeLanguage(language);

      return join(
        PACKAGE_ROOT,
        "skills",
        "academic-write",
        "references",
        `anti-ai-patterns-${lang}.md`,
      );
    }

    case "voice_profile_load":
      return join(
        PACKAGE_ROOT,
        "skills",
        "academic-write",
        "references",
        "voice-profile-load.md",
      );
    case "voice_profile_template":
      return join(PACKAGE_ROOT, "templates", "voice", "profile.md");
    case "run_state_contract":
      return join(
        PACKAGE_ROOT,
        "skills",
        "academic-write",
        "references",
        "run-state-contract.md",
      );
    case "citation_export_contract":
      return join(
        PACKAGE_ROOT,
        "skills",
        "academic-write",
        "references",
        "citation-export-contract.md",
      );
    case "citation_review_gate":
      return join(
        PACKAGE_ROOT,
        "skills",
        "academic-review",
        "references",
        "citation-review-gate.md",
      );
    case "dispatch_contract":
      return join(
        PACKAGE_ROOT,
        "skills",
        "academic-write",
        "references",
        "dispatch-contract.md",
      );
    default:
      throw new Error(
        `Unknown Academic Writer resource ${JSON.stringify(name)}. Supported resources: thresholds, words, scorecard, style_fingerprint_rubric, anti_ai_patterns, voice_profile_load, voice_profile_template, run_state_contract, citation_export_contract, citation_review_gate, dispatch_contract.`,
      );
  }
}
