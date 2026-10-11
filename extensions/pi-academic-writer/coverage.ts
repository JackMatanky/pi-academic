export type CoverageFinding = {
  code: string;
  path: string;
  explanation: string;
};

export function diagnoseChapterCoverage(json: string): CoverageFinding[] {
  const findings: CoverageFinding[] = [];
  const add = (code: string, path: string, explanation: string) =>
    findings.push({ code, path, explanation });
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw Error("evidence map must be a JSON object");
    const root = parsed as Record<string, unknown>;
    if (root.chapter_coverage === undefined) return findings;
    const coverage = root.chapter_coverage;
    const counts = root.chapter_counts;
    if (!coverage || typeof coverage !== "object" || Array.isArray(coverage))
      throw Error("chapter_coverage must map book names to chapter arrays");
    if (!counts || typeof counts !== "object" || Array.isArray(counts))
      throw Error(
        "chapter_counts must map book names to positive chapter counts",
      );
    const ids = new Set<string>();
    const collect = (value: unknown): void => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(collect);
        return;
      }
      const record = value as Record<string, unknown>;
      if (typeof record.id === "string") ids.add(record.id);
      Object.values(record).forEach(collect);
    };
    collect(root);
    for (const [book, entries] of Object.entries(
      coverage as Record<string, unknown>,
    )) {
      const base = "$.chapter_coverage." + book;
      if (!Array.isArray(entries)) {
        add(
          "unsupported-chapter-coverage",
          base,
          "Book coverage must be an array of chapter records.",
        );
        continue;
      }
      const chapters = new Set<number>();
      entries.forEach((item, index) => {
        const at = base + "[" + index + "]";
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          add(
            "unsupported-chapter-coverage",
            at,
            "Chapter entry must be an object.",
          );
          return;
        }
        const entry = item as Record<string, unknown>;
        const chapter = entry.chapter;
        if (
          typeof chapter !== "number" ||
          !Number.isInteger(chapter) ||
          chapter < 1
        ) {
          add(
            "unsupported-chapter-coverage",
            at + ".chapter",
            "Chapter must be a positive integer.",
          );
          return;
        }
        if (chapters.has(chapter))
          add(
            "duplicate-chapter",
            at + ".chapter",
            "Chapter " + chapter + " is duplicated.",
          );
        chapters.add(chapter);
        if (entry.status === "skipped-irrelevant") {
          if (typeof entry.reason !== "string" || !entry.reason.trim())
            add(
              "invalid-chapter-status",
              at + ".reason",
              "Skipped chapters require a reason.",
            );
        } else if (entry.status === "covered") {
          if (!Array.isArray(entry.evidence_ids) || !entry.evidence_ids.length)
            add(
              "invalid-chapter-status",
              at + ".evidence_ids",
              "Covered chapters require evidence IDs.",
            );
          else
            entry.evidence_ids.forEach((id, i) => {
              if (typeof id !== "string" || !ids.has(id))
                add(
                  "unresolved-evidence-id",
                  at + ".evidence_ids[" + i + "]",
                  "Evidence ID " +
                    String(id) +
                    " does not resolve in the supplied map.",
                );
            });
        } else
          add(
            "invalid-chapter-status",
            at + ".status",
            "Status must be covered or skipped-irrelevant.",
          );
      });
      const last = (counts as Record<string, unknown>)[book];
      if (typeof last !== "number" || !Number.isInteger(last) || last < 1) {
        add(
          "unsupported-chapter-count",
          "$.chapter_counts." + book,
          "Supply the verified final chapter number as a positive integer.",
        );
        continue;
      }
      for (let n = 1; n <= last; n++)
        if (!chapters.has(n))
          add(
            "missing-chapter",
            base,
            "Chapter " +
              n +
              " is missing from coverage through declared book end " +
              last +
              ".",
          );
      for (const n of chapters)
        if (n > last)
          add(
            "chapter-exceeds-book-count",
            base,
            "Chapter " + n + " exceeds declared final chapter " + last + ".",
          );
    }
  } catch (error) {
    add(
      "unsupported-chapter-coverage",
      "$.chapter_coverage",
      error instanceof Error ? error.message : String(error),
    );
  }
  return findings;
}
