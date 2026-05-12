import type { Content } from "@google/genai";
import type { Runner } from "@google/adk";

import { StructuredAgentRunnerService } from "../../shared/ai/structured-agent-runner.service";
import {
  studyFocusChatInputSchema,
  studyFocusChatOutputSchema,
  type StudyBuddyCourseSummary,
  type StudyBuddyFlashcardRisk,
  type StudyFocusChatInput,
  type StudyFocusChatOutput,
} from "./study-buddy.dto";

type StudyBuddyAction = NonNullable<StudyFocusChatOutput["primaryAction"]>;

const refusalText = "I can only help with studying, flashcards, quizzes, weak topics, and learning progress in EducAIte.";
const insufficientProgressText = "I do not have enough EducAIte progress data yet to summarize your learning progress. Try answering more flashcards or completing a quiz first.";
const greetingText = "Hi! I’m AImpatin, your EducAIte study buddy. I can help with what to study today, weak topics, flashcards, quiz prep, and progress summaries.";

export class StudyBuddyService {
  constructor(
    private readonly studyBuddyRunner: Runner,
    private readonly structuredAgentRunnerService: StructuredAgentRunnerService,
  ) {}

  async generateReply(input: StudyFocusChatInput): Promise<StudyFocusChatOutput> {
    const parsedInput = studyFocusChatInputSchema.parse(input);
    const deterministicResponse = buildDeterministicStudyBuddyResponse(parsedInput);
    if (deterministicResponse) {
      return finalizeStudyBuddyResponse(parsedInput, deterministicResponse);
    }

    const agentResponse = await this.structuredAgentRunnerService.runStructuredPrompt({
      runner: this.studyBuddyRunner,
      userId: "study_buddy_chat",
      message: buildJsonPrompt("Generate an EducAIte study buddy reply.", parsedInput),
      outputKey: "study_focus_chat_output",
      outputSchema: studyFocusChatOutputSchema,
      invalidJsonMessage: "Study buddy agent returned invalid JSON.",
      noResponseMessage: "Study buddy agent did not return a final response.",
    });

    return finalizeStudyBuddyResponse(parsedInput, agentResponse);
  }
}

export function buildDeterministicStudyBuddyResponse(input: StudyFocusChatInput): StudyFocusChatOutput | null {
  const parsedInput = studyFocusChatInputSchema.parse(input);
  const normalizedMessage = parsedInput.message.toLowerCase();
  const intent = parsedInput.intent?.toLowerCase();
  const explicitWeakTopicAsk = asksForWeakTopics(normalizedMessage);
  const explicitQuizPrepAsk = asksForQuizPrep(normalizedMessage);
  const explicitNotesAsk = asksForNotes(normalizedMessage);
  const explicitRecentActivityAsk = asksForRecentActivity(normalizedMessage);
  const explicitProgressAsk = asksForProgressSummary(normalizedMessage);

  if (isCasualGreeting(normalizedMessage)) {
    return createStructuredMessage(greetingText);
  }

  if (asksForName(normalizedMessage) || isHarmlessSmallTalk(normalizedMessage)) {
    return createStructuredMessage("I’m AImpatin. I can help you study, open notes, review flashcards, or start practice.");
  }

  if (intent === "unrelatedrefusal") {
    return createStructuredMessage(refusalText);
  }

  if (isClearlyUnrelated(normalizedMessage)) {
    return createStructuredMessage(refusalText);
  }

  if (intent === "recentactivity" || explicitRecentActivityAsk) {
    return buildRecentActivitySummary(parsedInput);
  }

  if (intent === "notesfocus" || explicitNotesAsk) {
    return buildNotesFocus(parsedInput);
  }

  if (
    intent === "repeatedmistakes"
    || (intent === "strugglediagnosis" && explicitWeakTopicAsk)
    || (intent === "weaktopics" && explicitWeakTopicAsk)
    || explicitWeakTopicAsk
  ) {
    return buildWeakConceptSummary(parsedInput);
  }

  if (intent === "quizprep" || explicitQuizPrepAsk) {
    return buildQuizPrep(parsedInput);
  }

  if (intent === "progresssummary" || explicitProgressAsk) {
    if (!hasStudyContext(parsedInput) && !hasSnapshotData(parsedInput)) {
      return createFallback(insufficientProgressText);
    }

    return buildProgressSummary(parsedInput);
  }

  if (!hasStudyContext(parsedInput) && asksForPersonalProgress(normalizedMessage)) {
    return createFallback(insufficientProgressText);
  }

  if (asksForFlashcards(normalizedMessage) && parsedInput.studyContext.topRiskFlashcards.length > 0) {
    return buildFlashcardSuggestion(parsedInput.studyContext.topRiskFlashcards);
  }

  if (asksWhatToStudy(normalizedMessage) && hasStudyContext(parsedInput)) {
    return buildStudyPlan(parsedInput);
  }

  return null;
}

function buildProgressSummary(input: StudyFocusChatInput): StudyFocusChatOutput {
  const summary = input.studyContext.overallSummary;
  const riskyCourse = [...input.studyContext.topRiskCourses].sort(compareCourseRisk)[0];
  const weakConcept = [...(input.studentContextSnapshot?.repeatedWeakConcepts ?? [])]
    .sort((a, b) => b.missCount - a.missCount)[0];

  const lines: string[] = [];
  if (summary) {
    lines.push(
      `Current signals: performance ${formatScore(summary.overallPerformanceScore)}, retention ${formatScore(summary.learningRetentionRate)}, confidence ${formatScore(summary.confidenceScore)}, risk ${summary.riskLevel}.`,
    );
  }

  if (riskyCourse) {
    lines.push(`Highest-risk course right now is ${riskyCourse.courseName}.`);
  }

  if (weakConcept) {
    lines.push(`Most repeated weak concept in recent attempts: ${weakConcept.concept} (${weakConcept.missCount} misses).`);
  }

  if (lines.length === 0) {
    return createFallback(insufficientProgressText);
  }

  return createStructuredMessage(lines.join(" "));
}

function buildNotesFocus(input: StudyFocusChatInput): StudyFocusChatOutput {
  const materials = [...(input.studentContextSnapshot?.recentMaterials ?? [])]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 3);

  if (materials.length === 0) {
    return createStructuredMessage("I do not have enough recent note or document activity yet. Open or update a few notes first, then ask again.");
  }

  return studyFocusChatOutputSchema.parse({
    message: `Focus on ${materials[0].noteName} first.`,
    recommendedTopic: materials[0].noteName,
    reason: "These are your most recent materials, so they are the fastest way to recover momentum.",
    studySequence: materials.map((m) => `Review note "${m.noteName}" from "${m.documentName}" (/notes/${m.noteSqid}).`),
    reviewChecklist: [
      "Can you summarize each note in 2-3 sentences from memory?",
      "Can you list one unclear concept from each note?",
      "Can you convert the weakest point into one flashcard prompt?",
    ],
    practiceTask: `Start with "${materials[0].noteName}" and write a 5-point recall summary without opening the note.`,
  });
}

function buildWeakConceptSummary(input: StudyFocusChatInput): StudyFocusChatOutput {
  const weakConcepts = [...(input.studentContextSnapshot?.repeatedWeakConcepts ?? [])]
    .sort((a, b) => b.missCount - a.missCount)
    .slice(0, 3);

  if (weakConcepts.length === 0) {
    if (!hasStudyContext(input)) {
      return createStructuredMessage("I do not have enough weak-topic evidence yet from your EducAIte data.");
    }

    const fallbackCourse = [...input.studyContext.topRiskCourses].sort(compareCourseRisk)[0];
    if (!fallbackCourse) {
      return createStructuredMessage("I do not have enough weak-topic evidence yet from your EducAIte data.");
    }

    const firstNote = [...(input.studentContextSnapshot?.recentMaterials ?? [])][0];
    const noteHint = firstNote
      ? ` Start here: "${firstNote.noteName}" (/notes/${firstNote.noteSqid}).`
      : "";

    return createStructuredMessage(
      `Great question. Right now, your weakest subject is ${fallbackCourse.courseName}. Let’s review that first, then do 3 quick recall questions.${noteHint}`,
    );
  }

  return createStructuredMessage(
    `You’re getting stuck most on: ${weakConcepts
      .map((item) => `${item.concept} (${item.missCount} misses${item.averageCorrectnessScore == null ? "" : `, avg ${formatScore(item.averageCorrectnessScore)}`})`)
      .join("; ")}.`,
  );
}

function buildQuizPrep(input: StudyFocusChatInput): StudyFocusChatOutput {
  const topCourse = [...input.studyContext.topRiskCourses].sort(compareCourseRisk)[0];
  const topFlashcards = [...input.studyContext.topRiskFlashcards].sort(compareFlashcardRisk).slice(0, 2);
  const weakConcept = [...(input.studentContextSnapshot?.repeatedWeakConcepts ?? [])]
    .sort((a, b) => b.missCount - a.missCount)[0];

  const topic = topCourse?.courseName ?? weakConcept?.concept ?? topFlashcards[0]?.question ?? "your weakest topic";

  return studyFocusChatOutputSchema.parse({
    message: `Start with ${topic}.`,
    recommendedTopic: topic,
    reason: "This selection prioritizes the strongest available risk and mistake signals from your current EducAIte data.",
    studySequence: [
      `Do a 15-minute focused review on ${topic}.`,
      ...topFlashcards.map((f) => `Answer this weak flashcard from memory: ${f.question}`),
      weakConcept ? `Rework one recent mistake around: ${weakConcept.concept}.` : "Rework one recent missed question from memory.",
    ].slice(0, 5),
    reviewChecklist: [
      "Can you explain the topic without notes?",
      "Can you solve one representative problem correctly?",
      "Can you state your most common mistake and how to avoid it?",
    ],
    practiceTask: `Before your quiz, complete one timed 10-minute mini-review on ${topic} and check errors immediately.`,
  });
}

function buildRecentActivitySummary(input: StudyFocusChatInput): StudyFocusChatOutput {
  const timeline = [...(input.studentContextSnapshot?.recentActivityTimeline ?? [])]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 6);

  if (timeline.length === 0) {
    return createStructuredMessage("I do not have enough recent study activity yet in EducAIte.");
  }

  const text = timeline
    .map((item) => `${item.activityType}: ${item.title}`)
    .join("; ");

  return createStructuredMessage(`Your recent learning activity: ${text}.`);
}

function buildStudyPlan(input: StudyFocusChatInput): StudyFocusChatOutput {
  const topCourse = [...input.studyContext.topRiskCourses].sort(compareCourseRisk)[0];
  const topFlashcard = [...input.studyContext.topRiskFlashcards].sort(compareFlashcardRisk)[0];
  const recommendedTopic = topCourse?.courseName ?? topFlashcard?.question ?? "Your highest-risk review item";
  const reason = topCourse
    ? `This course has the highest available risk signal, with ${formatScore(topCourse.learningRetentionRate)} retention and ${formatScore(topCourse.confidenceScore)} confidence.`
    : `This flashcard is currently marked ${topFlashcard?.riskLevel ?? "high risk"} with ${formatScore(topFlashcard?.retentionScore)} retention.`;

  return studyFocusChatOutputSchema.parse({
    message: `Study ${recommendedTopic} first.`,
    recommendedTopic,
    reason,
    studySequence: [
      `Review ${recommendedTopic} for 10 minutes.`,
      topFlashcard ? `Answer this flashcard without notes: ${topFlashcard.question}` : "Write a short recall summary from memory.",
      "Check the explanation or notes only after attempting recall.",
      "Repeat the weakest item once more before stopping.",
    ],
    reviewChecklist: [
      "Can you explain the main idea without reading notes?",
      "Can you answer the weak flashcard correctly?",
      "Can you name the mistake to avoid next time?",
    ],
    practiceTask: topFlashcard
      ? `Practice this flashcard now: ${topFlashcard.question}`
      : `Create three quick questions about ${recommendedTopic} and answer them from memory.`,
  });
}

function buildFlashcardSuggestion(flashcards: readonly StudyBuddyFlashcardRisk[]): StudyFocusChatOutput {
  const orderedFlashcards = [...flashcards].sort(compareFlashcardRisk).slice(0, 3);
  const firstFlashcard = orderedFlashcards[0];

  return studyFocusChatOutputSchema.parse({
    message: `Review ${firstFlashcard.question} first.`,
    recommendedTopic: firstFlashcard.question,
    reason: `This flashcard has the strongest available risk signal: ${firstFlashcard.riskLevel}, ${formatScore(firstFlashcard.retentionScore)} retention, and ${formatScore(firstFlashcard.confidenceScore)} confidence.`,
    studySequence: orderedFlashcards.map((flashcard) => `Practice: ${flashcard.question}`),
    reviewChecklist: orderedFlashcards.map((flashcard) => {
      const suggestion = flashcard.improvementSuggestion.trim();
      return suggestion ? suggestion : `Explain why the answer to "${flashcard.question}" is correct.`;
    }),
    practiceTask: `Start with this flashcard: ${firstFlashcard.question}`,
  });
}

function createFallback(fallbackText: string): StudyFocusChatOutput {
  return studyFocusChatOutputSchema.parse({
    message: fallbackText,
    recommendedTopic: "",
    reason: "",
    studySequence: [],
    reviewChecklist: [],
    practiceTask: null,
    fallbackText,
  });
}

function createStructuredMessage(message: string): StudyFocusChatOutput {
  return studyFocusChatOutputSchema.parse({
    message,
    recommendedTopic: "",
    reason: "",
    studySequence: [],
    reviewChecklist: [],
    practiceTask: null,
    fallbackText: message,
    actions: [],
  });
}

function buildJsonPrompt(task: string, payload: unknown): Content {
  return {
    role: "user",
    parts: [
      {
        text: `${task}\n\nInput JSON:\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
  };
}

function finalizeStudyBuddyResponse(input: StudyFocusChatInput, output: StudyFocusChatOutput): StudyFocusChatOutput {
  const parsedOutput = studyFocusChatOutputSchema.parse(output);
  const fallbackMessage = buildFallbackStudyBuddyMessage(input);
  const suppliedMessage = firstNonEmptyString(
    parsedOutput.message,
    parsedOutput.fallbackText,
    parsedOutput.reason,
    parsedOutput.practiceTask,
  );
  const message = suppliedMessage ?? fallbackMessage;
  const derivedActions = buildContextActions(input);
  const actions = mergeActions(parsedOutput.actions, derivedActions);
  const primaryAction = parsedOutput.primaryAction ?? actions[0] ?? undefined;
  const context = parsedOutput.context ?? buildContextReference(input);

  return studyFocusChatOutputSchema.parse({
    ...parsedOutput,
    message,
    fallbackText: parsedOutput.fallbackText?.trim() || (suppliedMessage ? undefined : fallbackMessage),
    primaryAction,
    actions,
    context,
  });
}

function buildFallbackStudyBuddyMessage(input: StudyFocusChatInput): string {
  if (hasStudyContext(input)) {
    return "Use your current EducAIte progress signals to pick one focused review task, then answer one related flashcard.";
  }

  if (hasSnapshotData(input)) {
    return "I can help with your recent notes, activity, and weak concepts. Tell me whether you want note focus, quiz prep, or flashcard review.";
  }

  return "Tell me what subject, note, quiz, or flashcard you want to study, and I will keep the reply focused.";
}

function buildContextActions(input: StudyFocusChatInput): StudyBuddyAction[] {
  const actions: StudyBuddyAction[] = [];
  const topFlashcard = [...input.studyContext.topRiskFlashcards].sort(compareFlashcardRisk)[0];
  const topMaterial = [...(input.studentContextSnapshot?.recentMaterials ?? [])]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  const topCourse = [...input.studyContext.topRiskCourses].sort(compareCourseRisk)[0];

  if (topFlashcard) {
    actions.push({
      label: "Review flashcard",
      type: "flashcard",
      href: `/flashcards/${encodeURIComponent(topFlashcard.flashcardSqid)}`,
    });
  }

  if (topMaterial) {
    actions.push({
      label: "Open note",
      type: "note",
      href: `/notes/${encodeURIComponent(topMaterial.noteSqid)}`,
    });
  }

  if (topCourse) {
    actions.push({
      label: "Review course",
      type: "course",
      href: `/courses/${encodeURIComponent(topCourse.studentCourseSqid)}`,
    });
  }

  if (actions.length === 0 && hasStudyContext(input)) {
    actions.push({
      label: "Open dashboard",
      type: "dashboard",
      href: "/dashboard",
    });
  }

  return actions;
}

function buildContextReference(input: StudyFocusChatInput): StudyFocusChatOutput["context"] | undefined {
  const topFlashcard = [...input.studyContext.topRiskFlashcards].sort(compareFlashcardRisk)[0];
  const topMaterial = [...(input.studentContextSnapshot?.recentMaterials ?? [])]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
  const topCourse = [...input.studyContext.topRiskCourses].sort(compareCourseRisk)[0];

  if (!topFlashcard && !topMaterial && !topCourse) {
    return undefined;
  }

  return {
    courseSqid: topCourse?.studentCourseSqid ?? topMaterial?.studentCourseSqid ?? null,
    topic: topCourse?.courseName ?? topFlashcard?.question ?? topMaterial?.noteName ?? null,
    noteSqid: topMaterial?.noteSqid ?? null,
    documentSqid: topMaterial?.documentSqid ?? null,
    deckSqid: null,
    flashcardSqid: topFlashcard?.flashcardSqid ?? null,
  };
}

function mergeActions(existingActions: StudyBuddyAction[], derivedActions: StudyBuddyAction[]): StudyBuddyAction[] {
  const seen = new Set<string>();
  const merged: StudyBuddyAction[] = [];

  for (const action of [...existingActions, ...derivedActions]) {
    const key = `${action.type}:${action.href}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(action);
  }

  return merged.slice(0, 8);
}

function firstNonEmptyString(...values: Array<string | null | undefined>): string | undefined {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function hasStudyContext(input: StudyFocusChatInput): boolean {
  return Boolean(input.studyContext.overallSummary)
    || input.studyContext.topRiskCourses.length > 0
    || input.studyContext.topRiskFlashcards.length > 0;
}

function hasSnapshotData(input: StudyFocusChatInput): boolean {
  return (input.studentContextSnapshot?.recentMaterials.length ?? 0) > 0
    || (input.studentContextSnapshot?.recentQuizAttempts.length ?? 0) > 0
    || (input.studentContextSnapshot?.repeatedWeakConcepts.length ?? 0) > 0
    || (input.studentContextSnapshot?.recentActivityTimeline.length ?? 0) > 0;
}

function asksWhatToStudy(message: string): boolean {
  return /\b(what|which|where)\b.*\b(study|review|focus|practice)\b/.test(message)
    || /\b(study today|focus today|review today|what should i do)\b/.test(message);
}

function asksForFlashcards(message: string): boolean {
  return /\b(flashcard|flashcards)\b/.test(message)
    && /\b(suggest|recommend|practice|review|which|what)\b/.test(message);
}

function asksForPersonalProgress(message: string): boolean {
  return /\b(my|mine|me)\b.*\b(progress|performance|weak|weakness|score|scores|retention|confidence|mastery|quiz|quizzes)\b/.test(message)
    || /\b(summarize|summary)\b.*\b(progress|learning|performance)\b/.test(message)
    || asksWhatToStudy(message)
    || asksForFlashcards(message);
}

function asksForWeakTopics(message: string): boolean {
  return /\b(weak|weakness|struggling|struggle|hard time|keep getting wrong|repeated mistakes|mistakes)\b/.test(message);
}

function asksForQuizPrep(message: string): boolean {
  return /\b(quiz prep|prepare for quiz|before my next quiz|next quiz)\b/.test(message);
}

function asksForNotes(message: string): boolean {
  return /\b(notes|materials|documents|what notes should i focus on)\b/.test(message);
}

function asksForRecentActivity(message: string): boolean {
  return /\b(recent|lately|worked on|activity)\b/.test(message);
}

function asksForProgressSummary(message: string): boolean {
  return /\b(progress|summary|summarize|performance)\b/.test(message);
}

function isCasualGreeting(message: string): boolean {
  return /^(hi|hello|hey|yo|good morning|good afternoon|good evening)\b[!. ]*$/.test(message.trim());
}

function asksForName(message: string): boolean {
  return /\b(what('?s| is) your name|who are you)\b/.test(message);
}

function isHarmlessSmallTalk(message: string): boolean {
  return /\b(how are you|thanks|thank you|nice|cool)\b/.test(message);
}

function isClearlyUnrelated(message: string): boolean {
  const hasStudySignal = /\b(study|studying|learn|learning|review|flashcard|flashcards|quiz|quizzes|course|topic|concept|homework|exam|progress|performance|weak|retention|mastery)\b/.test(message);
  if (hasStudySignal) {
    return false;
  }

  return /\b(weather|recipe|cook|cooking|dating|relationship|movie|movies|song|songs|travel|vacation|stock|stocks|crypto|politics|sports|joke|shopping)\b/.test(message);
}

function compareCourseRisk(left: StudyBuddyCourseSummary, right: StudyBuddyCourseSummary): number {
  return riskWeight(right.riskLevel) - riskWeight(left.riskLevel)
    || left.learningRetentionRate - right.learningRetentionRate
    || left.confidenceScore - right.confidenceScore
    || left.overallPerformanceScore - right.overallPerformanceScore;
}

function compareFlashcardRisk(left: StudyBuddyFlashcardRisk, right: StudyBuddyFlashcardRisk): number {
  return riskWeight(right.riskLevel) - riskWeight(left.riskLevel)
    || left.retentionScore - right.retentionScore
    || left.confidenceScore - right.confidenceScore;
}

function riskWeight(value: string): number {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("critical")) {
    return 4;
  }

  if (normalized.includes("high")) {
    return 3;
  }

  if (normalized.includes("medium") || normalized.includes("moderate")) {
    return 2;
  }

  if (normalized.includes("low")) {
    return 1;
  }

  return 0;
}

function formatScore(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return "unknown";
  }

  return `${Math.round(value)}%`;
}
