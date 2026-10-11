import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Static, TSchema } from "typebox";
import { errorMessage } from "../lib/fs-safe.js";

/** What a tool hands back on success: text for the model and structured details for callers. */
export interface ToolOutput {
  text: string;
  details?: object;
}

/** Per-call context: the project directory and the abort signal. */
export interface ToolContext {
  cwd: string;
  signal: AbortSignal | undefined;
}

/**
 * A failed tool call. Pi marks a call as an error only when `execute` throws, so
 * failures are thrown; the structured details ride along on the error and are
 * appended to the message because the model sees only the message.
 */
export class ToolFailure extends Error {
  readonly text: string;
  readonly details: { ok: false } & Record<string, unknown>;

  constructor(text: string, details: object = {}) {
    const extra = Object.fromEntries(
      Object.entries(details).filter(
        ([key]) => key !== "ok" && key !== "error",
      ),
    );

    super(
      Object.keys(extra).length > 0
        ? `${text}\n${JSON.stringify(extra)}`
        : text,
    );
    this.name = "ToolFailure";
    this.text = text;
    this.details = { ...details, ok: false };
  }
}

/** Throws a {@link ToolFailure}. */
export function fail(text: string, details: object = {}): never {
  throw new ToolFailure(text, details);
}

/** Parses a JSON object string, or returns null for arrays, primitives and invalid JSON. */
export function parseJsonObject(value: string): Record<string, unknown> | null {
  const parsed = parseJson(value);

  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

/** Parses a JSON array string, or returns null for objects, primitives and invalid JSON. */
export function parseJsonArray(value: string): unknown[] | null {
  const parsed = parseJson(value);

  return Array.isArray(parsed) ? parsed : null;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

interface ToolSpec<S extends TSchema> {
  name: string;
  label: string;
  description: string;
  parameters: S;
  /** Prefix for unexpected errors, e.g. "CSL resolution failed". Defaults to `<label> failed`. */
  failure?: string;
  run(
    params: Static<S>,
    context: ToolContext,
  ): ToolOutput | Promise<ToolOutput>;
}

/**
 * Registers a tool whose handler returns {@link ToolOutput} and reports problems by throwing.
 * Every error, expected or not, reaches Pi as a thrown {@link ToolFailure}.
 */
export function registerTool<S extends TSchema>(
  pi: ExtensionAPI,
  spec: ToolSpec<S>,
): void {
  pi.registerTool({
    name: spec.name,
    label: spec.label,
    description: spec.description,
    parameters: spec.parameters,
    execute: async (_id, params, signal, _onUpdate, ctx) => {
      try {
        // SAFETY: Pi validated `params` against `spec.parameters`; the cast only bridges
        // the two installed copies of typebox's `Static` type.
        const output = await spec.run(params as Static<S>, {
          cwd: ctx.cwd,
          signal,
        });

        return {
          content: [{ type: "text" as const, text: output.text }],
          details: output.details ?? {},
        };
      } catch (error) {
        if (error instanceof ToolFailure) throw error;
        throw new ToolFailure(
          `${spec.failure ?? `${spec.label} failed`}: ${errorMessage(error)}`,
          { error: errorMessage(error) },
        );
      }
    },
  });
}
