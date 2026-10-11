import { existsSync } from "node:fs";
import { join } from "node:path";
import { PACKAGE_ROOT } from "../lib/paths.js";

/**
 * Narrows resource language options to the packaged anti-AI pattern files.
 *
 * @param language - Optional language selector for language-specific resources.
 */
function normalizeLanguage(language: unknown): "english" | "hebrew" {
  if (typeof language !== "string") return "hebrew";
  const normalized = language.trim().toLowerCase();

  return normalized.startsWith("en") || normalized === "english"
    ? "english"
    : "hebrew";
}

/**
 * Resolves a stable Academic Writer resource name to its package/project file path.
 *
 * @param name - Stable packaged resource name.
 * @param projectRoot - Absolute project root used to resolve project-relative files.
 * @param language - Optional language selector for language-specific resources.
 */
export function resolveResourcePath(
  name: string,
  projectRoot: string,
  language?: unknown,
): string {
  switch (name) {
    case "thresholds": {
      const projectOverride = join(
        projectRoot,
        ".academic-writer",
        "thresholds.json",
      );

      return existsSync(projectOverride)
        ? projectOverride
        : join(PACKAGE_ROOT, "thresholds.json");
    }

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
    default:
      throw new Error(
        `Unknown Academic Writer resource ${JSON.stringify(name)}. Supported resources: thresholds, words, scorecard, style_fingerprint_rubric, anti_ai_patterns, voice_profile_load, run_state_contract, citation_export_contract, citation_review_gate.`,
      );
  }
}
