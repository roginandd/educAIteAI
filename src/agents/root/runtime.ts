import { InMemoryRunner } from "@google/adk";

import { env } from "../../config/env";
import { createRootAgent, type RootAgentDependencies } from "./agent";

export function createRootAgentRunner(dependencies: RootAgentDependencies, authorizationHeader: string): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: createRootAgent(dependencies, authorizationHeader),
  });
}
