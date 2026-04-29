# Job Suggestions Integration Handoff

## Ownership

Frontend calls `EducAIteAPI` only. `EducAIteAPI` validates resume readiness, calls `educAIteAI`, filters weak results, persists suggested links, and returns saved match cards. `educAIteAI` searches public job pages and returns structured AI match suggestions.

## Frontend API

Use the `job-suggestions` endpoints for new UI work:

| Action | Method | Endpoint |
|---|---|---|
| Search and persist suggestions | `POST` | `/api/resume/{resumeSqid}/ai/job-suggestions/search` |
| List persisted suggestions | `GET` | `/api/resume/{resumeSqid}/job-suggestions` |

Compatibility aliases still exist:

| Action | Method | Endpoint |
|---|---|---|
| Search company recommendations | `POST` | `/api/resume/{resumeSqid}/ai/company-recommendations/search` |
| List company recommendations | `GET` | `/api/resume/{resumeSqid}/company-recommendations` |

## Request And Response

```ts
type SearchJobSuggestionsRequest = {
  targetRole?: string | null;
  location?: string | null;
  workSetup?: string[];
  employmentType?: string[];
  maxResults?: number;
};

type JobSuggestionSearchResponse = {
  resumeSqid: string;
  targetRole: string;
  results: JobSuggestionCard[];
  searchedAt: string;
};

type JobSuggestionCard = {
  recommendationSqid: string | null;
  companyName: string;
  roleTitle: string;
  matchScore: number;
  matchLevel: string;
  whyItMatches: string;
  requiredSkills: string[];
  studentMatchingSkills: string[];
  missingSkills: string[];
  location?: string | null;
  workSetup: string;
  employmentType?: string | null;
  sourceUrl: string;
  sourceDomain?: string;
  recommendedAction: string;
  status?: string | null;
  savedAt?: string | null;
  searchedAt: string;
};
```

Recommended search body:

```ts
const body: SearchJobSuggestionsRequest = {
  targetRole: selectedTargetRole ?? null,
  location: selectedLocation ?? null,
  workSetup: selectedWorkSetup,
  employmentType: selectedEmploymentTypes,
  maxResults: 10,
};
```

`targetRole` is optional; resume evidence is the primary matching source.

## EducAIteAPI Behavior

`EducAIteAPI` currently:
- loads the resume by `resumeSqid`
- validates recommendation readiness
- calls `educAIteAI` with intent `search_resume_job_suggestions`
- filters out results with `matchScore < 50`
- filters out results without `sourceUrl`
- persists links in the legacy `CompanyRecommendation` model
- dedupes by `SourceUrl`
- updates existing matching rows
- deletes stale `Status = Suggested` rows absent from the latest search
- returns persisted rich match cards

Relevant `EducAIteAPI` files:
- `EducAIteSolution/src/EducAIte.Api/Controllers/ResumeController.cs`
- `EducAIteSolution/src/EducAIte.Application/Services/Implementation/ResumeStudentModeService.cs`
- `EducAIteSolution/src/EducAIte.Application/Services/Implementation/EducaiteAiTaskService.cs`
- `EducAIteSolution/src/EducAIte.Application/DTOs/Response/ResumeStudentModeResponses.cs`
- `EducAIteSolution/src/EducAIte.Infrastructure/Repositories/ResumeStudentModeRepository.cs`

API-side build verification:

```powershell
dotnet build EducAIteSolution.csproj -p:UseAppHost=false -o ..\.codex-build-check-app
```

## educAIteAI Task

`EducAIteAPI` calls `educAIteAI` through the task endpoint with:

```ts
type EducaiteAiTaskRequest = {
  intent: "search_resume_job_suggestions";
  payload: {
    resumeSqid: string;
    targetRole?: string | null;
    location?: string | null;
    workSetup: string[];
    employmentType: string[];
    maxResults: number;
  };
};
```

Legacy intent `recommend_resume_job_opportunities` remains compatible and returns the same result shape. `educAIteAI` returns AI-generated match cards; `EducAIteAPI` owns persistence fields such as `recommendationSqid`, `status`, and `savedAt`.

## Frontend Flow And UI

1. Open the resume student-mode job suggestions panel.
2. Call `GET /api/resume/{resumeSqid}/job-suggestions`.
3. Show existing persisted suggestions if present.
4. On `Search job suggestions`, call `POST /api/resume/{resumeSqid}/ai/job-suggestions/search`.
5. Replace the list with the returned persisted suggestions.
6. Open `sourceUrl` in a new tab with `rel="noopener noreferrer"`.

Use match cards. Show role title, company, score/level, location, work setup, employment type, concise match reason, matching skills, missing skills, source domain, and a `View job` link.

Empty/error states:
- no saved suggestions: show a search CTA
- no search results: suggest broadening filters
- validation error: ask the user to complete required resume sections
- AI/search failure: show retry

## Constraints

- Do not implement auto-apply.
- Do not automate browsers.
- Do not ask for job board credentials.
- Do not show login-only links as primary recommendations.
- Treat `sourceUrl` as an external public link.
