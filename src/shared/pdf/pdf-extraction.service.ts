import type { Runner } from "@google/adk";

import { PdfExtractionRepository } from "./pdf-extraction.repository";
import {
  pdfExtractionOutputSchema,
  pdfSourceRefSchema,
  type PdfExtractionArtifact,
  type PdfSourceRef,
} from "./pdf-extraction.dto";
import { PdfProcessingService } from "./pdf-processing.service";

export class PdfExtractionService {
  constructor(
    private readonly extractionRunner: Runner,
    private readonly pdfProcessingService: PdfProcessingService,
    private readonly pdfExtractionRepository: PdfExtractionRepository,
  ) {}

  async ensureExtraction(sourceRef: PdfSourceRef): Promise<PdfExtractionArtifact> {
    const source = pdfSourceRefSchema.parse(sourceRef);
    const existingArtifact = await this.pdfExtractionRepository.findBySource(source.sourceType, source.sourceSqid);

    if (existingArtifact?.versionToken === source.versionToken) {
      return existingArtifact;
    }

    const extraction = await this.pdfProcessingService.runStructuredPdfAgent({
      runner: this.extractionRunner,
      userId: `pdf_extraction_service_${source.sourceType}`,
      prompt: buildPdfExtractionPrompt(source.displayName),
      signedUrl: source.signedUrl,
      outputKey: "pdf_extraction_output",
      outputSchema: pdfExtractionOutputSchema,
      downloadErrorMessage: "Unable to download the PDF for extraction from the signed URL.",
      invalidJsonMessage: "PDF extraction agent returned invalid JSON.",
      noResponseMessage: "PDF extraction agent did not return a final response.",
    });

    return this.pdfExtractionRepository.upsert({
      sourceType: source.sourceType,
      sourceSqid: source.sourceSqid,
      fileMetadataSqid: source.fileMetadataSqid,
      versionToken: source.versionToken,
      extractedText: extraction.extractedText,
    });
  }
}

function buildPdfExtractionPrompt(displayName?: string): string {
  const scopedName = displayName?.trim();

  return [
    "Extract faithful text from this PDF.",
    'Return only JSON matching this shape: {"extractedText":"..."}.',
    "Do not summarize, explain, interpret, or improve the content.",
    "Preserve headings, sections, tables, and lists as clean Markdown where possible.",
    "Keep formulas, codes, identifiers, and terminology exactly when readable.",
    "If text is unreadable or ambiguous, omit the unclear fragment instead of guessing.",
    scopedName ? `Document label: ${scopedName}` : undefined,
  ].filter(Boolean).join("\n");
}
