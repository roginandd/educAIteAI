import type { AppDependencies } from "../../bootstrap/dependencies";
import { buildUserTools } from "../../features/users";
import type { AgentDefinition } from "../../shared/types/agent-definition";
import { usersAgentInstructions } from "./instructions";

export function createUsersAgent(dependencies: AppDependencies): AgentDefinition {
  return {
    name: "users_agent",
    description: "Specialist agent for user management workflows.",
    instructions: usersAgentInstructions,
    tools: buildUserTools(dependencies.userService),
  };
}
