import type { AppDependencies } from "../../bootstrap/dependencies";
import type { AgentDefinition } from "../../shared/types/agent-definition";
import { buildHealthTool } from "../../tools/shared/health.tool";
import { createUsersAgent } from "../users/agent";
import { rootAgentInstructions } from "./instructions";

export function createRootAgent(dependencies: AppDependencies): AgentDefinition {
  const usersAgent = createUsersAgent(dependencies);

  return {
    name: "root_agent",
    description: "Top-level coordinator for the backend agent system.",
    instructions: rootAgentInstructions,
    tools: [buildHealthTool()],
    subAgents: [usersAgent],
  };
}
