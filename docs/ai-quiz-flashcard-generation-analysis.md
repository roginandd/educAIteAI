# EducAIte AI Quiz/Flashcard Generation Analysis

## Current Behavior

- The flow is split across two services:
  - **EducAIteAPI (.NET)** handles orchestration, ownership checks, and persistence.
  - **educAIteAI (Node/ADK)** handles LLM prompting and structured response generation.
- There are two generation patterns:
  - **Location-first preview + save (current main path)**: generate drafts first, then save selected drafts to deck-owned flashcards.
  - **Legacy direct generate-and-persist path**: still exists in Node but targets a deprecated backend bulk endpoint.
- `QuizItemGenerationService` currently uses `DefaultQuizItemGenerationClient` (deterministic fallback-style generation), not an external LLM call.

## Supported Quiz Types

- The system supports:
  - `Flashcard`
  - `Conceptual`
  - `CodeReading`
  - `Debugging`
  - `Sql`
  - `Algorithm`
  - `OutputPrediction`
  - `FillInCode`
  - `MultipleChoice`
  - `ShortAnswer`
- AI generation is **not Flashcard-only**. Prompting and DTOs allow multiple item types.
- In fallback generation (`DefaultQuizItemGenerationClient`), `Flashcard` is filtered out and fallback type is `Conceptual`.

## Prompt Flow

1. `.NET` sends AI task requests through `EducaiteAiTaskService` to `IEducaiteAiAgentClient`.
2. `IEducaiteAiAgentClient` posts to `educAIteAI` `POST /api/agent/tasks` with intents such as:
   - `generate_flashcards_preview`
   - `generate_flashcards_from_note` (legacy)
3. In `educAIteAI`, `AgentService` dispatches to `FlashcardService`.
4. `FlashcardService` builds runtime prompt (`buildGenerationPrompt`) with:
   - note title/content
   - requested count
   - generation context (`itemTypes`, `learningDomain`, `cognitiveSkill`, `technicalLanguage`, `programContext`)
5. LLM instruction baseline comes from `src/agents/flashcards/instructions.ts`.

## Output Structure

- LLM output is validated against `flashcardGenerationOutputSchema`:

```json
{
  "flashcards": [
    {
      "itemType": "Conceptual",
      "question": "...",
      "answer": "...",
      "conceptExplanation": "...",
      "answeringGuidance": "...",
      "difficulty": 50,
      "cognitiveSkill": "Recall",
      "learningDomain": "Programming",
      "technicalLanguage": "C#",
      "acceptedAnswerAliases": [],
      "tagsJson": "[]",
      "rubricJson": "{}",
      "validationConfigJson": "{}"
    }
  ]
}
```

- `.NET` maps AI draft output into `GeneratedQuizItemDraftResponse` and persists selected drafts.

## Storage

- **Flashcards** are saved by `.NET` `FlashcardGenerationService.SaveGeneratedAsync` into `Flashcards`.
- **QuizItems** are saved by `.NET` `QuizItemGenerationService.SaveGeneratedAsync` into `QuizItems`.
- Persisted metadata includes:
  - `ItemType`
  - `RubricJson`
  - `ValidationConfigJson`
  - difficulty/cognitive/domain/language fields
- Flashcard provenance fields:
  - `SourceNoteId`
  - `SourceDocumentId`

## Test Case Support

- There is **no dedicated test-case table/entity** for generated quiz/flashcard items.
- Test-like details are only represented indirectly in:
  - `validationConfigJson`
  - `rubricJson`
- For code-related items, prompts ask for richer evaluation context, but schema does not enforce a strict test-case contract.
- Flashcard AI evaluation explicitly says not to execute code/SQL; it performs semantic grading.
- Separate smart-quiz code execution endpoint exists, but current execution supervisor is disabled fallback in this repo context.

## Behavior by QuizItemType (Current)

- **Flashcard**: generic recall card; used as fallback subtype when no specific subtype fits.
- **Conceptual**: concept explanation/reasoning prompt.
- **CodeReading**: asks what code/logic does; no guaranteed generated snippet contract.
- **Debugging**: asks for issue + fix rationale; no guaranteed corrected code artifact.
- **Sql**: SQL-focused reasoning; no guaranteed schema/sample rows/expected output artifact contract.
- **Algorithm**: steps/input-output/complexity framing; no enforced hidden-tests structure.
- **OutputPrediction**: asks expected output/result reasoning.
- **FillInCode**: asks for missing implementation completion.
- **MultipleChoice**: asks for best-choice style explanation.
- **ShortAnswer**: concise response based on source content.

## Issues / Gaps

- Legacy generation path still targets deprecated endpoint `/api/flashcard/bulk`.
- Two generation paradigms coexist (LLM draft flow vs deterministic fallback quiz item generator).
- No strict per-type schema for technical artifacts (e.g., SQL fixtures, hidden tests, constraints).
- Test-case semantics are opaque JSON strings, not first-class typed storage.
- SQL/code validation in flashcard evaluation is semantic-only.

## Recommended Improvements

- Retire legacy `generate_flashcards_from_note` persistence route and keep preview + explicit save path as single write flow.
- Define strict `validationConfigJson` contracts per `QuizItemType`.
- Introduce typed test-case models (or dedicated entity/table) if automated validation is required.
- Align naming/architecture so “AI generation” paths are truly AI-backed where intended.
- Add deterministic execution-backed validation for code/SQL paths where product requires objective grading.

## Key Files (Traceability)

### EducAIteAPI (.NET)

- `src/EducAIte.Api/Controllers/FlashcardController.cs`
- `src/EducAIte.Api/Controllers/DeckFlashcardController.cs`
- `src/EducAIte.Api/Controllers/QuizItemGenerationController.cs`
- `src/EducAIte.Application/Services/Implementation/FlashcardGenerationService.cs`
- `src/EducAIte.Application/Services/Implementation/QuizItemGenerationService.cs`
- `src/EducAIte.Application/Services/Implementation/DefaultQuizItemGenerationClient.cs`
- `src/EducAIte.Application/Services/Implementation/EducaiteAiTaskService.cs`
- `src/EducAIte.Application/Services/Implementation/EducaiteAiAgentClient.cs`
- `src/EducAIte.Domain/Entities/Flashcard.cs`
- `src/EducAIte.Domain/Entities/QuizItem.cs`
- `src/EducAIte.Domain/Enum/QuizItemType.cs`

### educAIteAI (Node)

- `src/features/agent/agent.service.ts`
- `src/agents/flashcards/instructions.ts`
- `src/agents/flashcards/agent.ts`
- `src/features/flashcards/flashcard.service.ts`
- `src/features/flashcards/flashcard.dto.ts`
- `src/features/flashcards/flashcard.response.ts`
