import type { Static, TSchema, TUnsafe } from "typebox";

import { readFileSync } from "node:fs";

import { Type } from "typebox";
import Value from "typebox/value";

/**
 * Builds a string enum schema represented as a plain JSON-Schema `enum`.
 *
 * `Type.Union` of literals becomes `anyOf`, which Google's tool API rejects;
 * this mirrors pi-ai's `StringEnum` without importing it.
 *
 * @param values - Immutable array of allowed string literal values.
 * @param options - Optional TypeBox schema options such as description.
 *
 * @returns TypeBox string enum schema.
 */
export function stringEnum<const T extends readonly string[]>(
  values: T,
  options: { description?: string } = {},
): TUnsafe<T[number]> {
  return Type.Unsafe<T[number]>({
    type: "string",
    enum: [...values],
    ...options,
  });
}

/**
 * Any value JSON can represent.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * Recursive JSON Schema for values at tool and file boundaries. The explicit
 * `$ref` avoids `Type.Ref`, which OMP's TypeBox shim does not expose.
 */
export const JsonValueSchema = Type.Unsafe<JsonValue>({
  $defs: {
    Json: {
      $id: "Json",
      anyOf: [
        { type: "string" },
        { type: "number" },
        { type: "boolean" },
        { type: "null" },
        { type: "array", items: { $ref: "Json" } },
        { type: "object", additionalProperties: { $ref: "Json" } },
      ],
    },
  },
  $ref: "Json",
});

/**
 * A JSON object.
 */
export type JsonObject = Record<string, JsonValue>;

/**
 * Schema for a JSON object.
 */
export const JsonObjectSchema = Type.Record(Type.String(), JsonValueSchema);

/**
 * Schema for a JSON array.
 */
export const JsonArraySchema = Type.Array(JsonValueSchema);

/**
 * Returns whether `value` matches `schema`, narrowing it to the schema's type.
 *
 * @param schema - TypeBox schema to test against.
 * @param value - Value to validate.
 *
 * @returns True if `value` satisfies `schema`.
 */
export function isValid<S extends TSchema>(
  schema: S,
  value: unknown,
): value is Static<S> {
  return Value.Check(schema, value);
}

/**
 * Describes the first schema violation, e.g. `/anchor/locator: must be object`.
 *
 * @param schema - TypeBox schema to test against.
 * @param value - JSON value to validate.
 *
 * @returns Formatted violation path and message, or "invalid value".
 */
export function firstSchemaError(schema: TSchema, value: JsonValue): string {
  const [error] = Value.Errors(schema, value);

  if (!error) return "invalid value";

  return `${error.instancePath || "(root)"}: ${error.message}`;
}

/**
 * Narrows `value` to the schema's type, or throws. Generic over the incoming
 * type so known-typed callers keep their evidence (`JsonValue & Static<S>`) and
 * unknown callers still narrow.
 *
 * @param schema - TypeBox schema to assert against.
 * @param value - Value to check.
 * @param label - Error message prefix naming the failed boundary.
 * @throws With `label` and the first violation when the value does not match.
 */
export function assertValid<S extends TSchema, T>(
  schema: S,
  value: T,
  label: string,
): asserts value is Static<S> & T {
  const [error] = Value.Errors(schema, value);

  if (!error) return;

  throw new Error(
    `${label} ${error.instancePath || "(root)"}: ${error.message}`,
  );
}

/**
 * Validates a JSON value against `schema` and returns it typed.
 *
 * @param schema - TypeBox schema to parse with.
 * @param value - Incoming JSON value.
 * @param label - Error message prefix naming the failed boundary.
 *
 * @returns Typed value conforming to `schema`.
 * @throws With `label` and the first violation when the value does not match.
 */
export function parseWith<S extends TSchema>(
  schema: S,
  value: JsonValue,
  label: string,
): Static<S> {
  assertValid(schema, value, label);

  return value;
}

/**
 * Parses JSON text as a JSON value.
 *
 * @param text - Raw JSON string.
 *
 * @returns Parsed JSON value.
 */
export function parseJsonText(text: string): JsonValue {
  // SAFETY: JSON.parse only produces JSON-representable values from valid JSON text.
  return JSON.parse(text) as JsonValue;
}

/**
 * Reads and validates a JSON file from disk.
 *
 * @param path - Absolute or relative file path to read.
 * @param schema - TypeBox schema to parse with.
 * @param label - Error message prefix naming the failed boundary.
 *
 * @returns Parsed and validated typed content.
 * @throws When the file cannot be read or fails validation.
 */
export function readJsonFile<S extends TSchema>(
  path: string,
  schema: S,
  label: string,
): Static<S> {
  return parseWith(schema, parseJsonText(readFileSync(path, "utf8")), label);
}

/**
 * Reads a JSON file that may be absent, unreadable or not shaped as expected;
 * all of those give null.
 *
 * @param path - File path to attempt reading.
 * @param schema - TypeBox schema to validate with.
 *
 * @returns Validated typed data, or null on any error.
 */
export function tryReadJsonFile<S extends TSchema>(
  path: string,
  schema: S,
): Static<S> | null {
  try {
    const value = parseJsonText(readFileSync(path, "utf8"));

    return Value.Check(schema, value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The first way a value breaks a schema, with its location split into keys.
 */
export interface SchemaViolation {
  /**
   * Object keys and array indexes from the root to the offending value.
   */
  path: string[];
  /**
   * The JSON Schema keyword that failed, e.g. `type` or `pattern`.
   */
  keyword: string;
  /**
   * For `additionalProperties`, the keys that were not allowed.
   */
  unexpectedKeys: string[];
  message: string;
}

/**
 * Returns the first schema violation of a JSON value, if any.
 *
 * @param schema - TypeBox schema to validate against.
 * @param value - JSON value to inspect.
 *
 * @returns Structured violation details, or undefined if valid.
 */
export function firstViolation(
  schema: TSchema,
  value: JsonValue,
): SchemaViolation | undefined {
  const [error] = Value.Errors(schema, value);

  if (!error) return undefined;

  return {
    path: error.instancePath.split("/").slice(1),
    keyword: error.keyword,
    unexpectedKeys:
      "additionalProperties" in error.params
        ? error.params.additionalProperties
        : [],
    message: error.message,
  };
}
