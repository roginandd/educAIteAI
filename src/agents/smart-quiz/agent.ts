import { InMemoryRunner, LlmAgent } from "@google/adk";

import { env } from "../../config/env";
import {
  codeFeedbackOutputSchema,
  flowchartEvaluationOutputSchema,
  generateSmartQuizItemsPreviewOutputSchema,
  retryVariantOutputSchema,
  smartQuizContextClassificationOutputSchema,
  smartQuizScoringOutputSchema,
} from "../../features/smart-quiz/smart-quiz.dto";
import {
  smartQuizAnswerScoringInstructions,
  smartQuizCodeFeedbackInstructions,
  smartQuizContextClassifierInstructions,
  smartQuizFlowchartEvaluatorInstructions,
  smartQuizItemGeneratorInstructions,
  smartQuizRetryVariantInstructions,
} from "./instructions";
import { toGeminiServingSchema } from "../../shared/ai/gemini-serving-schema";

const smartQuizModel = env.GOOGLE_GENAI_SMART_QUIZ_MODEL ?? env.GOOGLE_GENAI_MODEL;
const smartQuizGenerationModel = env.GOOGLE_GENAI_SMART_QUIZ_GENERATION_MODEL ?? env.GOOGLE_GENAI_FLASH_MODEL;

export function createSmartQuizContextClassifierRunner(): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: new LlmAgent({
      name: "smart_quiz_context_classifier_agent",
      description: "Infers smart quiz metadata from course and note content.",
      model: smartQuizGenerationModel,
      instruction: smartQuizContextClassifierInstructions,
      outputSchema: toGeminiServingSchema(smartQuizContextClassificationOutputSchema),
      outputKey: "smart_quiz_context_classification_output",
      generateContentConfig: {
        temperature: 0.1,
      },
    }),
  });
}

export function createSmartQuizItemGeneratorRunner(): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: new LlmAgent({
      name: "smart_quiz_item_generator_agent",
      description: "Generates previewable smart quiz item drafts.",
      model: smartQuizGenerationModel,
      instruction: smartQuizItemGeneratorInstructions,
      outputSchema: toGeminiServingSchema(generateSmartQuizItemsPreviewOutputSchema),
      outputKey: "smart_quiz_item_generation_output",
      generateContentConfig: {
        temperature: 0.2,
      },
    }),
  });
}

export function createSmartQuizAnswerScoringRunner(): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: new LlmAgent({
      name: "smart_quiz_answer_scoring_agent",
      description: "Scores semantic smart quiz answers.",
      model: smartQuizModel,
      instruction: smartQuizAnswerScoringInstructions,
      outputSchema: toGeminiServingSchema(smartQuizScoringOutputSchema),
      outputKey: "smart_quiz_answer_scoring_output",
      generateContentConfig: {
        temperature: 0.1,
      },
    }),
  });
}

export function createSmartQuizCodeFeedbackRunner(): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: new LlmAgent({
      name: "smart_quiz_code_feedback_agent",
      description: "Explains sandboxed coding quiz execution results.",
      model: smartQuizModel,
      instruction: smartQuizCodeFeedbackInstructions,
      outputSchema: toGeminiServingSchema(codeFeedbackOutputSchema),
      outputKey: "smart_quiz_code_feedback_output",
      generateContentConfig: {
        temperature: 0.1,
      },
    }),
  });
}

export function createSmartQuizFlowchartEvaluatorRunner(): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: new LlmAgent({
      name: "smart_quiz_flowchart_evaluator_agent",
      description: "Evaluates Mermaid flowchart quiz answers.",
      model: smartQuizModel,
      instruction: smartQuizFlowchartEvaluatorInstructions,
      outputSchema: toGeminiServingSchema(flowchartEvaluationOutputSchema),
      outputKey: "smart_quiz_flowchart_evaluation_output",
      generateContentConfig: {
        temperature: 0.1,
      },
    }),
  });
}

export function createSmartQuizRetryVariantRunner(): InMemoryRunner {
  return new InMemoryRunner({
    appName: env.GOOGLE_ADK_APP_NAME,
    agent: new LlmAgent({
      name: "smart_quiz_retry_variant_agent",
      description: "Generates adaptive retry variants for smart quiz items.",
      model: smartQuizModel,
      instruction: smartQuizRetryVariantInstructions,
      outputSchema: toGeminiServingSchema(retryVariantOutputSchema),
      outputKey: "smart_quiz_retry_variant_output",
      generateContentConfig: {
        temperature: 0.2,
      },
    }),
  });
}
