import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PACKAGE_ROOT } from "../../lib/paths.js";
import { thresholdsDefaultJson } from "./thresholds-default.js";
import { fail } from "./tool-kit.js";

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
 * Stable names of the packaged resources `pi_academic_read_resource` serves.
 */
export const RESOURCE_NAMES = [
  "thresholds",
  "words",
  "scorecard",
  "style_fingerprint_rubric",
  "anti_ai_patterns",
  "voice_profile_load",
  "voice_profile_template",
  "run_state_contract",
  "citation_export_contract",
  "pandoc_citation_syntax",
  "article_metadata",
  "citation_review_gate",
  "dispatch_contract",
] as const;

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
    case "pandoc_citation_syntax":
      return join(
        PACKAGE_ROOT,
        "skills",
        "academic-write",
        "references",
        "pandoc-citation-syntax.md",
      );
    case "article_metadata":
      return join(
        PACKAGE_ROOT,
        "skills",
        "academic-write",
        "references",
        "article-metadata.md",
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
        `Unknown Academic Writer resource ${JSON.stringify(name)}. Supported resources: ${RESOURCE_NAMES.join(", ")}.`,
      );
  }
}

/**
 * Result of loading an Academic Writer package or project resource.
 */
export interface LoadedResource {
  content: string;
  path: string;
  source: "project" | "package";
}

/**
 * Loads an Academic Writer resource by name. Thresholds resolves the project
 * override (.pi-academic/thresholds.json) when present, falling back to the
 * package default. All other resources resolve to their packaged files.
 *
 * @param name - Stable resource name.
 * @param projectRoot - Root directory of the project.
 * @param language - Optional language selector for language-specific resources.
 */
export function loadResource(
  name: string,
  projectRoot: string,
  language?: string,
): LoadedResource {
  if (name === "thresholds") {
    const override = join(projectRoot, ".pi-academic", "thresholds.json");

    if (existsSync(override)) {
      return {
        content: readFileSync(override, "utf-8"),
        path: override,
        source: "project",
      };
    }

    return {
      content: thresholdsDefaultJson(),
      path: "extensions/pi-academic/core/thresholds-default.ts (package default)",
      source: "package",
    };
  }

  const path = resolveResourcePath(name, projectRoot, language);

  if (!existsSync(path)) {
    fail(`Academic Writer resource not found: ${name}`, {
      ok: false,
      name,
      path,
    });
  }

  const content = readFileSync(path, "utf-8");

  return { content, path, source: "package" };
}
