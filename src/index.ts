import { createDependencies } from "./bootstrap/dependencies";
import { createRootAgent } from "./agents/root/agent";

const dependencies = createDependencies();

export const app = {
  dependencies,
  rootAgent: createRootAgent(dependencies),
};

// Keep runtime startup thin.
// Bind the returned rootAgent to the chosen Google ADK runner here.
