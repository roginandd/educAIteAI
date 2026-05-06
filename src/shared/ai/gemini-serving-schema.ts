import { zodObjectToSchema } from "@google/adk";
import type { Schema } from "@google/genai";
import type { z } from "zod";

const SERVING_EXPENSIVE_SCHEMA_KEYS = [
  "default",
  "format",
  "maximum",
  "maxItems",
  "maxLength",
  "minimum",
  "minItems",
  "minLength",
  "pattern",
] as const;

type JsonObject = Record<string, unknown>;

export function toGeminiServingSchema(schema: z.ZodObject<z.ZodRawShape>): Schema {
  const jsonSchema = zodObjectToSchema(schema) as JsonObject;
  return stripServingExpensiveConstraints(jsonSchema) as Schema;
}

function stripServingExpensiveConstraints(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripServingExpensiveConstraints);
  }

  if (!isJsonObject(value)) {
    return value;
  }

  const next: JsonObject = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (isServingExpensiveSchemaKey(key)) {
      continue;
    }

    next[key] = stripServingExpensiveConstraints(nestedValue);
  }

  return next;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

function isServingExpensiveSchemaKey(key: string): key is typeof SERVING_EXPENSIVE_SCHEMA_KEYS[number] {
  return SERVING_EXPENSIVE_SCHEMA_KEYS.includes(key as typeof SERVING_EXPENSIVE_SCHEMA_KEYS[number]);
}
