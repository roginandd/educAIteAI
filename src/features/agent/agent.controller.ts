import type { Request, Response } from "express";

import {
  agentMessageBodySchema,
  agentMessageInputSchema,
  agentTaskBodySchema,
  agentTaskInputSchema,
} from "./agent.dto";
import { AgentService } from "./agent.service";

export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  sendMessage = async (req: Request, res: Response): Promise<void> => {
    const body = agentMessageBodySchema.parse(req.body ?? {});
    const input = agentMessageInputSchema.parse({
      message: body.message,
    });

    const result = await this.agentService.sendMessage(input, req.header("authorization"));

    res.status(200).json(result);
  };

  sendTask = async (req: Request, res: Response): Promise<void> => {
    const body = agentTaskBodySchema.parse(req.body ?? {});
    const input = agentTaskInputSchema.parse(body);

    const result = await this.agentService.sendTask(input, req.header("authorization"));

    res.status(200).json(result);
  };
}
