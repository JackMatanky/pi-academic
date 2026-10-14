/**
 * One parsed BibTeX entry: identity, raw source text, and printable text.
 */
export interface BibEntry {
  key: string;
  /**
   * Lowercase entry type, e.g. `article`, `book`.
   */
  type: string;
  /**
   * Raw entry text from `@type{` through its closing brace.
   */
  text: string;
  /**
   * Entry text with BibTeX field syntax stripped, for word counting.
   */
  cleanedText: string;
}

const ENTRY_START = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g;

/**
 * Parses BibTeX text into entries by tracking balanced braces, so `@` inside
 * fields (e-mails, DOIs, notes) never splits an entry. Unclosed braces are
 * recovered at the next line-initial `@type{`.
 *
 * @param bibText - Raw BibTeX bibliography text.
 *
 * @returns Entries keyed by citekey; a duplicate key keeps the last entry.
 */
export function parseBibEntries(bibText: string): Map<string, BibEntry> {
  const entries = new Map<string, BibEntry>();

  ENTRY_START.lastIndex = 0;

  let match: RegExpExecArray | null;

  while ((match = ENTRY_START.exec(bibText)) !== null) {
    const type = (match[1] ?? "").toLowerCase();
    const key = match[2] ?? "";

    if (!key) continue;

    const bodyStart = match.index + match[0].length;
    let depth = 1;
    let i = bodyStart;

    while (i < bibText.length && depth > 0) {
      const char = bibText[i];

      if (char === "\\") {
        i += 2;
        continue;
      }

      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
      }

      if (depth === 0) break;

      // Recover from unclosed braces when the next entry starts on a new line.
      if (char === "\n" || char === "\r") {
        const next = bibText.slice(
          char === "\r" && bibText[i + 1] === "\n" ? i + 2 : i + 1,
        );

        if (/^@\w+\s*\{/.test(next)) break;
      }

      i += 1;
    }

    ENTRY_START.lastIndex = depth === 0 ? i + 1 : i;

    const text = bibText.slice(match.index, depth === 0 ? i + 1 : i);
    const body = bibText.slice(bodyStart, i);

    // Clean BibTeX syntax into printable word-like text:
    // field = {Value}, field = "Value" -> Value
    const cleanedText = body
      .replace(/^\s*\w+\s*=\s*[{"']?|[}"']?,?\s*$/gm, " ")
      .replace(/[{}\\"']/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    entries.set(key, { key, type, text, cleanedText });
  }

  return entries;
}
