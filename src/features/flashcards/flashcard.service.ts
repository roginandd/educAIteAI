import type { Content } from "@google/genai";
import { isFinalResponse, stringifyContent, type Runner } from "@google/adk";

import { env } from "../../config/env";
import { AppError } from "../../shared/errors/app-error";
import { BadGatewayError } from "../../shared/errors/bad-gateway-error";
import { UnauthorizedError } from "../../shared/errors/unauthorized-error";
import {
  createBulkFlashcardsRequestSchema,
  flashcardGenerationOutputSchema,
  generateFlashcardsFromNoteInputSchema,
  noteApiResponseSchema,
  type CreateBulkFlashcardItem,
  type GenerateFlashcardsFromNoteInput,
} from "./flashcard.dto";
import {
  flashcardApiResponseSchema,
  generateFlashcardsFromNoteResponseSchema,
  type FlashcardApiResponse,
  type GenerateFlashcardsFromNoteResponse,
} from "./flashcard.response";

export class FlashcardService {
  constructor(private readonly generationRunner: Runner) {}



  async generateFromNote(
    input: GenerateFlashcardsFromNoteInput,
    authorizationHeader: string | undefined,
  ): Promise<GenerateFlashcardsFromNoteResponse> {
    const parsedInput = generateFlashcardsFromNoteInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);

    const note = await this.fetchNote(parsedInput.noteSqid, authHeader);
    const generatedFlashcards = await this.generateFlashcardsWithAgent(note.name, note.noteContent, parsedInput.flashcardCount);
    const persistedFlashcards = await this.persistFlashcards(note.sqid, generatedFlashcards, authHeader);

    return generateFlashcardsFromNoteResponseSchema.parse({
      noteSqid: note.sqid,
      generatedCount: persistedFlashcards.length,
      flashcards: persistedFlashcards,
    });
  }

  private requireAuthorizationHeader(headerValue: string | undefined): string {
    if (!headerValue?.trim()) {
      throw new UnauthorizedError();
    }

    return headerValue;
  }

  private async fetchNote(noteSqid: string, authorizationHeader: string) {
    const response = await fetch(`${env.EDUCAITE_API_BASE_URL}/api/note/${encodeURIComponent(noteSqid)}`, {
      method: "GET",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
      },
    });

    const data = await this.parseJsonResponse(response, "Unable to fetch note from EducAIte API.");
    return noteApiResponseSchema.parse(data);
  }

  private async generateFlashcardsWithAgent(
    noteTitle: string,
    noteContent: string,
    flashcardCount: number,
  ): Promise<CreateBulkFlashcardItem[]> {
    const prompt = buildGenerationPrompt(noteTitle, noteContent, flashcardCount);
    const finalResponseText = await this.runGenerationAgent(prompt);
    const parsedJson = parseJson(finalResponseText, "Flashcards generation agent returned invalid JSON.");
    
    console.log("Parsed flashcards generation agent output:", parsedJson);
   
    return flashcardGenerationOutputSchema.parse(parsedJson).flashcards;
  }

  private async persistFlashcards(
    noteSqid: string,
    flashcards: CreateBulkFlashcardItem[],
    authorizationHeader: string,
  ): Promise<FlashcardApiResponse[]> {
    const payload = createBulkFlashcardsRequestSchema.parse({
      notesqid: noteSqid,
      flashcards,
    });

    console.log("Persisting generated flashcards with payload:", payload);

    const response = await fetch(`${env.EDUCAITE_API_BASE_URL}/api/flashcard/bulk`, {
      method: "POST",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await this.parseJsonResponse(response, "Unable to persist generated flashcards.");
    return flashcardApiResponseSchema.array().parse(data);
  }

  private async parseJsonResponse(response: Response, fallbackMessage: string): Promise<unknown> {
    const rawBody = await response.text();
    const parsedBody = rawBody ? tryParseJson(rawBody) : null;

    if (!response.ok) {
      const message = extractErrorMessage(parsedBody) ?? fallbackMessage;

      if (response.status >= 500) {
        throw new BadGatewayError(message);
      }

      throw new AppError(message, `UPSTREAM_${response.status}`, response.status);
    }

    if (parsedBody === null) {
      throw new BadGatewayError(fallbackMessage);
    }

    return parsedBody;
  }

  private async runGenerationAgent(prompt: string): Promise<string> {
    const message: Content = {
      role: "user",
      parts: [{ text: prompt }],
    };

    let finalResponseText: string | null = null;

    for await (const event of this.generationRunner.runEphemeral({
      userId: "flashcards_service",
      newMessage: message,
    })) {
      if (event.errorMessage) {
        throw new BadGatewayError(event.errorMessage);
      }

      if (!isFinalResponse(event)) {
        continue;
      }

      const structuredOutput = event.actions.stateDelta.flashcards_generation_output;
      if (structuredOutput) {
        return JSON.stringify(structuredOutput);
      }

      const content = stringifyContent(event).trim();
      if (content) {
        finalResponseText = content;
      }
    }

    if (!finalResponseText) {
      throw new BadGatewayError("Flashcards generation agent did not return a final response.");
    }

    return finalResponseText;
  }
}

function extractErrorMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const directMessage = (payload as { message?: unknown }).message;
  if (typeof directMessage === "string" && directMessage.trim()) {
    return directMessage;
  }

  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  const nestedMessage = (payload as { error?: { message?: unknown } }).error?.message;
  if (typeof nestedMessage === "string" && nestedMessage.trim()) {
    return nestedMessage;
  }

  const title = (payload as { title?: unknown }).title;
  if (typeof title === "string" && title.trim()) {
    return title;
  }

  const validationErrors = (payload as { errors?: unknown }).errors;
  if (typeof validationErrors === "object" && validationErrors !== null) {
    for (const value of Object.values(validationErrors)) {
      if (Array.isArray(value)) {
        const firstMessage = value.find((item) => typeof item === "string" && item.trim());
        if (typeof firstMessage === "string") {
          return firstMessage;
        }
      }
    }
  }

  return null;
}

function tryParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseJson(value: string, errorMessage: string): unknown {
  const parsed = tryParseJson(value);
  if (parsed === null) {
    throw new BadGatewayError(errorMessage);
  }

  return parsed;
}

function buildGenerationPrompt(noteTitle: string, noteContent: string, flashcardCount: number): string {
  return [
    "Generate grounded flashcards from the following note.",
    `Return exactly ${flashcardCount} flashcards.`,
    'Return only JSON matching this shape: {"flashcards":[{"question":"...","answer":"..."}]}.',
    "",
    `Note title: ${noteTitle}`,
    "Note content:",
    noteContent,
  ].join("\n");
}
