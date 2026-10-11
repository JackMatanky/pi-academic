import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

/** An audit with an article path resolved inside the project. */
export interface CitationAuditDetails {
  ok: boolean;
  article: string;
  citationStyle: string;
  mode: "inline-parenthetical" | "citeproc";
  assetScope: "article" | "global" | null;
  sourcesPath: string | null;
  bibliographyPath: string | null;
  markers: string[];
  citationKeys: string[];
  missingFromSources: string[];
  missingFromBibliography: string[];
  malformedMarkers: string[];
  warnings: string[];
  error?: string;
}

/** Invalid project/article paths return only an error, as in the Python CLI. */
export type CitationAuditResult =
  CitationAuditDetails | { ok: false; error: string };

const markerPattern = /\[((?:[^\[\]]|\\.)*@(?:[^\[\]]|\\.)*)\]/gu;
const citeKeyPattern = /@([A-Za-z0-9_:.#$%&+?<>~/\-]+)/gu;
const bibliographyKeyPattern = /@[\p{L}\p{N}_]+\s*\{\s*([^,\s]+)\s*,/gu;

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

// Path.resolve() in Python follows existing symlink parents even for a missing leaf.
function resolveRealPath(path: string): string {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  return parent === path ? path : join(resolveRealPath(parent), basename(path));
}

function collectCiteKeys(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectCiteKeys(item, keys);
  } else if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.citeKey === "string" && record.citeKey.trim()) {
      keys.add(record.citeKey.trim());
    }
    for (const item of Object.values(record)) {
      if (item !== null && typeof item === "object")
        collectCiteKeys(item, keys);
    }
  }
}

/** Audit Markdown citation markers against article-local or project-wide assets. */
export function auditCitations(
  article: string,
  citationStyle: string,
  projectRoot: string,
): CitationAuditResult {
  try {
    const root = resolveRealPath(resolve(projectRoot));
    const expandedArticle =
      article === "~"
        ? homedir()
        : article.startsWith(`~${sep}`)
          ? join(homedir(), article.slice(2))
          : article;
    const articlePath = resolveRealPath(
      isAbsolute(expandedArticle)
        ? expandedArticle
        : resolve(root, expandedArticle),
    );
    const articleRelative = relative(root, articlePath);
    if (
      articleRelative === ".." ||
      articleRelative.startsWith(`..${sep}`) ||
      isAbsolute(articleRelative)
    ) {
      throw new Error(`Path must stay inside project root: ${article}`);
    }

    const result: CitationAuditDetails = {
      ok: true,
      article: articleRelative,
      citationStyle,
      mode:
        citationStyle === "inline-parenthetical"
          ? "inline-parenthetical"
          : "citeproc",
      assetScope: null,
      sourcesPath: null,
      bibliographyPath: null,
      markers: [],
      citationKeys: [],
      missingFromSources: [],
      missingFromBibliography: [],
      malformedMarkers: [],
      warnings: [],
    };
    if (!isFile(articlePath)) {
      result.ok = false;
      result.error = `Article not found: ${articlePath}`;
      return result;
    }

    const text = readFileSync(articlePath, "utf8");
    const markers = Array.from(
      text.matchAll(markerPattern),
      (match) => match[0],
    );
    const keys = new Set<string>();
    const malformed: string[] = [];
    for (const marker of markers) {
      const found = Array.from(
        marker.matchAll(citeKeyPattern),
        (match) => match[1],
      );
      if (!found.length) malformed.push(marker);
      for (const key of found) keys.add(key);
    }
    result.markers = markers;
    result.citationKeys = [...keys];
    result.malformedMarkers = malformed;
    if (citationStyle === "inline-parenthetical") {
      if (markers.length) {
        result.ok = false;
        result.error =
          "inline-parenthetical articles must not contain Pandoc citeproc markers";
      }
      return result;
    }

    const suffix = extname(articlePath);
    const articleBase = suffix
      ? articlePath.slice(0, -suffix.length)
      : articlePath;
    const localSources = `${articleBase}.sources.json`;
    const localBibliography = `${articleBase}.bibliography.bib`;
    const scope =
      isFile(localSources) || isFile(localBibliography) ? "article" : "global";
    const sources =
      scope === "article"
        ? localSources
        : join(root, ".academic-writer", "sources.json");
    const bibliography =
      scope === "article"
        ? localBibliography
        : join(root, ".academic-writer", "bibliography.bib");
    result.assetScope = scope;
    result.sourcesPath = relative(root, sources);
    result.bibliographyPath = relative(root, bibliography);
    if (!markers.length)
      result.warnings.push("No Pandoc citeproc markers found");
    if (malformed.length) result.ok = false;

    if (!isFile(sources)) {
      result.ok = false;
      result.error = `${result.sourcesPath} not found`;
      return result;
    }
    const sourceKeys = new Set<string>();
    try {
      collectCiteKeys(
        JSON.parse(readFileSync(sources, "utf8")) as unknown,
        sourceKeys,
      );
    } catch (error) {
      result.ok = false;
      result.error = `Could not read ${result.sourcesPath}: ${error instanceof Error ? error.message : String(error)}`;
      return result;
    }
    if (!isFile(bibliography)) {
      result.ok = false;
      result.error = `${result.bibliographyPath} not found`;
      return result;
    }
    const bibliographyKeys = new Set(
      Array.from(
        readFileSync(bibliography, "utf8").matchAll(bibliographyKeyPattern),
        (match) => match[1],
      ),
    );
    result.missingFromSources = result.citationKeys.filter(
      (key) => !sourceKeys.has(key),
    );
    result.missingFromBibliography = result.citationKeys.filter(
      (key) => !bibliographyKeys.has(key),
    );
    if (
      result.missingFromSources.length ||
      result.missingFromBibliography.length
    )
      result.ok = false;
    return result;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
