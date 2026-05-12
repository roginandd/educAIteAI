import { z } from "zod";

import {
  generateFlashcardStudyCoachRecapInputSchema,
  generateFlashcardsFromNoteInputSchema,
  submitAndAnalyzeFlashcardInputSchema,
  submitFlashcardLearnAnswerInputSchema,
} from "../flashcards/flashcard.dto";
import { generateNoteFromDocumentInputSchema, summarizeNoteInputSchema } from "../notes/note.dto";
import {
  analyzeResumeWithRelationsInputSchema,
  companyRecommendationSearchInputSchema,
  resumeCertificateSuggestionsInputSchema,
  studentCareerHintInputSchema,
  studentJobTargetSuggestionsInputSchema,
  tailorResumeForJobInputSchema,
} from "../resumes/resume.dto";
import { studyFocusChatInputSchema } from "../study-buddy/study-buddy.dto";
import { parseAndApplyStudyLoadPdfInputSchema } from "../studyloads/studyload.dto";

export const agentMessageBodySchema = z.object({
  message: z.string().trim().min(1).max(12000),
});

export const agentMessageInputSchema = z.object({
  message: z.string().trim().min(1).max(12000),
});

export const agentTaskIntentSchema = z.enum([
  "generate_note_from_document",
  "summarize_note",
  "generate_flashcards_from_note",
  "generate_flashcards_preview",
  "submit_and_analyze_flashcard_answer",
  "evaluate_flashcard_answer",
  "submit_flashcard_learn_session_answer",
  "generate_flashcard_study_coach_recap",
  "analyze_resume_with_relations",
  "tailor_resume_for_job",
  "suggest_student_job_targets",
  "generate_student_career_hint",
  "suggest_resume_certificates",
  "search_resume_job_suggestions",
  "recommend_resume_job_opportunities",
  "parse_and_apply_studyload_pdf",
  "generate_study_focus_chat_reply",
]);

const generateNoteFromDocumentTaskSchema = z.object({
  intent: z.literal("generate_note_from_document"),
  payload: generateNoteFromDocumentInputSchema,
});

const summarizeNoteTaskSchema = z.object({
  intent: z.literal("summarize_note"),
  payload: summarizeNoteInputSchema,
});

const generateFlashcardsFromNoteTaskSchema = z.object({
  intent: z.literal("generate_flashcards_from_note"),
  payload: generateFlashcardsFromNoteInputSchema,
});

const generateFlashcardsPreviewTaskSchema = z.object({
  intent: z.literal("generate_flashcards_preview"),
  payload: generateFlashcardsFromNoteInputSchema,
});

const submitAndAnalyzeFlashcardAnswerTaskSchema = z.object({
  intent: z.literal("submit_and_analyze_flashcard_answer"),
  payload: submitAndAnalyzeFlashcardInputSchema,
});

const evaluateFlashcardAnswerTaskSchema = z.object({
  intent: z.literal("evaluate_flashcard_answer"),
  payload: submitAndAnalyzeFlashcardInputSchema,
});

const submitFlashcardLearnSessionAnswerTaskSchema = z.object({
  intent: z.literal("submit_flashcard_learn_session_answer"),
  payload: submitFlashcardLearnAnswerInputSchema,
});

const generateFlashcardStudyCoachRecapTaskSchema = z.object({
  intent: z.literal("generate_flashcard_study_coach_recap"),
  payload: generateFlashcardStudyCoachRecapInputSchema,
});

const analyzeResumeWithRelationsTaskSchema = z.object({
  intent: z.literal("analyze_resume_with_relations"),
  payload: analyzeResumeWithRelationsInputSchema,
});

const tailorResumeForJobTaskSchema = z.object({
  intent: z.literal("tailor_resume_for_job"),
  payload: tailorResumeForJobInputSchema,
});

const suggestStudentJobTargetsTaskSchema = z.object({
  intent: z.literal("suggest_student_job_targets"),
  payload: studentJobTargetSuggestionsInputSchema,
});

const generateStudentCareerHintTaskSchema = z.object({
  intent: z.literal("generate_student_career_hint"),
  payload: studentCareerHintInputSchema,
});

const suggestResumeCertificatesTaskSchema = z.object({
  intent: z.literal("suggest_resume_certificates"),
  payload: resumeCertificateSuggestionsInputSchema,
});

const searchResumeJobSuggestionsTaskSchema = z.object({
  intent: z.literal("search_resume_job_suggestions"),
  payload: companyRecommendationSearchInputSchema,
});

const recommendResumeJobOpportunitiesTaskSchema = z.object({
  intent: z.literal("recommend_resume_job_opportunities"),
  payload: companyRecommendationSearchInputSchema,
});

const parseAndApplyStudyLoadPdfTaskSchema = z.object({
  intent: z.literal("parse_and_apply_studyload_pdf"),
  payload: parseAndApplyStudyLoadPdfInputSchema,
});

const generateStudyFocusChatReplyTaskSchema = z.object({
  intent: z.literal("generate_study_focus_chat_reply"),
  payload: studyFocusChatInputSchema,
});

export const agentTaskBodySchema = z.discriminatedUnion("intent", [
  generateNoteFromDocumentTaskSchema,
  summarizeNoteTaskSchema,
  generateFlashcardsFromNoteTaskSchema,
  generateFlashcardsPreviewTaskSchema,
  submitAndAnalyzeFlashcardAnswerTaskSchema,
  evaluateFlashcardAnswerTaskSchema,
  submitFlashcardLearnSessionAnswerTaskSchema,
  generateFlashcardStudyCoachRecapTaskSchema,
  analyzeResumeWithRelationsTaskSchema,
  tailorResumeForJobTaskSchema,
  suggestStudentJobTargetsTaskSchema,
  generateStudentCareerHintTaskSchema,
  suggestResumeCertificatesTaskSchema,
  searchResumeJobSuggestionsTaskSchema,
  recommendResumeJobOpportunitiesTaskSchema,
  parseAndApplyStudyLoadPdfTaskSchema,
  generateStudyFocusChatReplyTaskSchema,
]);

export const agentTaskInputSchema = agentTaskBodySchema;

export type AgentMessageBody = z.output<typeof agentMessageBodySchema>;
export type AgentMessageInput = z.output<typeof agentMessageInputSchema>;
export type AgentTaskIntent = z.output<typeof agentTaskIntentSchema>;
export type AgentTaskBody = z.output<typeof agentTaskBodySchema>;
export type AgentTaskInput = z.output<typeof agentTaskInputSchema>;
