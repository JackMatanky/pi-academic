import type {
  ExtensionAPI,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { Static, TSchema } from "typebox";

import { errorMessage } from "../../lib/fs-safe.js";
import { assertValid, isValid, type JsonValue } from "../../lib/schema.js";
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
 * so failures are thrown; structured details stay available to adapters.
 */
export class ToolFailure<Details extends object = object> extends Error {
  readonly text: string;
  readonly details: Details & { ok: false };

  constructor(text: string, details?: Details) {
    super(text);
    this.name = "ToolFailure";
    this.text = text;
    this.details = Object.assign({}, details, { ok: false as const });
  }
}

/**
 * Throws a {@link ToolFailure}; bounded tool dispatch retains details in the
 * error text for consumers that do not expose structured details.
 *
 * @param text - Failure explanation text.
 * @param details - Optional structured failure metadata.
 * @throws ToolFailure unconditionally.
 */
export function fail<Details extends object>(
  text: string,
  details?: Details,
): never {
  const visibleDetails = Object.fromEntries(
    Object.entries(details ?? {}).filter(([key]) => key !== "error"),
  );

  const message =
    Object.keys(visibleDetails).length > 0
      ? `${text}\n${JSON.stringify(visibleDetails)}`
      : text;

  throw new ToolFailure(message, details);
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

/**
 * Specification for registering a TypeBox-typed tool across harnesses.
 */
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
 *
 * @param pi - Extension API instance.
 * @param spec - Complete specification of the tool.
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
        if (cause instanceof ToolFailure) {
          throw new ToolFailure(
            boundOutput(ctx.cwd, spec.name, cause.text),
            cause.details,
          );
        }

        const message = `${spec.failure ?? `${spec.label} failed`}: ${errorMessage(cause)}`;
        const bounded = boundOutput(ctx.cwd, spec.name, message);

        throw new ToolFailure(bounded, { error: bounded });
      }
    },
  };

  pi.registerTool(definition);
}
