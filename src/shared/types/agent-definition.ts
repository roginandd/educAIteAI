import type { ToolDefinition } from "./tool-definition";

export interface AgentDefinition {
  name: string;
  description: string;
  instructions: string;
  tools: ToolDefinition[];
  subAgents?: AgentDefinition[];
}
