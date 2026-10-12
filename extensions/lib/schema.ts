import type { Static, TSchema, TUnsafe } from "typebox";

import { readFileSync } from "node:fs";

import { Type } from "typebox";
import Value from "typebox/value";

/**
 * A string enum as a plain JSON-Schema `enum`. `Type.Union` of literals becomes
 * `anyOf`, which Google's tool API rejects; this mirrors pi-ai's `StringEnum`
 * without importing it (omp's pi-ai shim does not export it).
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
 * Schema for any value JSON can represent.
 */
export const JsonValueSchema = Type.Cyclic(
  {
    Json: Type.Union([
      Type.String(),
      Type.Number(),
      Type.Boolean(),
      Type.Null(),
      Type.Array(Type.Ref("Json")),
      Type.Record(Type.String(), Type.Ref("Json")),
    ]),
  },
  "Json",
);

/**
 * Any value JSON can represent.
 */
export type JsonValue = Static<typeof JsonValueSchema>;

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
 */
export function isValid<S extends TSchema>(
  schema: S,
  value: unknown,
): value is Static<S> {
  return Value.Check(schema, value);
}

/**
 * Describes the first schema violation, e.g. `/anchor/locator: must be object`.
 */
export function firstSchemaError(schema: TSchema, value: JsonValue): string {
  const [error] = Value.Errors(schema, value);

  if (!error) return "invalid value";

  return `${error.instancePath || "(root)"}: ${error.message}`;
}

/**
 * Narrows `value` to the schema's type, or throws.
 *
 * @throws With `label` and the first violation when the value does not match.
 */
export function assertValid<S extends TSchema>(
  schema: S,
  value: unknown,
  label: string,
): asserts value is Static<S> {
  if (Value.Check(schema, value)) return;

  const [error] = Value.Errors(schema, value);

  throw new Error(
    `${label} ${error ? `${error.instancePath || "(root)"}: ${error.message}` : "invalid value"}`,
  );
}

/**
 * Validates a JSON value against `schema` and returns it typed.
 *
 * @throws With `label` and the first violation when the value does not match.
 */
export function parseWith<S extends TSchema>(
  schema: S,
  value: JsonValue,
  label: string,
): Static<S> {
  if (Value.Check(schema, value)) return value;

  throw new Error(`${label} ${firstSchemaError(schema, value)}`);
}

/**
 * Parses JSON text. Anything `JSON.parse` returns is a JSON value; whether it
 * has the shape the caller needs is for a schema to decide.
 */
export function parseJsonText(text: string): JsonValue {
  const parsed: JsonValue = JSON.parse(text);

  return parsed;
}

/**
 * Reads and validates a JSON file.
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
