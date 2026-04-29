# Resume Upload/Create Flow Frontend Integration

This document explains the correct frontend sequence for creating a resume and reaching a useful preview state.

Important: the current API does not have a single "upload resume and preview everything" endpoint. `POST /api/Resume` only creates the resume shell. If the frontend only calls create/upload and then opens preview, the preview will keep showing incomplete or empty sections because the required resume data has not been saved yet.

## Correct Endpoint Sequence

Use this sequence for the normal resume builder flow.

```txt
1. Create resume shell
2. List templates
3. Select template
4. Save personal details
5. Save education rows
6. Save employment rows
7. Save summary
8. Attach certificates if needed
9. Get review payload
10. Render preview
11. Save version when user confirms
```

The preview screen should call `GET /api/Resume/{resumeSqid}/review`, not rely only on the response from `POST /api/Resume`.

## Auth Requirement

All `/api/Resume` endpoints require:

```http
Authorization: Bearer {token}
```

## 1. Create Resume Shell

Use this when the user clicks `Create resume`, `Start resume`, or finishes choosing an initial resume title.

```http
POST http://localhost:5126/api/Resume
Content-Type: application/json
Authorization: Bearer {token}
```

Request DTO:

```ts
type CreateResumeRequest = {
  title: string;
};
```

Response DTO:

```ts
type ResumeResponse = {
  resumeSqid: string;
  title: string;
  status: string;
  currentTemplateSqid?: string | null;
  createdAt: string;
  updatedAt: string;
};
```

Frontend rule:

- Store `resumeSqid`.
- Do not open final preview yet unless you also call the review endpoint and handle missing fields.

## 2. List Resume Templates

Use this before template selection, or on the template picker screen.

```http
GET http://localhost:5126/api/resume-templates?page=1&pageSize=20
Authorization: Bearer {token}
```

Query DTO:

```ts
type ListResumeTemplatesQueryRequest = {
  page?: number;
  pageSize?: number;
  includeInactive?: boolean;
};
```

Response DTO:

```ts
type ResumeTemplateResponse = {
  templateSqid: string;
  templateCode: string;
  name: string;
  version: number;
  isActive: boolean;
  renderConfigJson: string;
};

type ResumeTemplateListResponse = {
  page: number;
  pageSize: number;
  totalCount: number;
  items: ResumeTemplateResponse[];
};
```

## 3. Select Template

Use this when the user picks a resume design.

```http
PUT http://localhost:5126/api/Resume/{resumeSqid}/template
Content-Type: application/json
Authorization: Bearer {token}
```

Request DTO:

```ts
type SelectResumeTemplateRequest = {
  templateSqid: string;
};
```

Response DTO:

```ts
type ResumeTemplateSelectionResponse = {
  resumeSqid: string;
  templateSqid: string;
  templateCode: string;
  templateVersion: number;
  updatedAt: string;
};
```

## 4. Save Personal Details

Use this when the user completes the contact/details step.

```http
PUT http://localhost:5126/api/Resume/{resumeSqid}/personal-details
Content-Type: application/json
Authorization: Bearer {token}
```

Request DTO:

```ts
type UpsertResumePersonalDetailsRequest = {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  email: string;
  phoneNumber: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  provinceState: string;
  country: string;
  postalCode: string;
  linkedInUrl?: string | null;
  portfolioUrl?: string | null;
};
```

Response DTO:

```ts
type ResumePersonalDetailsResponse = UpsertResumePersonalDetailsRequest & {
  resumeSqid: string;
  updatedAt: string;
};
```

## 5. Add Education

Use this when the user adds each education item.

```http
POST http://localhost:5126/api/Resume/{resumeSqid}/education
Content-Type: application/json
Authorization: Bearer {token}
```

Request DTO:

```ts
type CreateResumeEducationRequest = {
  schoolName: string;
  degree: string;
  fieldOfStudy?: string | null;
  startDate: string;
  endDate?: string | null;
  isCurrent: boolean;
  description?: string | null;
  orderIndex: number;
};
```

Response DTO:

```ts
type ResumeEducationResponse = CreateResumeEducationRequest & {
  educationSqid: string;
  resumeSqid: string;
  updatedAt: string;
};
```

Update education:

```http
PUT /api/Resume/{resumeSqid}/education/{educationSqid}
```

Delete education:

```http
DELETE /api/Resume/{resumeSqid}/education/{educationSqid}
```

## 6. Add Employment History

Use this when the user adds each work experience item.

```http
POST http://localhost:5126/api/Resume/{resumeSqid}/employment-history
Content-Type: application/json
Authorization: Bearer {token}
```

Request DTO:

```ts
type CreateResumeEmploymentHistoryRequest = {
  companyName: string;
  positionTitle: string;
  location?: string | null;
  startDate: string;
  endDate?: string | null;
  isCurrent: boolean;
  responsibilities?: string[] | null;
  orderIndex: number;
};
```

Response DTO:

```ts
type ResumeEmploymentHistoryResponse = {
  employmentSqid: string;
  resumeSqid: string;
  companyName: string;
  positionTitle: string;
  location?: string | null;
  startDate: string;
  endDate?: string | null;
  isCurrent: boolean;
  responsibilities: string[];
  orderIndex: number;
  updatedAt: string;
};
```

Update employment:

```http
PUT /api/Resume/{resumeSqid}/employment-history/{employmentSqid}
```

Delete employment:

```http
DELETE /api/Resume/{resumeSqid}/employment-history/{employmentSqid}
```

## 7. Save Summary

Use this when the user enters or accepts a professional summary.

```http
PUT http://localhost:5126/api/Resume/{resumeSqid}/summary
Content-Type: application/json
Authorization: Bearer {token}
```

Request DTO:

```ts
type UpdateResumeSummaryRequest = {
  summaryText: string;
};
```

Response DTO:

```ts
type ResumeSummaryResponse = {
  resumeSqid: string;
  summaryText: string;
  updatedAt: string;
};
```

## 8. Optional: Rewrite Summary With AI

Use this when the user clicks an AI rewrite action for an existing summary draft.

```http
POST http://localhost:5126/api/Resume/{resumeSqid}/ai/summary/rewrite
Content-Type: application/json
Authorization: Bearer {token}
```

Request DTO:

```ts
type RewriteResumeSummaryAiRequest = {
  summaryText: string;
  tone?: string | null;
  targetLength?: number | null;
};
```

Response DTO:

```ts
type RewriteResumeSummaryAiResponse = {
  resumeSqid: string;
  originalSummary: string;
  rewrittenSummary: string;
  model: string;
  generatedAt: string;
  safetyFlags: string[];
};
```

Frontend rule:

- Show the rewritten summary as a suggestion.
- User must click `Apply`.
- After apply, call `PUT /api/Resume/{resumeSqid}/summary`.

## 9. Optional: Attach Certificates

Use this after certificate upload/review or when the user chooses certificates for this resume.

```http
PUT http://localhost:5126/api/Resume/{resumeSqid}/certificates
Content-Type: application/json
Authorization: Bearer {token}
```

Request DTO:

```ts
type ReplaceResumeCertificatesRequest = {
  certificationSqids: string[];
};
```

Response DTO:

```ts
type ResumeCertificateItemResponse = {
  certificationSqid: string;
  name: string;
  issuer: string;
  issuedAt?: string | null;
  schoolYear?: string | null;
  gradeOrScore?: string | null;
  description?: string | null;
  file?: {
    fileName: string;
    fileMimeType: string;
    fileSizeBytes: number;
    fileUrl: string;
  } | null;
};

type ResumeCertificatesResponse = {
  resumeSqid: string;
  certificates: ResumeCertificateItemResponse[];
  updatedAt: string;
};
```

## 10. Preview: Get Review Payload

Use this when the UI shows the resume preview.

```http
GET http://localhost:5126/api/Resume/{resumeSqid}/review
Authorization: Bearer {token}
```

Response DTO:

```ts
type ResumeReviewResponse = {
  resumeSqid: string;
  title: string;
  template?: ResumeTemplateResponse | null;
  personalDetails?: ResumePersonalDetailsResponse | null;
  education: ResumeEducationResponse[];
  employmentHistory: ResumeEmploymentHistoryResponse[];
  summary?: ResumeSummaryResponse | null;
  certificates: ResumeCertificateItemResponse[];
  completeness: {
    isComplete: boolean;
    missingRequiredFields: string[];
  };
};
```

Frontend rule:

- If `completeness.isComplete === false`, preview should show missing sections, not pretend the resume is final.
- If template is missing, route user to template selection.
- If personal details or summary are missing, route user to those steps.

## 11. Optional: Tailor Resume With AI

Use this only after the resume has enough saved data to tailor.

```http
POST http://localhost:5126/api/Resume/{resumeSqid}/ai/tailor
Content-Type: application/json
Authorization: Bearer {token}
```

Request DTO:

```ts
type TailorResumeForJobAiRequest = {
  jobTitle: string;
  companyName?: string | null;
  jobDescription: string;
  includeExperiences?: boolean;
  includeEducations?: boolean;
  includeSkills?: boolean;
  includeProjects?: boolean;
  includeCertifications?: boolean;
};
```

Response DTO summary:

```ts
type TailorResumeForJobAiResponse = {
  resume: unknown;
  jobProfile: {
    targetRole: string;
    companyName?: string | null;
    targetTone: string;
    recruiterSignals: string[];
    coreRequirements: {
      requirement: string;
      priority: string;
      rationale: string;
      keywords: string[];
    }[];
    focusAreas: string[];
    downplayAreas: string[];
  };
  alignment: {
    score: number;
    matched: {
      requirement: string;
      evidence: string;
      priority: string;
    }[];
    gaps: {
      requirement: string;
      reason: string;
      priority: string;
    }[];
    priorityFocus: string[];
  };
  tailoredResume: {
    headline: TailoredStatement;
    professionalSummary: TailoredStatement[];
    keySkills: TailoredStatement[];
    experiences: unknown[];
    education: unknown[];
    certifications: unknown[];
  };
  tailoringDecisions: {
    highlighted: string[];
    downplayed: string[];
    noiseReduced: string[];
  };
  evidenceMap: unknown[];
  metadata: {
    model: string;
    generatedAt: string;
    retryCount: number;
  };
};

type TailoredStatement = {
  statementId: string;
  text: string;
};
```

Frontend rule:

- Treat AI tailoring output as a draft/preview.
- Do not overwrite saved resume sections automatically.
- User must explicitly apply selected AI suggestions.

## 12. Save Resume Version

Use this when the user clicks `Save version`, `Finish`, or `Save snapshot`.

```http
POST http://localhost:5126/api/Resume/{resumeSqid}/save
Content-Type: application/json
Authorization: Bearer {token}
```

Request DTO:

```ts
type SaveResumeVersionRequest = {
  saveNote?: string | null;
};
```

Response DTO:

```ts
type ResumeVersionResponse = {
  resumeVersionSqid: string;
  resumeSqid: string;
  versionNumber: number;
  savedAt: string;
  saveNote?: string | null;
  snapshotHash: string;
};
```

## Why The Current Flow Always Shows Preview

If the frontend only calls:

```http
POST /api/Resume
```

then the backend only creates:

```ts
{
  resumeSqid: string;
  title: string;
  status: string;
}
```

That response is not the full resume preview.

The preview data comes from:

```http
GET /api/Resume/{resumeSqid}/review
```

The review payload becomes useful only after these calls have saved data:

```txt
PUT /api/Resume/{resumeSqid}/template
PUT /api/Resume/{resumeSqid}/personal-details
POST /api/Resume/{resumeSqid}/education
POST /api/Resume/{resumeSqid}/employment-history
PUT /api/Resume/{resumeSqid}/summary
PUT /api/Resume/{resumeSqid}/certificates
```

## Recommended Frontend State Machine

```ts
type ResumeBuilderStep =
  | "create"
  | "template"
  | "personalDetails"
  | "education"
  | "employment"
  | "summary"
  | "certificates"
  | "review"
  | "saved";
```

Recommended routing:

```txt
No resumeSqid
  -> Create screen

resumeSqid exists but no template
  -> Template screen

review.completeness.missingRequiredFields includes personalDetails
  -> Personal details screen

review.completeness.missingRequiredFields includes summary
  -> Summary screen

review.completeness.isComplete is true
  -> Review/preview screen
```

## Recommended shadcn Interaction

Use a multi-step builder layout.

Recommended components:

| Need | shadcn component |
|---|---|
| Step navigation | `Tabs` or `Sidebar` |
| Form layout | `FieldGroup`, `Field`, `Input`, `Textarea` |
| Date/current controls | `Input`, `Checkbox`, `Switch` |
| Add education/employment | `Dialog` or inline form |
| Preview panel | full-width preview area, not a modal by default |
| Missing fields | `Alert` |
| Save progress | `Spinner`, disabled `Button` |
| Empty education/employment | `Empty` |
| Save success | `toast()` from `sonner` |

Preview should be a dedicated step or side-by-side panel. Do not show the preview as the only screen immediately after create unless the UI clearly marks missing fields.

## Minimal Working Flow

If you want the shortest path to a real preview:

```txt
POST /api/Resume
GET /api/resume-templates
PUT /api/Resume/{resumeSqid}/template
PUT /api/Resume/{resumeSqid}/personal-details
PUT /api/Resume/{resumeSqid}/summary
GET /api/Resume/{resumeSqid}/review
```

Education, employment, and certificates can be added before final save, but the frontend should not depend on only `POST /api/Resume` for preview data.
  