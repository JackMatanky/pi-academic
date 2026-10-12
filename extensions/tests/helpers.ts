import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Type, type Static, type TSchema } from "typebox";
import { parse } from "yaml";

import {
  isValid,
  JsonArraySchema,
  JsonObjectSchema,
  type JsonObject,
  type JsonValue,
} from "../lib/schema.js";
import piAcademicWriter from "../pi-academic-writer/index.js";
import { ToolFailure } from "../pi-academic-writer/tool-kit.js";

/**
 * The repository root. Compiled tests live in
 * `<root>/.aw-ts-test/extensions/tests/`.
 */
export const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const SKIPPED_DIRS = new Set(["node_modules", ".git", ".venv", ".aw-ts-test"]);

/**
 * Reads a UTF-8 file relative to the repository root.
 */
export function readRepo(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

/**
 * Recursively lists repo-relative files under `dirRel` with one of `suffixes`.
 * `dirRel` of `"."` walks the whole repository.
 */
export function repoFiles(dirRel: string, suffixes: string[]): string[] {
  const found: string[] = [];

  const walk = (rel: string): void => {
    for (const entry of readdirSync(join(repoRoot, rel), {
      withFileTypes: true,
    })) {
      const child = rel === "." ? entry.name : `${rel}/${entry.name}`;

      if (entry.isDirectory()) {
        if (
          !SKIPPED_DIRS.has(entry.name) &&
          !entry.name.startsWith(".aw-runtime")
        )
          walk(child);
      } else if (suffixes.some((suffix) => entry.name.endsWith(suffix))) {
        found.push(child);
      }
    }
  };

  walk(dirRel);

  return found.sort();
}

/**
 * A markdown file split into its leading `---` YAML block and the rest.
 * `frontmatter` is null when there is no block or it is not a mapping.
 */
export interface Frontmatter {
  frontmatter: JsonObject | null;
  body: string;
}

export function parseFrontmatter(rel: string): Frontmatter {
  const content = readRepo(rel);
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)/.exec(content);

  if (!match) return { frontmatter: null, body: content };

  let value: unknown;

  try {
    value = parse(match[1] ?? "");
  } catch {
    return { frontmatter: null, body: content };
  }

  return {
    frontmatter: isValid(JsonObjectSchema, value) ? value : null,
    body: match[2] ?? "",
  };
}

/**
 * Navigates objects and arrays; any miss gives `undefined`.
 */
export function get(
  value: JsonValue | undefined,
  ...path: (string | number)[]
): JsonValue | undefined {
  let current = value;

  for (const key of path) {
    if (isValid(JsonArraySchema, current)) {
      current = isValid(Type.Number(), key) ? current[key] : undefined;
    } else if (isValid(JsonObjectSchema, current)) {
      current = isValid(Type.String(), key) ? current[key] : undefined;
    } else {
      return undefined;
    }
  }

  return current;
}

type Params = JsonObject;

export interface ToolResult {
  content: { text: string }[];
  details: JsonObject;
  isError?: boolean;
}

const OmpExtrasSchema = Type.Object({
  approval: Type.Optional(Type.Function([Type.Unknown()], Type.String())),
  loadMode: Type.Optional(Type.String()),
});

/**
 * What the tests inspect of a registered tool; `approval` and `loadMode` are
 * oh-my-pi extras that pi's `ToolDefinition` does not declare.
 */
export interface RegisteredTool {
  name: string;
  description: string;
  parameters: TSchema;
  execute: ToolDefinition["execute"];
  approval: Static<typeof OmpExtrasSchema>["approval"];
  loadMode: Static<typeof OmpExtrasSchema>["loadMode"];
}

export interface ToolHarness {
  callTool(cwd: string, name: string, params: Params): Promise<ToolResult>;
  definitions: Map<string, RegisteredTool>;
}

/**
 * Loads the extension against a fake `ExtensionAPI` that records every
 * registered tool, and returns a way to run them like pi would.
 */
export function createToolHarness(
  options: { zod?: boolean; activeTools?: string[]; allTools?: string[] } = {},
): ToolHarness {
  const definitions = new Map<string, RegisteredTool>();

  const extensionApi: Partial<ExtensionAPI> & { zod?: object } = {
    registerTool: (definition) => {
      const extras: Static<typeof OmpExtrasSchema> = isValid(
        OmpExtrasSchema,
        definition,
      )
        ? definition
        : {};

      definitions.set(definition.name, {
        name: definition.name,
        description: definition.description,
        parameters: definition.parameters,
        execute: definition.execute,
        approval: extras.approval,
        loadMode: extras.loadMode,
      });
    },
    getActiveTools: () => options.activeTools ?? [],
    getAllTools: () =>
      (options.allTools ?? []).map((name) => ({
        name,
        description: "",
        parameters: Type.Object({}),
        sourceInfo: {
          path: "",
          source: "test",
          scope: "temporary",
          origin: "top-level",
        },
      })),
  };

  if (options.zod) extensionApi.zod = {};

  // SAFETY: `extensionApi` implements the members the tools call.
  piAcademicWriter(extensionApi as ExtensionAPI);

  return {
    definitions,
    async callTool(cwd, name, params) {
      const definition = definitions.get(name);

      assert.ok(definition, `${name} is not registered`);

      try {
        // SAFETY: the tools read only `cwd` from the context.
        const context = { cwd } as ExtensionContext;

        const result = await definition.execute(
          "t",
          params,
          undefined,
          undefined,
          context,
        );

        return {
          content: result.content.flatMap((part) =>
            part.type === "text" ? [{ text: part.text }] : [],
          ),
          details: isValid(JsonObjectSchema, result.details)
            ? result.details
            : {},
          isError: false,
        };
      } catch (cause) {
        if (!(cause instanceof ToolFailure)) throw cause;

        return {
          content: [{ text: cause.text }],
          details: cause.details,
          isError: true,
        };
      }
    },
  };
}
