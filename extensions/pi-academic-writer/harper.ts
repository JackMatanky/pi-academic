import { Dialect, LocalLinter, SuggestionKind } from "harper.js";
import { binary } from "harper.js/binary";

/**
 * English dialect selection for Harper.
 */
export type HarperDialect = "American" | "British";

/**
 * One Harper-proposed fix for a finding.
 */
export interface HarperSuggestion {
  kind: "remove" | "replace";
  replacementText: string | null;
}

/**
 * One Harper finding: the character span, its message, and proposed fixes.
 */
export interface HarperFinding {
  start: number;
  end: number;
  message: string;
  suggestions: HarperSuggestion[];
}

// One linter per dialect: the wasm instance is expensive to build and dialect
// is baked into the constructor, so instances are cached per dialect.
const linters = new Map<HarperDialect, LocalLinter>();

function linterFor(dialect: HarperDialect): LocalLinter {
  const existing = linters.get(dialect);

  if (existing) return existing;

  const created = new LocalLinter({ binary, dialect: Dialect[dialect] });

  linters.set(dialect, created);

  return created;
}

/**
 * Lints English text with Harper and returns plain, serializable findings.
 * Construction or lint errors propagate; the tool handler converts them to a
 * ToolFailure ("harper unavailable") — there is no silent empty-result
 * fallback.
 */
export async function lintWithHarper(
  text: string,
  dialect: HarperDialect,
): Promise<HarperFinding[]> {
  const lints = await linterFor(dialect).lint(text);

  return lints.map((lint) => {
    const span = lint.span();

    return {
      start: span.start,
      end: span.end,
      message: lint.message(),
      suggestions: lint
        .suggestions()
        // InsertAfter is outside the advisory "remove | replace" contract.
        .filter(
          (suggestion) => suggestion.kind() !== SuggestionKind.InsertAfter,
        )
        .map((suggestion) => ({
          kind:
            suggestion.kind() === SuggestionKind.Remove
              ? ("remove" as const)
              : ("replace" as const),
          replacementText:
            suggestion.kind() === SuggestionKind.Remove
              ? null
              : suggestion.get_replacement_text(),
        })),
    };
  });
}
