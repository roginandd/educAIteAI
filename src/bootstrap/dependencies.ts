import { createFlashcardAnalyticsRunner, createFlashcardsGenerationRunner, createPerformanceSummaryRunner } from "../agents/flashcards/agent";
import { createCertificateParsingRunner, createCertificateSuggestionRunner } from "../agents/certificates/agent";
import { createNotesGenerationRunner, createNotesSummarizationRunner } from "../agents/notes/agent";
import { createPdfExtractionRunner } from "../agents/pdf/agent";
import { createResumeAnalysisRunner, createResumeJobProfileRunner, createResumeTailoringRunner } from "../agents/resumes/agent";
import { createStudyLoadParsingRunner } from "../agents/studyloads/agent";
import { AgentService } from "../features/agent/agent.service";
import { CertificateService } from "../features/certificates/certificate.service";
import { FlashcardService } from "../features/flashcards/flashcard.service";
import { GeneratedNoteArtifactRepository } from "../features/notes/generated-note-artifact.repository";
import { NoteService } from "../features/notes/note.service";
import { OnboardingService } from "../features/onboarding/onboarding.service";
import { ResumeService } from "../features/resumes/resume.service";
import { StudentPerformanceService } from "../features/student-performance/student-performance.service";
import { StudyLoadService } from "../features/studyloads/studyload.service";
import { env } from "../config/env";
import { UpstreamHttpClient } from "../shared/http/upstream-http-client";
import { StructuredAgentRunnerService } from "../shared/ai/structured-agent-runner.service";
import { PdfExtractionRepository } from "../shared/pdf/pdf-extraction.repository";
import { PdfExtractionService } from "../shared/pdf/pdf-extraction.service";
import { PdfProcessingService } from "../shared/pdf/pdf-processing.service";
import { DuckDuckGoPublicWebSearchService } from "../shared/search/public-web-search.service";

export interface AppDependencies {
  agentService: AgentService;
  certificateService: CertificateService;
  flashcardService: FlashcardService;
  noteService: NoteService;
  onboardingService: OnboardingService;
  resumeService: ResumeService;
  studentPerformanceService: StudentPerformanceService;
  studyLoadService: StudyLoadService;
}

export function createDependencies(): AppDependencies {
  const upstreamHttpClient = new UpstreamHttpClient(env.EDUCAITE_API_BASE_URL);
  const structuredAgentRunnerService = new StructuredAgentRunnerService();
  const pdfProcessingService = new PdfProcessingService(upstreamHttpClient);
  const pdfExtractionRepository = new PdfExtractionRepository();
  const pdfExtractionService = new PdfExtractionService(
    createPdfExtractionRunner(),
    pdfProcessingService,
    pdfExtractionRepository,
  );
  const generatedNoteArtifactRepository = new GeneratedNoteArtifactRepository();
  const publicWebSearchService = new DuckDuckGoPublicWebSearchService();
  const certificateService = new CertificateService(
    createCertificateParsingRunner(),
    createCertificateSuggestionRunner(),
    pdfProcessingService,
    structuredAgentRunnerService,
  );
  const flashcardService = new FlashcardService(
    createFlashcardsGenerationRunner(),
    createFlashcardAnalyticsRunner(),
    upstreamHttpClient,
  );
  const noteService = new NoteService(
    createNotesGenerationRunner(),
    createNotesSummarizationRunner(),
    upstreamHttpClient,
    pdfProcessingService,
    pdfExtractionService,
    generatedNoteArtifactRepository,
  );
  const studentPerformanceService = new StudentPerformanceService(createPerformanceSummaryRunner());
  const resumeService = new ResumeService(
    createResumeAnalysisRunner(),
    createResumeJobProfileRunner(),
    createResumeTailoringRunner(),
    upstreamHttpClient,
    structuredAgentRunnerService,
    publicWebSearchService,
  );
  const studyLoadService = new StudyLoadService(
    createStudyLoadParsingRunner(),
    upstreamHttpClient,
    pdfProcessingService,
    pdfExtractionService,
  );
  const onboardingService = new OnboardingService(studyLoadService, upstreamHttpClient);
  const agentService = new AgentService({
    flashcardService,
    noteService,
    resumeService,
    studyLoadService,
  });

  return {
    agentService,
    certificateService,
    flashcardService,
    noteService,
    onboardingService,
    resumeService,
    studentPerformanceService,
    studyLoadService,
  };
}
