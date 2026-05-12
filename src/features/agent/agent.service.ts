import type { Content } from "@google/genai";
import { isFinalResponse, stringifyContent } from "@google/adk";

import { createRootAgentRunner } from "../../agents/root/runtime";
import type { RootAgentDependencies } from "../../agents/root/agent";
import { BadGatewayError } from "../../shared/errors/bad-gateway-error";
import { UnauthorizedError } from "../../shared/errors/unauthorized-error";
import type { StudyBuddyService } from "../study-buddy/study-buddy.service";
import {
  agentMessageInputSchema,
  agentTaskInputSchema,
  type AgentMessageInput,
  type AgentTaskInput,
} from "./agent.dto";
import {
  agentMessageResponseSchema,
  agentTaskResponseSchema,
  type AgentMessageResponse,
  type AgentTaskResponse,
} from "./agent.response";

interface AgentServiceDependencies extends RootAgentDependencies {
  studyBuddyService: StudyBuddyService;
}

export class AgentService {
  constructor(private readonly dependencies: AgentServiceDependencies) {}

  async sendMessage(
    input: AgentMessageInput,
    authorizationHeader: string | undefined,
  ): Promise<AgentMessageResponse> {
    const parsedInput = agentMessageInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);
    const runner = createRootAgentRunner(this.dependencies, authHeader);
    const message: Content = {
      role: "user",
      parts: [{ text: parsedInput.message }],
    };
    let finalResponseText: string | null = null;

    for await (const event of runner.runEphemeral({
      userId: "agent_service",
      newMessage: message,
    })) {
      if (event.errorMessage) {
        throw new BadGatewayError(event.errorMessage);
      }

      if (!isFinalResponse(event)) {
        continue;
      }

      const content = stringifyContent(event).trim();
      if (content) {
        finalResponseText = content;
      }
    }

    if (!finalResponseText) {
      throw new BadGatewayError("Root agent did not return a final response.");
    }

    return agentMessageResponseSchema.parse({
      response: finalResponseText,
    });
  }

  async sendTask(
    input: AgentTaskInput,
    authorizationHeader: string | undefined,
  ): Promise<AgentTaskResponse> {
    const parsedInput = agentTaskInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);

    switch (parsedInput.intent) {
      case "generate_note_from_document":
        return agentTaskResponseSchema.parse({
          intent: parsedInput.intent,
          result: await this.dependencies.noteService.generateFromDocument(parsedInput.payload, authHeader),
        });
      case "summarize_note":
        return agentTaskResponseSchema.parse({
          intent: parsedInput.intent,
          result: await this.dependencies.noteService.summarizeNote(parsedInput.payload, authHeader),
        });
      case "generate_flashcards_from_note":
        return agentTaskResponseSchema.parse({
          intent: parsedInput.intent,
          result: await this.dependencies.flashcardService.generateFromNote(parsedInput.payload, authHeader),
        });
      case "generate_flashcards_preview":
        return agentTaskResponseSchema.parse({
          intent: parsedInput.intent,
          result: await this.dependencies.flashcardService.previewGenerateFromNote(parsedInput.payload, authHeader),
        });
      case "submit_and_analyze_flashcard_answer":
        return agentTaskResponseSchema.parse({
          intent: parsedInput.intent,
          result: await this.dependencies.flashcardService.submitAndAnalyze(parsedInput.payload, authHeader),
        });
      case "evaluate_flashcard_answer":
        return agentTaskResponseSchema.parse({
          intent: parsedInput.intent,
          result: await this.dependencies.flashcardService.evaluateAnswer(parsedInput.payload, authHeader),
        });
      case "submit_flashcard_learn_session_answer":
        return agentTaskResponseSchema.parse({
          intent: parsedInput.intent,
          result: await this.dependencies.flashcardService.submitLearnSessionAnswer(parsedInput.payload, authHeader),
        });
      case "analyze_resume_with_relations":
        return agentTaskResponseSchema.parse({
          intent: parsedInput.intent,
          result: await this.dependencies.resumeService.analyzeResumeWithRelations(parsedInput.payload, authHeader),
        });
      case "tailor_resume_for_job":
        return agentTaskResponseSchema.parse({
          intent: parsedInput.intent,
          result: await this.dependencies.resumeService.tailorResumeForJob(parsedInput.payload, authHeader),
        });
      case "suggest_student_job_targets":
        return agentTaskResponseSchema.parse({
          intent: parsedInput.intent,
          result: await this.dependencies.resumeService.suggestStudentJobTargets(parsedInput.payload, authHeader),
        });
      case "generate_student_career_hint":
        return agentTaskResponseSchema.parse({
          intent: parsedInput.intent,
          result: await this.dependencies.resumeService.generateStudentCareerHint(parsedInput.payload, authHeader),
        });
      case "suggest_resume_certificates":
        return agentTaskResponseSchema.parse({
          intent: parsedInput.intent,
          result: await this.dependencies.resumeService.suggestResumeCertificates(parsedInput.payload, authHeader),
        });
      case "search_resume_job_suggestions":
        return agentTaskResponseSchema.parse({
          intent: parsedInput.intent,
          result: await this.dependencies.resumeService.recommendResumeJobOpportunities(parsedInput.payload, authHeader),
        });
      case "recommend_resume_job_opportunities":
        return agentTaskResponseSchema.parse({
          intent: parsedInput.intent,
          result: await this.dependencies.resumeService.recommendResumeJobOpportunities(parsedInput.payload, authHeader),
        });
      case "parse_and_apply_studyload_pdf":
        return agentTaskResponseSchema.parse({
          intent: parsedInput.intent,
          result: await this.dependencies.studyLoadService.parseAndApplyStudyLoadPdf(parsedInput.payload, authHeader),
        });
      case "generate_study_focus_chat_reply":
        return agentTaskResponseSchema.parse({
          intent: parsedInput.intent,
          result: await this.dependencies.studyBuddyService.generateReply(parsedInput.payload),
        });
    }
  }

  private requireAuthorizationHeader(headerValue: string | undefined): string {
    if (!headerValue?.trim()) {
      throw new UnauthorizedError();
    }

    return headerValue;
  }
}
