import { z } from "zod";

export interface ToolDefinition<TInputSchema extends z.ZodTypeAny = z.ZodTypeAny, TResult = unknown> {
  name: string;
  description: string;
  inputSchema: TInputSchema;
  execute: (input: z.output<TInputSchema>) => Promise<TResult>;
}
