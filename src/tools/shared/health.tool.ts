import { z } from "zod";

import type { ToolDefinition } from "../../shared/types/tool-definition";

const healthCheckInputSchema = z.object({});
const healthCheckResponseSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
});

export function buildHealthTool(): ToolDefinition<typeof healthCheckInputSchema> {
  return {
    name: "health_check",
    description: "Returns a simple health status for the backend runtime.",
    inputSchema: healthCheckInputSchema,
    async execute() {
      return healthCheckResponseSchema.parse({
        ok: true,
        service: "educAIteAI",
      });
    },
  };
}
