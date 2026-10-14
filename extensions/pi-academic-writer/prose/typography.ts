/**
 * Typography fixes for Hebrew: spaced hyphen for em dashes, gereshayim for
 * paired straight quotes around Hebrew text, and no stray directional marks.
 * Orphan leading punctuation (a mark followed by whitespace) is dropped only
 * from paragraph text, never from match markers, so `.NET` is left alone.
 *
 * @param text - Hebrew or mixed-language text to normalize.
 * @param trimOrphan - Whether to drop leading orphan punctuation marks.
 *
 * @returns Cleaned and normalized text.
 */
export function cleanRtlText(text: string, trimOrphan = true): string {
  let out = text
    .replace(/\s*\u2014\s*/g, " - ")
    .replace(/"([^"\n]+)"/g, (quoted, inner: string) =>
      /[\u0590-\u05ff]/.test(inner) ? `\u05f4${inner}\u05f4` : quoted,
    )
    .replace(/\u200f+(?=[.,;:)\]"])/g, "")
    .replace(/(?<=[([])\u200e+/g, "")
    .replace(/[\u200e\u200f]{2,}/g, "");

  if (trimOrphan) out = out.replace(/^\s*[.,;:](?=\s)/, "").trim();

  return out;
}
