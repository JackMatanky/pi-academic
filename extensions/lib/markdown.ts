/**
 * Tracks fenced code blocks line by line.
 *
 * Pass the previous return value (`null` outside a fence) with each line. A
 * line belongs to code when either the incoming or the returned state is
 * non-null, which covers the opening and closing fence lines themselves.
 *
 * @param line - Current text line to test for opening or closing fences.
 * @param open - Fence marker active prior to this line, or null if outside
 *   code.
 *
 * @returns The fence marker that is open after `line`, or `null`.
 */
export function fenceAfter(line: string, open: string | null): string | null {
  const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];

  if (!marker) return open;

  if (open === null) return marker;

  return marker[0] === open[0] && marker.length >= open.length ? null : open;
}
