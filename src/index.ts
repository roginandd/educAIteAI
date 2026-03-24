import { createDependencies } from "./bootstrap/dependencies";
import { createRootAgent } from "./agents/root/agent";
import { env } from "./config/env";
import { createApp } from "./server/create-app";

const dependencies = createDependencies();
const server = createApp(dependencies);

export const app = {
  dependencies,
  rootAgent: createRootAgent(dependencies),
  server,
};

server.listen(env.PORT, () => {
  console.log(`educAIteAI listening on port ${env.PORT}`);
});
