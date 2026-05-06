# Remnote-Style Quiz Session Implementation Plan (API-Owned Flow)

## 1. Goal

Implement a Remnote-style quiz/flashcard session flow where learners can:

1. Continue latest in-progress session
2. Restart from the beginning
3. Submit answers with AI evaluation
4. Get Judge0-backed execution feedback for algorithm/code items

The **source of truth for session lifecycle must be `EducAIteAPI`**.  
`educAIteAI` acts as the evaluation/execution service.

---

## 2. Target Architecture

### Ownership

1. `EducAIteAPI` owns:
   - Session creation, resume, restart, abandon
   - Current item index/order/progress
   - Persistence of attempts and analytics snapshots
   - Start-flow decision (`continue` vs `create`)

2. `educAIteAI` owns:
   - AI semantic scoring and review text
   - Judge0 code execution orchestration
   - Technical diagnostics and rubric-level feedback

### Request Flow

1. Frontend -> `EducAIteAPI` session endpoints
2. `EducAIteAPI` decides session action and returns session state
3. On answer submit, `EducAIteAPI` calls `educAIteAI` (server-to-server) for AI review
4. `educAIteAI` optionally calls Judge0 for Algorithm/Debugging execution
5. `educAIteAI` returns evaluation payload
6. `EducAIteAPI` persists evaluated result and returns updated session + feedback

---

## 3. API Contract Plan

## 3.1 `EducAIteAPI` session start-flow contract

Add/extend endpoint (recommended shape):

`POST /api/flashcard-sessions/start-flow` (or existing flashcard session route namespace)

Request:

```json
{
  "scopeType": "Course | Overall",
  "studentCourseSqid": "optional",
  "documentSqid": "optional",
  "take": 30,
  "startMode": "auto | new"
}
```

Response:

```json
{
  "action": "continueAvailable | created",
  "activeSession": { "..." },
  "session": { "..." }
}
```

Rules:

1. `startMode=auto`: if active exists -> `continueAvailable`; else create -> `created`
2. `startMode=new`: always create new session (or restart policy based on existing domain rules)

## 3.2 `EducAIteAPI` answer submission payload (AI path)

Ensure AI submission DTO supports these fields (already partially present):

1. `answer` (text answer)
2. `itemType`, `question`, `expectedAnswer`, `conceptExplanation`, `answeringGuidance`
3. `acceptedAnswerAliases`, `cognitiveSkill`, `learningDomain`, `technicalLanguage`
4. `rubricJson`, `validationConfigJson`
5. For code/algorithm:
   - `language`
   - `runtimeVersion`
   - `starterCode`
   - `studentCode`

## 3.3 `educAIteAI` code execution response compatibility

Align DTOs between `EducAIteAPI` and `educAIteAI`:

1. `educAIteAI /api/smart-quiz/code/execute` currently returns scoring + nested `execution`
2. `EducAIteAPI ExecuteFlashcardCodeResponse` is flat execution-only

Choose one canonical response contract and map explicitly:

1. Option A (recommended): keep nested response in `educAIteAI`, add mapping client-side in `EducAIteAPI`
2. Option B: add a flat execution-only endpoint in `educAIteAI` for API consumption

---

## 4. Item-Type Behavior (V1 only)

Supported only:

1. `Flashcard`
2. `Conceptual`
3. `CodeReading`
4. `Debugging`
5. `Algorithm`
6. `OutputPrediction`
7. `MultipleChoice`
8. `ShortAnswer`

Excluded from this flow:

1. `Sql`
2. `FillInCode`
3. `Flowchart`

Evaluation behavior:

1. `MultipleChoice`: deterministic correctness first; AI explains rationale
2. `Flashcard/Conceptual/ShortAnswer`: AI semantic scoring + misconceptions + feedback
3. `CodeReading/OutputPrediction`: AI technical reasoning + expected vs actual explanation
4. `Algorithm/Debugging`: Judge0 execution first when runnable config is present, then AI summarizes failure/success

Hidden test policy:

1. Hidden tests are backend-only
2. Return only aggregate counts (passed/total)
3. Never expose hidden inputs/expected outputs

---

## 5. Judge0 Sandbox Integration

## 5.1 Runtime config (`educAIteAI`)

```env
JUDGE0_API_BASE_URL=http://localhost:2358
JUDGE0_API_KEY=<token>
JUDGE0_API_KEY_HEADER=X-Auth-Token
```

## 5.2 Execution process

1. Parse validation config (`visibleTestCases`, `hiddenTestCases`, `supportedLanguages`, `languagePolicy`, limits)
2. Resolve execution language from submission or source language policy
3. Submit per test case to Judge0
4. Aggregate compile/runtime/test outcomes
5. Inject execution result into AI evaluation context
6. Produce frontend-safe diagnostics

## 5.3 Failure handling

1. Judge0 unavailable -> return `sandboxUnavailable` and AI fallback explanation
2. Compile error -> mark failed compile with stderr/compile output summary
3. Runtime error/timeout/memory limit -> structured execution status + concise diagnostics

---

## 6. Implementation Phases

## Phase 1: `EducAIteAPI` session start-flow ownership

1. Add start-flow endpoint/response DTO
2. Implement active-session decision logic
3. Keep resume/restart endpoints unchanged

## Phase 2: Answer contract hardening

1. Extend request DTOs for algorithm fields
2. Ensure all fields are forwarded to AI task service
3. Preserve metadata in persistence path

## Phase 3: `educAIteAI` evaluation adapter

1. Accept both text-answer and code-answer submissions
2. Run Judge0 for `Algorithm` and runnable `Debugging`
3. Attach execution result into validation context for analytics prompt
4. Keep hidden tests private

## Phase 4: DTO alignment between repos

1. Fix `ExecuteFlashcardCodeResponse` mismatch
2. Add explicit mapping layer in `EducaiteAiCodeExecutionClient`
3. Validate non-breaking behavior for existing callers

## Phase 5: Frontend integration contract

1. Start screen uses start-flow endpoint
2. If `continueAvailable`: show `Continue` and `Restart`
3. If `created`: route to first item
4. Submit answers through AI-reviewed session endpoint

---

## 7. Acceptance Criteria

1. Starting quiz/flashcard checks active progress first, then offers continue/restart
2. Restart creates fresh attempt path per existing domain policy
3. Non-programming free-form answers receive AI semantic evaluation
4. Algorithm items execute against Judge0 and return compile/runtime/test feedback
5. Hidden tests remain private while still affecting result aggregates
6. Only V1 item types are surfaced and accepted
7. `EducAIteAPI` remains owner of all persisted session state

---

## 8. Non-Goals (Current Scope)

1. No new item types beyond V1 set
2. No full spaced-repetition model redesign
3. No unit/integration test additions in this task (per request)
