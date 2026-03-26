import type { AppDependencies } from "../../bootstrap/dependencies";
import { createNotesAgent } from "../notes/agent";
import type { AgentDefinition } from "../../shared/types/agent-definition";
import { buildHealthTool } from "../../tools/shared/health.tool";
import { createFlashcardsAgent } from "../flashcards/agent";
import { createStudyloadsAgent } from "../studyloads/agent";
import { rootAgentInstructions } from "./instructions";

export function createRootAgent(dependencies: AppDependencies): AgentDefinition {
  const flashcardsAgent = createFlashcardsAgent(dependencies);
  const notesAgent = createNotesAgent(dependencies);
  const studyloadsAgent = createStudyloadsAgent(dependencies);

  return {
    name: "root_agent",
    description: "Top-level coordinator for the backend agent system.",
    instructions: rootAgentInstructions,
    tools: [buildHealthTool()],
    subAgents: [flashcardsAgent, notesAgent, studyloadsAgent],
  };
}
