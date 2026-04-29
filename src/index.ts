import { createDependencies } from "./bootstrap/dependencies";
import { env } from "./config/env";
import { createApp } from "./server/create-app";

const dependencies = createDependencies();
const server = createApp(dependencies);

export const app = {
  dependencies,
  server,
};

server.listen(env.PORT, () => {
  console.log(`educAIteAI listening on port ${env.PORT}`);
});
