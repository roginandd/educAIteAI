import { createFlashcardAnalyticsRunner, createFlashcardsGenerationRunner, createPerformanceSummaryRunner } from "../agents/flashcards/agent";
import { createCertificateParsingRunner, createCertificateSuggestionRunner } from "../agents/certificates/agent";
import { createNotesGenerationRunner, createNotesSummarizationRunner } from "../agents/notes/agent";
import { createPdfExtractionRunner } from "../agents/pdf/agent";
import {
  createResumeAnalysisRunner,
  createResumeCertificateSuggestionRunner,
  createResumeJobProfileRunner,
  createResumeTailoringRunner,
} from "../agents/resumes/agent";
import {
  createSmartQuizAnswerScoringRunner,
  createSmartQuizCodeFeedbackRunner,
  createSmartQuizContextClassifierRunner,
  createSmartQuizFlowchartEvaluatorRunner,
  createSmartQuizItemGeneratorRunner,
  createSmartQuizRetryVariantRunner,
} from "../agents/smart-quiz/agent";
import { createStudyLoadParsingRunner } from "../agents/studyloads/agent";
import { AgentService } from "../features/agent/agent.service";
import { CertificateService } from "../features/certificates/certificate.service";
import { FlashcardService } from "../features/flashcards/flashcard.service";
import { GeneratedNoteArtifactRepository } from "../features/notes/generated-note-artifact.repository";
import { NoteService } from "../features/notes/note.service";
import { OnboardingService } from "../features/onboarding/onboarding.service";
import { ResumeService } from "../features/resumes/resume.service";
import {
  DisabledCodeExecutionSupervisor,
  Judge0CodeExecutionSupervisor,
} from "../features/smart-quiz/code-execution-supervisor";
import { SmartQuizService } from "../features/smart-quiz/smart-quiz.service";
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
  smartQuizService: SmartQuizService;
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
  const codeExecutionSupervisor = env.JUDGE0_API_BASE_URL
    ? new Judge0CodeExecutionSupervisor({
        baseUrl: env.JUDGE0_API_BASE_URL,
        apiKey: env.JUDGE0_API_KEY,
        apiKeyHeader: env.JUDGE0_API_KEY_HEADER,
      })
    : new DisabledCodeExecutionSupervisor();
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
    codeExecutionSupervisor,
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
    createResumeCertificateSuggestionRunner(),
    createResumeJobProfileRunner(),
    createResumeTailoringRunner(),
    upstreamHttpClient,
    structuredAgentRunnerService,
    publicWebSearchService,
  );
  const smartQuizService = new SmartQuizService(
    createSmartQuizContextClassifierRunner(),
    createSmartQuizItemGeneratorRunner(),
    createSmartQuizAnswerScoringRunner(),
    createSmartQuizCodeFeedbackRunner(),
    createSmartQuizFlowchartEvaluatorRunner(),
    createSmartQuizRetryVariantRunner(),
    createPdfExtractionRunner(),
    structuredAgentRunnerService,
    codeExecutionSupervisor,
    pdfProcessingService,
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
    smartQuizService,
    studentPerformanceService,
    studyLoadService,
  };
}
