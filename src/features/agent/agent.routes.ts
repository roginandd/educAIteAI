import { Router } from "express";

import { AgentController } from "./agent.controller";
import { AgentService } from "./agent.service";

export function createAgentRouter(agentService: AgentService): Router {
  const router = Router();
  const agentController = new AgentController(agentService);

  router.post("/messages", agentController.sendMessage);
  router.post("/tasks", agentController.sendTask);

  return router;
}
