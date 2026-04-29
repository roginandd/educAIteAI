import { FunctionTool, type BaseTool, type ToolInputParameters } from "@google/adk";

import type { ToolDefinition } from "../../shared/types/tool-definition";

export function toAdkFunctionTool(tool: ToolDefinition): BaseTool {
  return new FunctionTool({
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema as ToolInputParameters,
    async execute(input) {
      return tool.execute(tool.inputSchema.parse(input));
    },
  });
}

export function toAdkFunctionTools(tools: ToolDefinition[]): BaseTool[] {
  return tools.map(toAdkFunctionTool);
}
