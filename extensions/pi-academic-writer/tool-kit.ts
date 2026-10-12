import type {
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { Static, TSchema } from "typebox";

import { errorMessage } from "../lib/fs-safe.js";
import {
  assertValid,
  isValid,
  JsonArraySchema,
  JsonObjectSchema,
  parseJsonText,
  type JsonObject,
  type JsonValue,
} from "../lib/schema.js";
import { boundOutput } from "./output-bound.js";

/**
 * What a tool hands back on success: text for the model and structured details
 * for callers.
 */
export interface ToolOutput {
  text: string;
  details?: object;
}

/**
 * Per-call context: the project directory and the abort signal.
 */
export interface ToolContext {
  cwd: string;
  signal: AbortSignal | undefined;
  /**
   * Streams an interim status line to the caller while the tool runs.
   */
  progress(text: string): void;
}

/**
 * A failed tool call. Pi marks a call as an error only when `execute` throws,
 * so failures are thrown; the structured details ride along on the error and
 * are appended to the message because the model sees only the message.
 */
export class ToolFailure<Details extends object = object> extends Error {
  readonly text: string;
  readonly details: Details & { ok: false };

  constructor(text: string, details?: Details) {
    const extra = Object.entries(details ?? {}).filter(
      ([key]) => key !== "ok" && key !== "error",
    );

    super(
      extra.length > 0
        ? `${text}\n${JSON.stringify(Object.fromEntries(extra))}`
        : text,
    );
    this.name = "ToolFailure";
    this.text = text;
    this.details = Object.assign({}, details, { ok: false as const });
  }
}

/**
 * Throws a {@link ToolFailure}.
 */
export function fail<Details extends object>(
  text: string,
  details?: Details,
): never {
  throw new ToolFailure(text, details);
}

/**
 * Parses a JSON object string, or returns null for arrays, primitives and
 * invalid JSON.
 */
export function parseJsonObject(value: string): JsonObject | null {
  return parseJsonAs(JsonObjectSchema, value);
}

/**
 * Parses a JSON array string, or returns null for objects, primitives and
 * invalid JSON.
 */
export function parseJsonArray(value: string): JsonValue[] | null {
  return parseJsonAs(JsonArraySchema, value);
}

function parseJsonAs<S extends TSchema>(
  schema: S,
  text: string,
): Static<S> | null {
  try {
    const parsed = parseJsonText(text);

    return isValid(schema, parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * What a tool may do. oh-my-pi maps it to its approval tier; pi ignores it.
 */
export type ToolEffect = "read" | "write" | "exec";

/**
 * Oh-my-pi extras on a tool definition; pi's `ToolDefinition` does not declare
 * them and ignores them.
 */
interface OmpToolExtras {
  approval: (args: JsonValue) => ToolEffect;
  loadMode?: "essential";
}

export interface ToolSpec<S extends TSchema> {
  name: string;
  label: string;
  description: string;
  parameters: S;
  /**
   * Prefix for unexpected errors, e.g. "CSL resolution failed". Defaults to
   * `<label> failed`.
   */
  failure?: string;
  /**
   * What the tool may do. oh-my-pi maps it to its approval tier; pi ignores it.
   */
  effect: ToolEffect;
  /**
   * Per-call refinement for tools whose effect depends on arguments.
   */
  effectFor?: (params: Static<S>) => ToolEffect;
  /**
   * Keep the tool in oh-my-pi's always-loaded set; all others stay
   * discoverable.
   */
  core?: boolean | undefined;
  run(
    params: Static<S>,
    context: ToolContext,
  ): ToolOutput | Promise<ToolOutput>;
}

/**
 * Registers a tool whose handler returns {@link ToolOutput} and reports problems
 * by throwing. Every error, expected or not, reaches Pi as a thrown
 * {@link ToolFailure}. Output is bounded by {@link boundOutput}.
 */
export function registerTool<S extends TSchema>(
  pi: ExtensionAPI,
  spec: ToolSpec<S>,
): void {
  const extras: OmpToolExtras = {
    approval: (args) =>
      spec.effectFor && isValid(spec.parameters, args)
        ? spec.effectFor(args)
        : spec.effect,
  };

  if (spec.core) extras.loadMode = "essential";

  const definition: ToolDefinition<S> & OmpToolExtras = {
    ...extras,
    name: spec.name,
    label: spec.label,
    description: spec.description,
    parameters: spec.parameters,
    execute: async (_id, params, signal, onUpdate, ctx) => {
      try {
        assertValid(spec.parameters, params, "Invalid tool parameters");

        const output = await spec.run(params, {
          cwd: ctx.cwd,
          signal,
          progress: (text) =>
            onUpdate?.({
              content: [{ type: "text" as const, text }],
              details: {},
            }),
        });

        return {
          content: [
            {
              type: "text" as const,
              text: boundOutput(ctx.cwd, spec.name, output.text),
            },
          ],
          details: output.details ?? {},
        };
      } catch (cause) {
        if (cause instanceof ToolFailure) throw cause;
        throw new ToolFailure(
          `${spec.failure ?? `${spec.label} failed`}: ${errorMessage(cause)}`,
          { error: errorMessage(cause) },
        );
      }
    },
  };

  pi.registerTool(definition);
}
