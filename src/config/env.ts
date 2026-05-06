import "dotenv/config";
import { z } from "zod";

const envBooleanSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();
    if (normalizedValue === "true" || normalizedValue === "1") {
      return true;
    }
    if (normalizedValue === "false" || normalizedValue === "0" || normalizedValue === "") {
      return false;
    }
  }
  return value;
}, z.boolean());

const optionalEnvStringSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
}, z.string().min(1).optional());

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  GOOGLE_GENAI_API_KEY: z.string().min(1),
  GOOGLE_GENAI_USE_VERTEXAI: envBooleanSchema.default(false),
  GOOGLE_CLOUD_PROJECT: z.string().min(1).optional(),
  GOOGLE_CLOUD_LOCATION: z.string().min(1).optional(),
  GOOGLE_ADK_APP_NAME: z.string().min(1).default("educAIteAI"),
  EDUCAITE_API_BASE_URL: z.string().url().default("http://localhost:5126"),
  GOOGLE_GENAI_MODEL: z.string().min(1).default("gemini-3-flash-preview"),
  GOOGLE_GENAI_RESUME_MODEL: z.string().min(1).default("gemini-3-flash-preview"),
  GOOGLE_GENAI_NOTE_PDF_MODEL: z.string().min(1).default("gemini-3-pro-preview"),
  WEB_SEARCH_PROVIDER: z.enum(["duckduckgo", "disabled"]).default("duckduckgo"),
  JUDGE0_API_BASE_URL: z.preprocess((value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  }, z.string().url().optional()),
  JUDGE0_API_KEY: optionalEnvStringSchema,
  JUDGE0_API_KEY_HEADER: z.string().min(1).default("X-Auth-Token"),
}).superRefine((parsedEnv, context) => {
  if (!parsedEnv.GOOGLE_GENAI_USE_VERTEXAI) {
    return;
  }

  if (!parsedEnv.GOOGLE_CLOUD_PROJECT) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GOOGLE_CLOUD_PROJECT"],
      message: "GOOGLE_CLOUD_PROJECT is required when GOOGLE_GENAI_USE_VERTEXAI=true",
    });
  }

  if (!parsedEnv.GOOGLE_CLOUD_LOCATION) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GOOGLE_CLOUD_LOCATION"],
      message: "GOOGLE_CLOUD_LOCATION is required when GOOGLE_GENAI_USE_VERTEXAI=true",
    });
  }
});

export type Env = z.output<typeof envSchema>;

export const env: Env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  GOOGLE_GENAI_API_KEY: process.env.GOOGLE_GENAI_API_KEY,
  GOOGLE_GENAI_USE_VERTEXAI: process.env.GOOGLE_GENAI_USE_VERTEXAI,
  GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
  GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION,
  GOOGLE_ADK_APP_NAME: process.env.GOOGLE_ADK_APP_NAME,
  EDUCAITE_API_BASE_URL: process.env.EDUCAITE_API_BASE_URL,
  GOOGLE_GENAI_MODEL: process.env.GOOGLE_GENAI_MODEL,
  GOOGLE_GENAI_RESUME_MODEL: process.env.GOOGLE_GENAI_RESUME_MODEL,
  GOOGLE_GENAI_NOTE_PDF_MODEL: process.env.GOOGLE_GENAI_NOTE_PDF_MODEL,
  WEB_SEARCH_PROVIDER: process.env.WEB_SEARCH_PROVIDER,
  JUDGE0_API_BASE_URL: process.env.JUDGE0_API_BASE_URL,
  JUDGE0_API_KEY: process.env.JUDGE0_API_KEY,
  JUDGE0_API_KEY_HEADER: process.env.JUDGE0_API_KEY_HEADER,
});

process.env.GOOGLE_GENAI_USE_VERTEXAI = env.GOOGLE_GENAI_USE_VERTEXAI ? "true" : "false";

if (env.GOOGLE_GENAI_USE_VERTEXAI) {
  process.env.GOOGLE_CLOUD_PROJECT = env.GOOGLE_CLOUD_PROJECT!;
  process.env.GOOGLE_CLOUD_LOCATION = env.GOOGLE_CLOUD_LOCATION!;
}
