import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  GOOGLE_GENAI_API_KEY: z.string().min(1),
  GOOGLE_ADK_APP_NAME: z.string().min(1).default("educAIteAI"),
});

export type Env = z.output<typeof envSchema>;

export const env: Env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  GOOGLE_GENAI_API_KEY: process.env.GOOGLE_GENAI_API_KEY,
  GOOGLE_ADK_APP_NAME: process.env.GOOGLE_ADK_APP_NAME,
});
