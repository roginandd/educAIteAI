import type { GenerateFlashcardStudyCoachRecapInput, GenerateFlashcardsFromNoteInput } from "./flashcard.dto";
import type { FlashcardAnalyticsEvaluationContextResponse } from "./flashcard.response";
import {
  inferPreviewItemTypes,
  inferTechnicalLanguage,
  isProgrammingFocusedSource,
  type SuppliedFlashcardContext,
} from "./flashcard.utils";

const programmingModePolicy = `
PROGRAMMING MODE IS ACTIVE.

The source material is programming-related.

Required distribution:
- At least 70% of generated cards must be one of: Algorithm, CodeReading, OutputPrediction, Debugging.
- At most 30% may be Conceptual or ShortAnswer.
- Conceptual must only be used when the content cannot reasonably become code reading, output prediction, debugging, or algorithm practice.

Item type rules:
- Use Algorithm when the learner must implement a function, solve a DAA problem, write code, optimize logic, or reason about time and space complexity.
- Use CodeReading when the learner must explain what a code snippet does.
- Use OutputPrediction when the learner must predict printed output, return value, final variable state, SQL result, or runtime behavior.
- Use Debugging when the learner must find or fix a bug, exception, incorrect output, failed test case, or broken logic.
- Use ShortAnswer only for short technical facts, syntax rules, or API behavior.
- Use Conceptual only for pure theory with no useful code, trace, test case, implementation task, or debugging angle.

Language rules:
- Infer the programming language from the source when possible.
- Use the inferred language in technicalLanguage.
- Starter code, code snippets, and examples must match the inferred language.
- If the source has multiple languages, use the language most relevant to the selected card.
- If the source clearly uses one language, set validationConfigJson.languagePolicy to "source-language" and validationConfigJson.supportedLanguages to that one language.
- If the source does not clearly require one language, set validationConfigJson.languagePolicy to "any", use "Generic" in technicalLanguage, and let the learner answer in any programming language.
- Prioritize the programming language from the source material over broad any-language practice.

For Algorithm cards:
- validationConfigJson must include functionSignature.
- validationConfigJson must include starterCodeByLanguage.
- starterCodeByLanguage must include AI-generated Judge0-ready starter code for the selected language, including helpful comments derived from the problem but no completed solution.
- For languages like Java and C#, starter code must be a complete executable program with the required class wrapper. Do not return a method-only snippet that would fail to compile in Judge0.
- Do not use static placeholder names or generic templates such as solve(input), Object input, your_table, sample input, or "Write your code here" unless those exact terms are grounded in the source.
- validationConfigJson must include languagePolicy and supportedLanguages.
- validationConfigJson must include visibleTestCases.
- visibleTestCases must contain concrete source-grounded object test cases.
- Every visibleTestCases and hiddenTestCases entry must include name, input, and expectedOutput.
- Never output test cases as plain strings, markdown bullets, or compact "input -> output" text.

For CodeReading cards:
- validationConfigJson must include codeSnippet.
- validationConfigJson must include language.

For OutputPrediction cards:
- validationConfigJson must include codeSnippet.
- validationConfigJson must include expectedOutput.

For Debugging cards:
- validationConfigJson must include buggyCode.
- validationConfigJson must include visibleTestCases when possible.
- answer must explain the bug and the fix.

Required non-empty answer rules:
- Every flashcard must include a non-empty answer grounded in the source.
- For ShortAnswer and Conceptual, answer must be the canonical expected answer the learner should say.
- For CodeReading, answer must explain what the code does or why it behaves that way.
- For OutputPrediction, answer must state the exact output, return value, or final state.
- For Algorithm, answer must state the intended solution approach and key complexity expectations.
- For Debugging, answer must identify the bug and the concrete fix.
`.trim();

const previewProgrammingModePolicy = `
PROGRAMMING MODE IS ACTIVE.
At least 70% of cards must be Algorithm, CodeReading, OutputPrediction, or Debugging.
Use Conceptual or ShortAnswer only when the source cannot reasonably become code reading, output prediction, debugging, or algorithm practice.
Infer technicalLanguage from the source. Use "Generic" only when the language cannot be inferred.
Do not generate validation rules, schema hints, or grading config for preview cards.
Do not include option arrays, correctOptionIds, functionSignature, starterCodeByLanguage, codeSnippet, expectedOutput, buggyCode, test cases, or any other validation payload in preview output.
Set validationConfigJson to {} for every preview card.
`.trim();

const validationPathPolicy = `
Validation paths:
- Deterministic validation is used for answers that can be checked without AI.
- Do not submit deterministic answers directly to AI.
- Deterministic validation must use exact matching, normalized stdout comparison, compilation, or Judge0 test cases.
- Code submissions must first be compiled and run through Judge0.
- Visible and hidden test cases should be used where applicable.
- Submitted code must not be passed directly to AI.
- Conceptual validation is used for answers that require interpretation, explanation, or judgment.
- AI should only receive conceptual or prose answers, or code that has already passed the required deterministic Judge0 checks.
- Not everything should be submitted to AI.
- Only after code passes all required Judge0 checks may the system optionally send it to AI for an additional conceptual or rubric-based review.
`.trim();

const validationExamplesPolicy = `
Flashcard validation examples by itemType:
- Flashcard: prompt "What does HTTP stand for?", expected answer "HyperText Transfer Protocol", validation type deterministic, validation method normalized exact match or acceptedAnswerAliases, AI required no.
- Conceptual: prompt "Why is encapsulation useful?", expected ideas "hides internal state", "controls access", "protects invariants", validation type conceptual, validation method rubric-based AI review, AI required yes.
- Conceptual edge case: prompt "Why should the same array element not be used twice in this problem?", expected idea "the solution must use two distinct elements, not reuse the same element twice", validation type conceptual, validation method rubric-based AI review, AI required yes.
- ShortAnswer: prompt "What SQL clause filters grouped rows?", expected answer "HAVING", validation type deterministic, validation method case-insensitive exact match, AI required no.
- MultipleChoice: prompt "What is the time complexity of binary search?", expected answer correctOptionIds ["B"], validation type deterministic, validation method compare selected option ids with correctOptionIds, AI required no.
- CodeReading: prompt "Why does the two-sum algorithm check the map before inserting the current value?", expected idea "it prevents using the same element twice", validation type conceptual, validation method rubric-based AI review, AI required yes.
- OutputPrediction: prompt "Java snippet prints AV.", expected answer "AV", validation type deterministic, validation method normalize stdout and compare it with the expected output, AI required no.
- Algorithm: prompt "Implement a function that returns the maximum value in an array.", expected behavior "returns the largest value for all valid inputs", validation type deterministic first, validation method run the submitted code through Judge0 using visible and hidden test cases, AI required only after all Judge0 tests pass and only if rubric review is needed.
- Debugging code submission: prompt "Fix the loop condition i <= values.length so the code does not throw an out-of-bounds error.", expected fix "change i <= values.length to i < values.length", validation type deterministic for code submissions, validation method compile and run the submitted code through Judge0 using visible tests, AI required no unless the answer is prose-only.
- Debugging prose answer: prompt "Explain what is wrong with i <= values.length.", expected idea "the loop accesses an invalid index because the last valid index is values.length - 1", validation type conceptual, validation method rubric-based AI review instead of exact text matching, AI required yes.
`.trim();

export function buildGenerationPrompt(
  noteTitle: string,
  noteContent: string,
  flashcardCount: number,
  input: GenerateFlashcardsFromNoteInput,
  existingQuestions: string[] = [],
): string {
  const programmingFocused = isProgrammingFocusedSource(noteContent, input.technicalLanguage ?? "");
  const requestedItemTypes = input.itemTypes.length > 0
    ? input.itemTypes
    : programmingFocused
      ? ["Algorithm", "CodeReading", "OutputPrediction", "Debugging", "ShortAnswer", "Conceptual"]
      : ["Flashcard", "Conceptual", "ShortAnswer", "MultipleChoice"];
  const generationContext = {
    itemTypes: requestedItemTypes,
    learningDomain: input.learningDomain,
    cognitiveSkill: input.cognitiveSkill ?? null,
    technicalLanguage: input.technicalLanguage?.trim() || inferTechnicalLanguage(noteContent) || "",
    programContext: input.programContext ?? "",
  };

  return [
    "Generate grounded flashcards from the following note.",
    `Return exactly ${flashcardCount} flashcards.`,
    "Choose the best itemType for each card from the generation context. Use Flashcard only when no more specific subtype fits.",
    "Do not output CodeReading, Debugging, Algorithm, or OutputPrediction unless that exact itemType is present in generation context itemTypes.",
    programmingFocused
      ? "The source material is programming-focused. Lean strongly toward programming-oriented cards. Prefer turning real code examples, output traces, bug patterns, and implementation ideas into CodeReading, OutputPrediction, Algorithm, and Debugging cards instead of overusing generic conceptual cards."
      : "If the source is not clearly programming-focused, prefer conceptual and recall-oriented cards.",
    programmingFocused
      ? "When the note clearly supports it, most cards should be programming-oriented rather than plain conceptual recall."
      : "Use conceptual and recall cards unless the source clearly requires a technical code-oriented format.",
    ...(programmingFocused ? [programmingModePolicy] : []),
    validationPathPolicy,
    validationExamplesPolicy,
    "Infer learningDomain, cognitiveSkill, difficulty, technicalLanguage, tags, rubric (including criteria), and validationConfig from the source material when they are not explicit.",
    "Every flashcard must include a non-empty answer. Never leave answer blank.",
    "For ShortAnswer and Conceptual, answer must be the canonical expected answer. Do not move the real answer into conceptExplanation.",
    "For CodeReading, answer must explain the code behavior.",
    "For OutputPrediction, answer must contain the exact predicted output, return value, or final state.",
    "For Algorithm, answer must describe the correct approach and key complexity reasoning.",
    "For Debugging, answer must identify the bug and the fix.",
    'Return only JSON matching this shape: {"flashcards":[{"itemType":"Algorithm | CodeReading | OutputPrediction | Debugging | ShortAnswer | Conceptual","question":"...","answer":"...","conceptExplanation":"...","answeringGuidance":"...","difficulty":55,"cognitiveSkill":"Apply","learningDomain":"Programming","technicalLanguage":"InferredLanguage","acceptedAnswerAliases":[],"tagsJson":["programming"],"rubricJson":{"criteria":["grounded in source material"]},"validationConfigJson":{"languagePolicy":"source-language | any","supportedLanguages":["InferredLanguage"],"functionSignature":"source-grounded language-specific function signature","starterCodeByLanguage":{"InferredLanguage":"AI-generated Judge0-ready starter code with helpful comments and no solution"},"visibleTestCases":[{"name":"handles empty list","input":"[]","expectedOutput":"0"},{"name":"handles regular values","input":"[1,2,3]","expectedOutput":"3"}]}}]}.',
    "If you output MultipleChoice, validationConfigJson must include options and correctOptionIds.",
    "If you output CodeReading, validationConfigJson must include codeSnippet and language.",
    "If you output OutputPrediction, validationConfigJson must include codeSnippet and expectedOutput.",
    "If you output Algorithm, validationConfigJson must include languagePolicy, supportedLanguages, functionSignature, starterCodeByLanguage, and visibleTestCases.",
    "If you output Algorithm, visibleTestCases must contain concrete object test cases with name, input, and expectedOutput.",
    "If you output Debugging, validationConfigJson must include buggyCode and visibleTestCases with name, input, and expectedOutput.",
    "For Conceptual and ShortAnswer, rubricJson must include criteria.",
    "",
    ...(existingQuestions.length > 0
      ? [
          "Already generated questions to avoid duplicating:",
          JSON.stringify(existingQuestions),
          "",
        ]
      : []),
    "Generation context:",
    JSON.stringify(generationContext),
    "",
    `Note title: ${noteTitle}`,
    "Note content:",
    noteContent,
  ].join("\n");
}

export function buildPreviewPrompt(
  noteTitle: string,
  noteContent: string,
  flashcardCount: number,
  input: GenerateFlashcardsFromNoteInput,
  existingQuestions: string[] = [],
): string {
  const requestedItemTypes = inferPreviewItemTypes(noteContent, input.itemTypes);
  const programmingFocused = isProgrammingFocusedSource(noteContent, input.technicalLanguage ?? "");

  return [
    "Generate a fast flashcard preview from the following note.",
    `Return exactly ${flashcardCount} flashcards.`,
    "Optimize for speed and grounded study usefulness.",
    "Return only lightweight preview drafts.",
    "Choose itemType only from the provided generation context.",
    "Do not output item types that are not present in generation context itemTypes.",
    programmingFocused
      ? "Because the source material is programming-focused, make programming-oriented cards frequent. Prefer CodeReading, OutputPrediction, Algorithm, and Debugging whenever the note provides enough signal. Conceptual and ShortAnswer should be supporting types, not the majority."
      : "Prefer conceptual and recall-oriented cards unless the source clearly requires a more technical programming-oriented card.",
    programmingFocused
      ? "Use the strongest code-bearing examples from the note. Turn actual snippets, common mistakes, pass-by-value behavior, output traces, and implementation patterns into programming cards."
      : "Use conceptual and recall cards unless a code-oriented card is clearly better grounded.",
    ...(programmingFocused ? [previewProgrammingModePolicy] : []),
    validationPathPolicy,
    validationExamplesPolicy,
    "For preview drafts, keep metadata minimal. Prefer empty arrays/objects when extra metadata is unnecessary.",
    "Preview mode is content-only. Do not generate validation logic, schema-derived fields, or grader config.",
    "Set validationConfigJson to {} for every flashcard.",
    "Do not leave raw JSON fragments, pseudo-JSON, or schema notes inside question, answer, conceptExplanation, or answeringGuidance.",
    "Every preview draft must still include a non-empty answer. Never leave answer blank.",
    "For ShortAnswer and Conceptual, answer must be the canonical expected answer.",
    "For CodeReading, answer must explain the code behavior.",
    "For OutputPrediction, answer must contain the exact predicted output, return value, or final state.",
    "For Algorithm, answer must describe the intended solution approach and key complexity reasoning.",
    "For Debugging, answer must identify the bug and the fix.",
    "For Conceptual and ShortAnswer, rubricJson should include criteria only when easy to infer from the note; otherwise use an empty object.",
    'Return only JSON matching this shape: {"flashcards":[{"itemType":"Algorithm | CodeReading | OutputPrediction | Debugging | ShortAnswer | Conceptual","question":"...","answer":"...","conceptExplanation":"","answeringGuidance":"","acceptedAnswerAliases":[],"difficulty":55,"cognitiveSkill":"Apply","learningDomain":"Programming","technicalLanguage":"InferredLanguage","tagsJson":["programming"],"rubricJson":{},"validationConfigJson":{}}]}.',
    "",
    ...(existingQuestions.length > 0
      ? [
          "Already generated preview questions to avoid duplicating:",
          JSON.stringify(existingQuestions),
          "",
        ]
      : []),
    "Generation context:",
    JSON.stringify({
      itemTypes: requestedItemTypes,
      learningDomain: input.learningDomain,
      cognitiveSkill: input.cognitiveSkill ?? null,
      technicalLanguage: input.technicalLanguage?.trim() || inferTechnicalLanguage(noteContent) || "",
    }),
    "",
    `Note title: ${noteTitle}`,
    "Note content:",
    noteContent,
  ].join("\n");
}

export function buildFlashcardAnalyticsPrompt(
  flashcardSqid: string,
  submittedAnswer: string,
  evaluationContext: FlashcardAnalyticsEvaluationContextResponse,
  responseTimeMs: number,
  suppliedContext: SuppliedFlashcardContext,
): string {
  const question = suppliedContext.question ?? evaluationContext.question;
  const expectedAnswer = suppliedContext.expectedAnswer ?? evaluationContext.expectedAnswer;
  const conceptExplanation = suppliedContext.conceptExplanation ?? evaluationContext.conceptExplanation;
  const answeringGuidance = suppliedContext.answeringGuidance ?? evaluationContext.answeringGuidance;
  const acceptedAnswerAliases = suppliedContext.acceptedAnswerAliases?.length
    ? suppliedContext.acceptedAnswerAliases
    : evaluationContext.acceptedAnswerAliases;

  const compactContext = {
    flashcardSqid: evaluationContext.flashcardSqid,
    studentCourseSqid: evaluationContext.studentCourseSqid,
    itemType: suppliedContext.itemType ?? evaluationContext.itemType,
    question,
    expectedAnswer,
    conceptExplanation,
    answeringGuidance,
    acceptedAnswerAliases,
    cognitiveSkill: suppliedContext.cognitiveSkill ?? evaluationContext.cognitiveSkill ?? null,
    learningDomain: suppliedContext.learningDomain ?? evaluationContext.learningDomain ?? null,
    technicalLanguage: suppliedContext.technicalLanguage ?? evaluationContext.technicalLanguage,
    rubric: suppliedContext.rubricJson ?? evaluationContext.rubricJson,
    validationConfig: suppliedContext.validationConfigJson ?? evaluationContext.validationConfigJson,
    progress: {
      ...evaluationContext.progress,
      lastReviewedAt: evaluationContext.progress.lastReviewedAt?.toISOString() ?? null,
      nextReviewAt: evaluationContext.progress.nextReviewAt.toISOString(),
    },
    recentAnswers: evaluationContext.recentAnswers.slice(-3).map((answer) => ({
      submittedAnswer: answer.submittedAnswer,
      finalQualityScore: answer.finalQualityScore,
      wasAcceptedAsCorrect: answer.wasAcceptedAsCorrect,
      verdict: answer.verdict,
      answeredAt: answer.answeredAt.toISOString(),
    })),
    currentAnalytics: evaluationContext.currentAnalytics
      ? {
          masteryLevel: evaluationContext.currentAnalytics.masteryLevel,
          confidenceScore: evaluationContext.currentAnalytics.confidenceScore,
          retentionScore: evaluationContext.currentAnalytics.retentionScore,
          riskLevel: evaluationContext.currentAnalytics.riskLevel,
          nextReviewAt: evaluationContext.currentAnalytics.nextReviewAt.toISOString(),
          lastComputedAt: evaluationContext.currentAnalytics.lastComputedAt.toISOString(),
        }
      : null,
  };

  return [
    "Evaluate the student's submitted flashcard answer and produce the semantic evaluation, analytics snapshot, and frontend review payload.",
    "Return only JSON.",
    'Return exactly this shape: {"evaluation":{"verdict":"...","acceptedAsCorrect":true,"qualityScore":0,"feedbackSummary":"...","semanticRationale":"..."},"analytics":{"nextReviewAt":"...","easeFactor":0,"repetitionCount":0,"intervalDays":0,"lapseCount":0,"masteryLevel":"...","confidenceScore":0,"consistencyScore":0,"retentionScore":0,"riskLevel":"...","aiStatus":"...","aiInsight":"...","improvementSuggestion":"..."},"frontendReview":{"resultTone":"...","sentimentLabel":"...","verdict":"...","qualityScore":0.8,"isCorrect":true,"answerReview":"...","conceptExplanation":"...","missingPart":"...","misconception":"...","rubricFeedback":[{"criterion":"...","score":0.8,"feedback":"..."}],"technicalDiagnostics":{"language":"...","expectedBehavior":"...","actualBehavior":"...","issues":[]}}}',
    "Use only these evaluation verdicts: ExactCorrect, AbbreviationCorrect, ConceptuallyCorrect, Partial, Incorrect",
    "For frontendReview.verdict, use a user-facing label such as Correct, PartiallyCorrect, Incorrect, SyntaxIssue, BoundaryIssue, or Misconception.",
    "Use only these enum values:",
    "masteryLevel: New, Learning, Review, Mastered",
    "riskLevel: Low, Medium, High",
    "aiStatus: Pending, Completed, Failed, InsufficientSignal",
    "frontendReview.resultTone: correct, close, partial, incorrect",
    "frontendReview.sentimentLabel: a short natural-language sentiment grounded in the student's answer and outcome; do not use a fixed default",
    "Rules:",
    "- Use only the supplied submitted answer and evaluation context.",
    "- Deterministic validation must happen first for answers that can be checked without AI.",
    "- Do not submit deterministic answers directly to AI.",
    "- Submitted code must not be passed directly to AI.",
    "- Code submissions must first compile and run through Judge0, using visible and hidden test cases where applicable.",
    "- Only after code passes all required Judge0 checks may the system optionally ask AI for conceptual or rubric-based review.",
    "- Use conceptual validation only for prose, explanation, interpretation, or judgment-heavy answers.",
    "- acceptedAnswerAliases are strong grounding hints for semantic equivalence.",
    "- Accepted abbreviations and canonical short forms should be marked correct when they identify the same concept.",
    "- For coding, SQL, debugging, and algorithm items, use itemType, technicalLanguage, rubricJson, and validationConfigJson to grade partial correctness.",
    "- Do not claim code or SQL was executed unless validationConfigJson.executionResult is present.",
    "- If validationConfigJson.executionResult is present, treat it as the Judge0 sandbox result and make  primarily reflect compscoringile status, runtime status, visible test pass count, and hidden test pass count.",
    "- For hidden tests, mention only aggregate pass/fail counts and likely categories of missed edge cases; never invent or reveal hidden inputs or expected outputs.",
    "- For Algorithm and Debugging answers, explain compile errors, runtime errors, failed cases, edge cases, and language-specific issues in technicalDiagnostics. Make clear when diagnostics are semantic review rather than sandbox execution.",
    "- Use rubricFeedback to explain criterion-level strengths and gaps for technical items.",
    "- Use technicalDiagnostics for coding or SQL items; otherwise return null.",
    "- feedbackSummary and semanticRationale must reflect the semantic verdict, not exact string matching.",
    "- frontendReview.conceptExplanation must always be a non-empty learning insight after every answer, including correct answers.",
    "- frontendReview.answerReview should state the immediate result; frontendReview.conceptExplanation should explain the takeaway the student should remember next.",
    "- frontendReview.sentimentLabel must vary with the answer quality and should sound like a concise emotional or coaching signal for the student.",
    "- Keep confidenceScore, consistencyScore, and retentionScore within 0 to 100.",
    "- Keep easeFactor within 1.3 to 3.0.",
    "- Keep repetitionCount, intervalDays, and lapseCount as non-negative integers.",
    "- nextReviewAt must be an ISO 8601 UTC datetime string.",
    "- nextReviewAt must not be earlier than the latest recorded review.",
    "- Prefer the provided next review schedule unless the evidence strongly supports a different grounded value.",
    "- If the evidence is weak or sparse, use conservative values and set aiStatus to InsufficientSignal.",
    "- aiInsight must be one concise sentence.",
    "- improvementSuggestion must be one concrete sentence.",
    "- frontendReview is for UI only; it may explain the concept after the answer, but the persisted source of truth is evaluation + analytics.",
    "- Validation examples: OutputPrediction AV uses normalized stdout comparison with no AI; Algorithm max-value-in-array uses Judge0 visible and hidden tests first; Debugging code fix from i <= values.length to i < values.length uses compilation plus Judge0 visible tests first; Conceptual encapsulation and same-element-twice explanations use rubric-based AI review; Debugging prose about i <= values.length uses rubric-based AI review.",
    "",
    "Submitted answer:",
    JSON.stringify({
      flashcardSqid,
      submittedAnswer,
      responseTimeMs,
    }),
    "",
    "Evaluation context:",
    JSON.stringify(compactContext),
  ].join("\n");
}

export function buildFlashcardStudyCoachRecapPrompt(input: GenerateFlashcardStudyCoachRecapInput): string {
  const compactContext = {
    sessionSqid: input.sessionSqid,
    totalCards: input.totalCards,
    completedCards: input.completedCards,
    correctCount: input.correctCount,
    repeatCount: input.repeatCount,
    averageQualityScore: input.averageQualityScore,
    strongSignals: input.strongSignals.slice(0, 5),
    weakSignals: input.weakSignals.slice(0, 5),
    latestReview: input.latestReview ?? null,
  };

  return [
    "Create an AImpatin flashcard study coach recap for this completed session.",
    "Return only JSON.",
    'Return exactly this shape: {"headline":"...","improved":["..."],"stillWeak":["..."],"nextStep":"...","cheerLine":"...","quickPhrases":["Good job.","Nice progress.","Review this next."],"tone":"strong | mixed | weak","mascotEmotion":"happy | proud | thinking | sad | encouraging"}',
    "Rules:",
    "- Use only the supplied session summary.",
    "- Start from the evidence, not generic encouragement.",
    "- Say Good job naturally when the student completed cards.",
    "- If weakSignals is non-empty, stillWeak must mention the top weak signal.",
    "- If weakSignals is empty, stillWeak must say there is no major weak spot from this run.",
    "- nextStep must be one concrete action the student can do immediately.",
    "- Use mascotEmotion proud or happy for strong sessions.",
    "- Use mascotEmotion encouraging or thinking for mixed sessions.",
    "- Use mascotEmotion sad only for weak sessions, and keep it supportive rather than discouraging.",
    "- Keep each sentence short enough for a floating mascot bubble.",
    "",
    "Session summary:",
    JSON.stringify(compactContext),
  ].join("\n");
}
