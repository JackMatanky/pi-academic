import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { writeFileAtomic } from "../lib/fs-safe.js";

export type Note = {
  id: string;
  kind:
    | "quotation"
    | "paraphrase"
    | "summary"
    | "analysis"
    | "question"
    | "idea";
  coreStatement: string;
  sourceRef?: string;
  anchor?: {
    locator: { display: string };
    pdfPageIndex?: number;
    textQuote?: { exact: string; prefix?: string; suffix?: string };
    sourceFingerprint?: string;
  };
  researcherNote?: string;
  tags: string[];
  review: { state: "unchecked" | "verified" | "stale" };
  createdAt: string;
};

export type Point = {
  id: string;
  role: string;
  kind: "point";
  claim?: string;
  reasoning?: string;
  noteUses: Array<{
    noteId: string;
    function: string;
    handling: string;
    coverage: "primary" | "reference";
  }>;
  targetParagraphCount?: number;
  draftText?: string;
};

export type Section = {
  id: string;
  kind: "section";
  title: string;
  purpose: string;
  thesisContribution: string;
  targetWordCount?: number;
  items: Array<Section | Point>;
};

export type Outline = {
  schemaVersion: 1;
  article: {
    slug: string;
    title: string;
    targetLanguage: string;
    citationStyle: string;
  };
  researchQuestion: string;
  thesis: { text: string; status: "proposed" | "approved" };
  status: "draft" | "approved";
  items: Array<Section | Point>;
};

export const kinds = [
  "quotation",
  "paraphrase",
  "summary",
  "analysis",
  "question",
  "idea",
];

export function obj(x: unknown, label: string): Record<string, unknown> {
  if (!x || typeof x !== "object" || Array.isArray(x))
    throw Error(label + " must be an object");

  return x as Record<string, unknown>;
}

export function strict(
  x: Record<string, unknown>,
  allowed: string[],
  label: string,
): void {
  const bad = Object.keys(x).filter((k) => !allowed.includes(k));

  if (bad.length) throw Error(label + " unknown key(s): " + bad.join(", "));
}

export function str(x: unknown, label: string): string {
  if (typeof x !== "string" || !x.trim())
    throw Error(label + " must be non-empty");

  return x;
}

export function arr(x: unknown, label: string): unknown[] {
  if (!Array.isArray(x)) throw Error(label + " must be an array");

  return x;
}

export function read(p: string): unknown {
  return JSON.parse(readFileSync(p, "utf8")) as unknown;
}

export function save(p: string, x: unknown): void {
  writeFileAtomic(p, JSON.stringify(x, null, 2) + "\n");
}

export function slug(a: string): string {
  return basename(a).replace(/\.[^.]+$/, "");
}

export function sources(r: string): Array<Record<string, unknown>> {
  const p = join(r, ".academic-writer", "sources.json");

  if (!existsSync(p)) return [];
  const v = read(p);

  if (!Array.isArray(v)) throw Error("Source registry must be an array");

  return v.map((x) => obj(x, "source"));
}
