import { randomUUID } from "node:crypto";
import {
  closeSync,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join, relative, sep } from "node:path";

const POPULAR_STYLES: Record<string, string> = {
  apa: "apa",
  "apa-7": "apa",
  "apa-7th": "apa",
  "apa-7th-edition": "apa",
  "american-psychological-association": "apa",
  mla: "modern-language-association",
  "modern-language-association": "modern-language-association",
  chicago: "chicago-notes-bibliography",
  "chicago-18": "chicago-notes-bibliography",
  "chicago-notes": "chicago-notes-bibliography",
  "chicago-notes-bibliography": "chicago-notes-bibliography",
  "chicago-note-bibliography": "chicago-notes-bibliography",
  "chicago-fullnote-bibliography": "chicago-fullnote-bibliography",
  "chicago-18-notes-bibliography": "chicago-notes-bibliography",
  "chicago-18-notes-and-bibliography": "chicago-notes-bibliography",
  "chicago-author-date": "chicago-author-date",
  "chicago-18-author-date": "chicago-author-date",
  turabian: "turabian-fullnote-bibliography",
  "turabian-notes": "turabian-fullnote-bibliography",
  harvard: "harvard-cite-them-right",
  "harvard-cite-them-right": "harvard-cite-them-right",
  ieee: "ieee",
  nature: "nature",
  vancouver: "vancouver",
  ama: "american-medical-association",
  "american-medical-association": "american-medical-association",
  apsa: "american-political-science-association",
  "american-political-science-association":
    "american-political-science-association",
  asa: "american-sociological-association",
  "american-sociological-association": "american-sociological-association",
  mhra: "modern-humanities-research-association",
  "modern-humanities-research-association":
    "modern-humanities-research-association",
  "elsevier-harvard": "elsevier-harvard",
  cell: "cell",
  science: "science",
};

const ZOTERO_STYLE_BASE = "https://www.zotero.org/styles";
const RAW_CSL_BASE =
  "https://raw.githubusercontent.com/citation-style-language/styles/master";

function looksLikeCsl(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 2048))
    .toString("utf8")
    .toLowerCase();
  return (
    head.includes("<style") &&
    (head.includes("citationstyles.org") ||
      head.includes("purl.org/net/xbiblio/csl"))
  );
}

function validateCsl(path: string): string {
  if (!existsSync(path)) throw new Error(`CSL file not found: ${path}`);
  if (extname(path).toLowerCase() !== ".csl")
    throw new Error(`CSL path must end in .csl: ${path}`);
  const fd = openSync(path, "r");
  const head = Buffer.alloc(2048);
  let length: number;
  try {
    length = readSync(fd, head, 0, head.length, 0);
  } finally {
    closeSync(fd);
  }
  if (!looksLikeCsl(head.subarray(0, length)))
    throw new Error(`File does not look like a CSL style: ${path}`);
  return realpathSync(path);
}

function styleId(style: string): string {
  const raw = style.trim().replace(/\.csl$/, "");
  const key = raw
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return POPULAR_STYLES[key] ?? raw;
}

function safeCacheName(id: string): string {
  const name = styleId(id);
  if (
    !name ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("..") ||
    name === "."
  )
    throw new Error(`Invalid CSL style id: ${id}`);
  return name;
}

function cacheTarget(url: string, cacheDir: string): string {
  const path = new URL(url).pathname.replace(/\/+$/, "");
  let name = basename(path) || "style";
  if (name === "styles") name = "style";
  if (!name.endsWith(".csl")) name += ".csl";
  return join(cacheDir, name);
}

async function downloadUrl(
  url: string,
  target: string,
  projectRoot: string,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    )
      throw new Error(`Timed out downloading CSL URL: ${url}`, {
        cause: error,
      });
    throw new Error(`Could not download CSL URL ${url}: ${String(error)}`, {
      cause: error,
    });
  }
  if (!response.ok)
    throw new Error(`CSL URL not found: ${url} (${response.status})`);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    throw new Error(`Could not download CSL URL ${url}: ${String(error)}`, {
      cause: error,
    });
  }
  if (!looksLikeCsl(bytes))
    throw new Error(`File does not look like a CSL style: ${target}`);

  const dir = join(projectRoot, ".academic-writer", "csl");
  mkdirSync(dir, { recursive: true });
  const root = realpathSync(projectRoot);
  const cache = realpathSync(dir);
  const pathFromRoot = relative(root, cache);
  if (
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  )
    throw new Error(`CSL cache must remain inside the project: ${dir}`);
  const temporary = join(dir, `.${randomUUID()}.csl.tmp`);
  try {
    writeFileSync(temporary, bytes, { flag: "wx" });
    try {
      linkSync(temporary, target);
    } catch (error) {
      if (!existsSync(target)) throw error;
    }
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  return validateCsl(target);
}

async function downloadStyle(
  id: string,
  cacheDir: string,
  projectRoot: string,
): Promise<string> {
  const safeId = safeCacheName(id);
  const target = join(cacheDir, `${safeId}.csl`);
  if (existsSync(target)) return validateCsl(target);
  const errors: string[] = [];
  for (const url of [
    `${ZOTERO_STYLE_BASE}/${safeId}`,
    `${RAW_CSL_BASE}/${safeId}.csl`,
  ]) {
    try {
      return await downloadUrl(url, target, projectRoot);
    } catch (error) {
      errors.push(String(error instanceof Error ? error.message : error));
    }
  }
  throw new Error(
    `CSL style id not found via Zotero or citation-style-language/styles: ${safeId}. ${errors.join(" | ")}`,
  );
}

/** Resolve an alias, style ID, local .csl path, or URL to an absolute project-cached/local style path. */
export async function resolveCslStyle(
  style: string,
  projectRoot: string,
  download = false,
): Promise<string> {
  const raw = style.trim();
  if (!raw) throw new Error("CSL style is empty");
  const cacheDir = join(projectRoot, ".academic-writer", "csl");
  if (raw.startsWith("https://") || raw.startsWith("http://")) {
    const target = cacheTarget(raw, cacheDir);
    return existsSync(target)
      ? validateCsl(target)
      : downloadUrl(raw, target, projectRoot);
  }
  if (raw.endsWith(".csl") || raw.includes(sep)) {
    const expanded = raw.startsWith("~/") ? join(homedir(), raw.slice(2)) : raw;
    const candidates = isAbsolute(expanded)
      ? [expanded]
      : [join(projectRoot, expanded), join(cacheDir, basename(expanded))];
    for (const path of candidates)
      if (existsSync(path)) return validateCsl(path);
    if (raw.endsWith(".csl") && download)
      return downloadStyle(raw.slice(0, -4), cacheDir, projectRoot);
    throw new Error(`CSL file not found. Tried: ${candidates.join(", ")}`);
  }
  const id = styleId(raw);
  const cached = join(cacheDir, `${safeCacheName(id)}.csl`);
  if (existsSync(cached)) return validateCsl(cached);
  if (download) return downloadStyle(id, cacheDir, projectRoot);
  throw new Error(
    `Unknown CSL style '${raw}'. Use a common alias, a Zotero/CSL style id, a .csl path/URL, or rerun with --download.`,
  );
}
