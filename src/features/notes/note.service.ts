import type { Content } from "@google/genai";
import { createPartFromBase64, createPartFromText } from "@google/genai";
import { isFinalResponse, stringifyContent, type Runner } from "@google/adk";

import { env } from "../../config/env";
import { AppError } from "../../shared/errors/app-error";
import { BadGatewayError } from "../../shared/errors/bad-gateway-error";
import { UnauthorizedError } from "../../shared/errors/unauthorized-error";
import {
  createNoteRequestSchema,
  generateNoteFromDocumentInputSchema,
  noteApiResponseSchema,
  noteGenerationOutputSchema,
  summarizeNoteInputSchema,
  summarizeNoteOutputSchema,
  type GenerateNoteFromDocumentInput,
  type NoteGenerationOutput,
  type NoteApiResponse,
  type SummarizeNoteInput,
  type SummarizeNoteOutput,
} from "./note.dto";
import {
  documentApiResponseSchema,
  generateNoteFromDocumentResponseSchema,
  signedUrlResponseSchema,
  summarizeNoteResponseSchema,
  type DocumentApiResponse,
  type GenerateNoteFromDocumentResponse,
  type SignedUrlResponse,
  type SummarizeNoteResponse,
} from "./note.response";

export class NoteService {
  constructor(
    private readonly generationRunner: Runner,
    private readonly summarizationRunner: Runner,
  ) {}

  async generateFromDocument(
    input: GenerateNoteFromDocumentInput,
    authorizationHeader: string | undefined,
  ): Promise<GenerateNoteFromDocumentResponse> {
    const parsedInput = generateNoteFromDocumentInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);

    const document = await this.fetchDocument(parsedInput.documentSqid, authHeader);
    const signedUrl = await this.getDocumentSignedUrl(parsedInput.documentSqid, parsedInput.expiresInMinutes, authHeader);
    const pdfBytes = await this.downloadPdfAsBytes(signedUrl.url);
    const generatedNote = await this.generateNoteWithAgent(document.documentName, pdfBytes);
    const createdNote = await this.createNote(
      {
        name: this.normalizeGeneratedNoteName(document.documentName, generatedNote.name),
        noteContent: generatedNote.noteContent,
        documentSqid: document.sqid,
      },
      authHeader,
    );

    return generateNoteFromDocumentResponseSchema.parse({
      documentSqid: document.sqid,
      source: "generated",
      note: createdNote,
    });
  }

  async summarizeNote(
    input: SummarizeNoteInput,
    authorizationHeader: string | undefined,
  ): Promise<SummarizeNoteResponse> {
    const parsedInput = summarizeNoteInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);

    const note = await this.fetchNote(parsedInput.noteSqid, authHeader);
    if (!note.noteContent.trim()) {
      throw new AppError("Note content is empty and cannot be summarized.", "VALIDATION_ERROR", 400);
    }

    const summary = await this.summarizeNoteWithAgent(note.name, note.noteContent, parsedInput.style);

    return summarizeNoteResponseSchema.parse({
      noteSqid: note.sqid,
      originalContent: note.noteContent,
      summarizedContent: summary.summarizedContent,
      model: env.GOOGLE_GENAI_MODEL,
      generatedAt: new Date().toISOString(),
    });
  }

  private requireAuthorizationHeader(headerValue: string | undefined): string {
    if (!headerValue?.trim()) {
      throw new UnauthorizedError();
    }

    return headerValue;
  }

  private async fetchDocument(documentSqid: string, authorizationHeader: string): Promise<DocumentApiResponse> {
    const response = await fetch(`${env.EDUCAITE_API_BASE_URL}/api/document/${encodeURIComponent(documentSqid)}`, {
      method: "GET",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
      },
    });

    const data = await this.parseJsonResponse(response, "Unable to fetch document from EducAIte API.");
    return documentApiResponseSchema.parse(data);
  }

  private async fetchNote(noteSqid: string, authorizationHeader: string): Promise<NoteApiResponse> {
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

  private async getDocumentSignedUrl(
    documentSqid: string,
    expiresInMinutes: number,
    authorizationHeader: string,
  ): Promise<SignedUrlResponse> {
    const query = new URLSearchParams({
      expiresInMinutes: String(expiresInMinutes),
    });

    const response = await fetch(
      `${env.EDUCAITE_API_BASE_URL}/api/document/${encodeURIComponent(documentSqid)}/signed-url?${query.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: authorizationHeader,
          Accept: "application/json",
        },
      },
    );

    const data = await this.parseJsonResponse(response, "Unable to generate a signed URL for the document PDF.");
    return signedUrlResponseSchema.parse(data);
  }

  private async downloadPdfAsBytes(signedUrl: string): Promise<Uint8Array> {
    const response = await fetch(signedUrl, {
      method: "GET",
      headers: {
        Accept: "application/pdf",
      },
    });

    if (!response.ok) {
      throw new BadGatewayError("Unable to download the document PDF from the signed URL.");
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      throw new BadGatewayError("Document PDF download returned an empty file.");
    }

    return new Uint8Array(arrayBuffer);
  }

  private async generateNoteWithAgent(documentName: string, pdfBytes: Uint8Array): Promise<NoteGenerationOutput> {
    const finalResponseText = await this.runNoteGenerationAgent(documentName, pdfBytes);
    const parsedJson = parseJson(finalResponseText, "Note generation agent returned invalid JSON.");

    return noteGenerationOutputSchema.parse(parsedJson);
  }

  private async summarizeNoteWithAgent(
    noteName: string,
    noteContent: string,
    style?: SummarizeNoteInput["style"],
  ): Promise<SummarizeNoteOutput> {
    const finalResponseText = await this.runNoteSummarizationAgent(noteName, noteContent, style);
    const parsedJson = parseJson(finalResponseText, "Note summarization agent returned invalid JSON.");

    return summarizeNoteOutputSchema.parse(parsedJson);
  }

  private async createNote(
    note: { name: string; noteContent: string; documentSqid: string },
    authorizationHeader: string,
  ): Promise<NoteApiResponse> {
    const payload = createNoteRequestSchema.parse(note);

    const response = await fetch(`${env.EDUCAITE_API_BASE_URL}/api/note`, {
      method: "POST",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await this.parseJsonResponse(response, "Unable to create generated note through EducAIte API.");
    return noteApiResponseSchema.parse(data);
  }

  private normalizeGeneratedNoteName(documentName: string, generatedName: string): string {
    const canonicalName = documentName.trim();
    if (generatedName.trim().toLowerCase() === canonicalName.toLowerCase()) {
      return generatedName.trim();
    }

    return canonicalName;
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

  private async runNoteGenerationAgent(documentName: string, pdfBytes: Uint8Array): Promise<string> {
    const message: Content = {
      role: "user",
      parts: [
        createPartFromText(buildNoteGenerationPrompt(documentName)),
        createPartFromBase64(Buffer.from(pdfBytes).toString("base64"), "application/pdf"),
      ],
    };

    let finalResponseText: string | null = null;

    for await (const event of this.generationRunner.runEphemeral({
      userId: "note_service",
      newMessage: message,
    })) {
      if (event.errorMessage) {
        throw new BadGatewayError(event.errorMessage);
      }

      if (!isFinalResponse(event)) {
        continue;
      }

      const structuredOutput = event.actions.stateDelta.note_generation_output;
      if (structuredOutput) {
        return JSON.stringify(structuredOutput);
      }

      const content = stringifyContent(event).trim();
      if (content) {
        finalResponseText = content;
      }
    }

    if (!finalResponseText) {
      throw new BadGatewayError("Note generation agent did not return a final response.");
    }

    return finalResponseText;
  }

  private async runNoteSummarizationAgent(
    noteName: string,
    noteContent: string,
    style?: SummarizeNoteInput["style"],
  ): Promise<string> {
    const message: Content = {
      role: "user",
      parts: [{ text: buildNoteSummarizationPrompt(noteName, noteContent, style) }],
    };

    let finalResponseText: string | null = null;

    for await (const event of this.summarizationRunner.runEphemeral({
      userId: "note_summary_service",
      newMessage: message,
    })) {
      if (event.errorMessage) {
        throw new BadGatewayError(event.errorMessage);
      }

      if (!isFinalResponse(event)) {
        continue;
      }

      const structuredOutput = event.actions.stateDelta.note_summarization_output;
      if (structuredOutput) {
        return JSON.stringify(structuredOutput);
      }

      const content = stringifyContent(event).trim();
      if (content) {
        finalResponseText = content;
      }
    }

    if (!finalResponseText) {
      throw new BadGatewayError("Note summarization agent did not return a final response.");
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

function buildNoteGenerationPrompt(documentName: string): string {
  const generatedNoteName = documentName.trim();

  return [
    "Generate one grounded study note from this PDF.",
    'Return only JSON matching this shape: {"name":"...","noteContent":"..."}.',
    `Use this exact note name: "${generatedNoteName}".`,
    "The title must be concise and minimal.",
    "Do not add prefixes, suffixes, labels, or extra descriptive words to the title.",
    "Use only information supported by the PDF.",
    "Do not invent facts, examples, dates, formulas, or citations.",
    "Write noteContent as clean study text suitable for review.",
    "Prefer short sections, concise explanations, and faithful terminology from the PDF.",
  ].join("\n");
}

function buildNoteSummarizationPrompt(
  noteName: string,
  noteContent: string,
  style?: SummarizeNoteInput["style"],
): string {
  const instructions = [
    "Summarize the following note.",
    'Return only JSON matching this shape: {"summarizedContent":"..."}.',
    "Preserve factual meaning, important terminology, formulas, and essential structure.",
    "Keep the result as a single Markdown string with \\n line breaks.",
    `Summary style: ${style ?? "default"}.`,
    "If style is concise, make the summary much more straightforward and compressed.",
    "If style is default, produce the normal balanced summary.",
    "If style is detailed, keep more supporting detail while still summarizing.",
  ];

  instructions.push(
    "",
    `Note title: ${noteName}`,
    "Original note content:",
    noteContent,
  );

  return instructions.join("\n");
}
