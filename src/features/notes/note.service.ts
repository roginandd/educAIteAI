import type { Content } from "@google/genai";
import { isFinalResponse, stringifyContent, type Runner } from "@google/adk";

import { env } from "../../config/env";
import { AppError } from "../../shared/errors/app-error";
import { BadGatewayError } from "../../shared/errors/bad-gateway-error";
import { AppError as UpstreamAppError } from "../../shared/errors/app-error";
import { UnauthorizedError } from "../../shared/errors/unauthorized-error";
import { UpstreamHttpClient } from "../../shared/http/upstream-http-client";
import { PdfExtractionService } from "../../shared/pdf/pdf-extraction.service";
import { PdfProcessingService } from "../../shared/pdf/pdf-processing.service";
import { GeneratedNoteArtifactRepository } from "./generated-note-artifact.repository";
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
    private readonly upstreamHttpClient: UpstreamHttpClient,
    private readonly pdfProcessingService: PdfProcessingService,
    private readonly pdfExtractionService: PdfExtractionService,
    private readonly generatedNoteArtifactRepository: GeneratedNoteArtifactRepository,
  ) {}

  async generateFromDocument(
    input: GenerateNoteFromDocumentInput,
    authorizationHeader: string | undefined,
  ): Promise<GenerateNoteFromDocumentResponse> {
    const parsedInput = generateNoteFromDocumentInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);

    const document = await this.fetchDocument(parsedInput.documentSqid, authHeader);
    const signedUrl = await this.getDocumentSignedUrl(parsedInput.documentSqid, parsedInput.expiresInMinutes, authHeader);
    const artifactVersionToken = `${document.fileMetadataSqid}:${document.updatedAt.toISOString()}`;
    const extractedArtifact = await this.pdfExtractionService.ensureExtraction({
      sourceType: "document",
      sourceSqid: document.sqid,
      fileMetadataSqid: document.fileMetadataSqid,
      versionToken: artifactVersionToken,
      signedUrl: signedUrl.url,
      displayName: document.documentName,
    });
    const existingNote = await this.findExistingGeneratedNote(document.sqid, extractedArtifact.versionToken, authHeader);
    if (existingNote) {
      return generateNoteFromDocumentResponseSchema.parse({
        documentSqid: document.sqid,
        source: "existing",
        note: existingNote,
      });
    }

    const generatedNote = await this.generateNoteWithAgent(document.documentName, extractedArtifact.extractedText);
    const createdNote = await this.createNote(
      {
        name: this.normalizeGeneratedNoteName(document.documentName, generatedNote.name),
        noteContent: generatedNote.noteContent,
        documentSqid: document.sqid,
      },
      authHeader,
    );
    await this.generatedNoteArtifactRepository.upsert({
      documentSqid: document.sqid,
      noteSqid: createdNote.sqid,
      fileMetadataSqid: document.fileMetadataSqid,
      artifactVersionToken: extractedArtifact.versionToken,
    });

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
    const data = await this.upstreamHttpClient.getJson(`/api/document/${encodeURIComponent(documentSqid)}`, {
      method: "GET",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
      },
    }, "Unable to fetch document from EducAIte API.");
    return documentApiResponseSchema.parse(data);
  }

  private async fetchNote(noteSqid: string, authorizationHeader: string): Promise<NoteApiResponse> {
    const data = await this.upstreamHttpClient.getJson(`/api/note/${encodeURIComponent(noteSqid)}`, {
      method: "GET",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
      },
    }, "Unable to fetch note from EducAIte API.");
    return noteApiResponseSchema.parse(data);
  }

  private async fetchNoteOrNull(noteSqid: string, authorizationHeader: string): Promise<NoteApiResponse | null> {
    try {
      return await this.fetchNote(noteSqid, authorizationHeader);
    } catch (error) {
      if (error instanceof UpstreamAppError && error.statusCode === 404) {
        return null;
      }

      throw error;
    }
  }

  private async getDocumentSignedUrl(
    documentSqid: string,
    expiresInMinutes: number,
    authorizationHeader: string,
  ): Promise<SignedUrlResponse> {
    const query = new URLSearchParams({
      expiresInMinutes: String(expiresInMinutes),
    });

    const data = await this.upstreamHttpClient.getJson(
      `/api/document/${encodeURIComponent(documentSqid)}/signed-url?${query.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: authorizationHeader,
          Accept: "application/json",
        },
      },
      "Unable to generate a signed URL for the document PDF.",
    );
    return signedUrlResponseSchema.parse(data);
  }

  private async generateNoteWithAgent(documentName: string, extractedText: string): Promise<NoteGenerationOutput> {
    return this.pdfProcessingService.runStructuredTextAgent({
      runner: this.generationRunner,
      userId: "note_service",
      prompt: buildNoteGenerationPrompt(documentName),
      sourceText: extractedText,
      outputKey: "note_generation_output",
      outputSchema: noteGenerationOutputSchema,
      invalidJsonMessage: "Note generation agent returned invalid JSON.",
      noResponseMessage: "Note generation agent did not return a final response.",
    });
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
    const data = await this.upstreamHttpClient.getJson("/api/note", {
      method: "POST",
      headers: {
        Authorization: authorizationHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }, "Unable to create generated note through EducAIte API.");
    return noteApiResponseSchema.parse(data);
  }

  private normalizeGeneratedNoteName(documentName: string, generatedName: string): string {
    const canonicalName = documentName.trim();
    if (generatedName.trim().toLowerCase() === canonicalName.toLowerCase()) {
      return generatedName.trim();
    }

    return canonicalName;
  }

  private async findExistingGeneratedNote(
    documentSqid: string,
    artifactVersionToken: string,
    authorizationHeader: string,
  ): Promise<NoteApiResponse | null> {
    const generatedNoteArtifact = await this.generatedNoteArtifactRepository.findByDocumentVersion(
      documentSqid,
      artifactVersionToken,
    );
    if (!generatedNoteArtifact) {
      return null;
    }

    const note = await this.fetchNoteOrNull(generatedNoteArtifact.noteSqid, authorizationHeader);
    if (!note || note.documentSqid !== documentSqid) {
      await this.generatedNoteArtifactRepository.deleteById(generatedNoteArtifact.id);
      return null;
    }

    return note;
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
    "Generate one grounded study note from this extracted source material from a PDF.",
    'Return only JSON matching this shape: {"name":"...","noteContent":"..."}.',
    `Use this exact note name: "${generatedNoteName}".`,
    "The title must be concise and minimal.",
    "Do not add prefixes, suffixes, labels, or extra descriptive words to the title.",
    "Use only information supported by the extracted source material.",
    "Do not invent facts, examples, dates, formulas, or citations.",
    "Write noteContent as clean study text suitable for review.",
    "Prefer short sections, concise explanations, and faithful terminology from the source material.",
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
