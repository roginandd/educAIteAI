import { z } from "zod";

import {
  evaluateFlashcardAnswerResponseSchema,
  generateFlashcardsPreviewResponseSchema,
  generateFlashcardsFromNoteResponseSchema,
  submitAndAnalyzeFlashcardResponseSchema,
  submitFlashcardLearnAnswerResponseSchema,
} from "../flashcards/flashcard.response";
import { flashcardStudyCoachRecapOutputSchema } from "../flashcards/flashcard.dto";
import { generateNoteFromDocumentResponseSchema, summarizeNoteResponseSchema } from "../notes/note.response";
import {
  analyzeResumeWithRelationsResponseSchema,
  companyRecommendationSearchResponseSchema,
  resumeCertificateSuggestionsResponseSchema,
  studentCareerHintResponseSchema,
  studentJobTargetSuggestionsResponseSchema,
  tailorResumeForJobResponseSchema,
} from "../resumes/resume.response";
import { studyFocusChatOutputSchema } from "../study-buddy/study-buddy.dto";
import { parseAndApplyStudyLoadPdfResponseSchema } from "../studyloads/studyload.response";

export const agentMessageResponseSchema = z.object({
  response: z.string().trim().min(1),
});

export const agentTaskResponseSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("generate_note_from_document"),
    result: generateNoteFromDocumentResponseSchema,
  }),
  z.object({
    intent: z.literal("summarize_note"),
    result: summarizeNoteResponseSchema,
  }),
  z.object({
    intent: z.literal("generate_flashcards_from_note"),
    result: generateFlashcardsFromNoteResponseSchema,
  }),
  z.object({
    intent: z.literal("generate_flashcards_preview"),
    result: generateFlashcardsPreviewResponseSchema,
  }),
  z.object({
    intent: z.literal("submit_and_analyze_flashcard_answer"),
    result: submitAndAnalyzeFlashcardResponseSchema,
  }),
  z.object({
    intent: z.literal("evaluate_flashcard_answer"),
    result: evaluateFlashcardAnswerResponseSchema,
  }),
  z.object({
    intent: z.literal("submit_flashcard_learn_session_answer"),
    result: submitFlashcardLearnAnswerResponseSchema,
  }),
  z.object({
    intent: z.literal("generate_flashcard_study_coach_recap"),
    result: flashcardStudyCoachRecapOutputSchema,
  }),
  z.object({
    intent: z.literal("analyze_resume_with_relations"),
    result: analyzeResumeWithRelationsResponseSchema,
  }),
  z.object({
    intent: z.literal("tailor_resume_for_job"),
    result: tailorResumeForJobResponseSchema,
  }),
  z.object({
    intent: z.literal("suggest_student_job_targets"),
    result: studentJobTargetSuggestionsResponseSchema,
  }),
  z.object({
    intent: z.literal("generate_student_career_hint"),
    result: studentCareerHintResponseSchema,
  }),
  z.object({
    intent: z.literal("suggest_resume_certificates"),
    result: resumeCertificateSuggestionsResponseSchema,
  }),
  z.object({
    intent: z.literal("search_resume_job_suggestions"),
    result: companyRecommendationSearchResponseSchema,
  }),
  z.object({
    intent: z.literal("recommend_resume_job_opportunities"),
    result: companyRecommendationSearchResponseSchema,
  }),
  z.object({
    intent: z.literal("parse_and_apply_studyload_pdf"),
    result: parseAndApplyStudyLoadPdfResponseSchema,
  }),
  z.object({
    intent: z.literal("generate_study_focus_chat_reply"),
    result: studyFocusChatOutputSchema,
  }),
]);

export type AgentMessageResponse = z.output<typeof agentMessageResponseSchema>;
export type AgentTaskResponse = z.output<typeof agentTaskResponseSchema>;
