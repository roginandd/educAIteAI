# Resume Tailoring AI

## Overview

This implementation adds a truthful resume tailoring pipeline to `educAIteAI`.

Primary entrypoints:
- `POST /api/resumes/:resumeSqid/tailor`
- `POST /api/agent/tasks` with intent `tailor_resume_for_job`

Primary files:
- `src/features/resumes/resume.service.ts`
- `src/features/resumes/resume.dto.ts`
- `src/features/resumes/resume.response.ts`
- `src/agents/resumes/agent.ts`
- `src/agents/resumes/instructions.ts`
- `src/shared/ai/structured-agent-runner.service.ts`

## Flow

### 1. Source Resume Load

The AI flow loads the authoritative resume review payload from:

```text
GET /api/Resume/{resumeSqid}/review
```

This is the actual rich resume payload currently available from `EducAIteAPI`.

### 2. Job Understanding

`resume_job_profile_agent` extracts:
- target role
- target tone
- recruiter signals
- core requirements with priorities
- focus areas
- downplay areas

Output key:

```text
resume_job_profile_output
```

### 3. Resume Tailoring

`resume_tailoring_agent` receives:
- source resume payload
- raw job input
- normalized job profile

It returns:
- alignment score and matched/gap analysis
- tailored headline
- tailored professional summary
- tailored key skills
- tailored experience bullets
- tailored education highlights
- tailored certification highlights
- tailoring decisions
- evidence map

Output key:

```text
resume_tailoring_output
```

## Truthfulness Guard

This implementation does not trust the model output directly.

Server-side validation checks:
- every tailored statement has an `evidenceMap` entry
- every `evidenceMap` item points to a real tailored `statementId`
- every source reference points to a valid resume section
- every source quote must be grounded in the actual source resume payload

If validation fails:
1. the system retries once with explicit violation feedback
2. if the second attempt still fails, the API returns:

```text
422 TAILORING_VALIDATION_FAILED
```

## Response Shape

The tailoring response returns:
- `resume`
- `jobProfile`
- `alignment`
- `tailoredResume`
- `tailoringDecisions`
- `evidenceMap`
- `metadata`

`metadata` includes:
- `model`
- `generatedAt`
- `retryCount`

## Shared AI Execution Refactor

The resume flow now uses a shared utility:

```text
src/shared/ai/structured-agent-runner.service.ts
```

This utility centralizes:
- ADK `runEphemeral` execution
- final response detection
- structured output extraction by `outputKey`
- JSON validation
- schema validation
- upstream runner error mapping

Current usage:
- resume analysis
- resume job profiling
- resume tailoring

This establishes the reusable pattern for future AI refactors in other modules.

## Config

New environment variable:

```text
GOOGLE_GENAI_RESUME_MODEL
```

Fallback/default:
- defaults to the existing general model when not explicitly set

`.env.example` was updated accordingly.

## Supported Constraints

The implementation enforces the product constraints:
- no fake experience
- no fake skills
- no fabricated metrics or tools
- no unnatural over-optimization

The output is intended to keep the same person, but present them more clearly for a specific role.
