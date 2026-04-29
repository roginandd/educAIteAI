# Resume Certificate Feature Frontend Integration

This document merges the new certificate backend API flow from `EducAIteAPI` with the ADK parsing and suggestion flow from `EducAIteAI`.

The frontend should treat `EducAIteAPI` as the only public source of truth. `EducAIteAI` endpoints are internal backend-to-AI endpoints and should not be called directly from the student UI.

## End-To-End Flow

1. Student uploads certificate files through `EducAIteAPI`.
2. Backend validates file type, size, and upload count.
3. Backend stores files and creates certificate records.
4. Backend starts a processing job.
5. Backend calls `EducAIteAI` internally for parsing.
6. AI returns structured fields, confidence scores, quality checks, and status recommendation.
7. Backend validates and persists AI output.
8. Frontend shows parsed fields for user review.
9. Student edits or confirms certificate details.
10. Student attaches selected certificates to a resume.
11. Resume review/export uses backend review payload.

## Public Frontend API Calls

Use these `EducAIteAPI` endpoints from the frontend.

| UI Action | Method | Endpoint |
|---|---|---|
| Upload certificates | `POST` | `/api/certificates/upload` |
| List certificates | `GET` | `/api/certificates` |
| Get certificate detail | `GET` | `/api/certificates/{certificationSqid}` |
| Update certificate fields | `PUT` | `/api/certificates/{certificationSqid}` |
| Delete certificate | `DELETE` | `/api/certificates/{certificationSqid}` |
| Start parsing | `POST` | `/api/certificates/{certificationSqid}/process` |
| Start batch parsing | `POST` | `/api/certificates/process-batch` |
| Get processing status | `GET` | `/api/certificates/{certificationSqid}/processing-status` |
| Confirm reviewed data | `POST` | `/api/certificates/{certificationSqid}/confirm` |
| Replace resume certificates | `PUT` | `/api/Resume/{resumeSqid}/certificates` |
| School-year achievements | `GET` | `/api/Resume/{resumeSqid}/achievements/school-year` |
| Lifetime achievements | `GET` | `/api/Resume/{resumeSqid}/achievements/lifetime` |
| Certificate suggestions | `GET` or `POST` | `/api/Resume/{resumeSqid}/certificates/suggestions` |
| Resume review payload | `GET` | `/api/Resume/{resumeSqid}/review` |

## Internal AI Calls

These are backend-only calls from `EducAIteAPI` to `EducAIteAI`.

| Backend Action | Method | Endpoint |
|---|---|---|
| Parse certificate file | `POST` | `/internal/adk/certificates/parse` |
| Rank certificates for job | `POST` | `/internal/adk/certificates/suggest` |

Do not expose these endpoints in frontend code, browser network clients, or public environment variables.

## DTO Reference

Use these shapes when building frontend API clients and UI state. Date strings are ISO-style strings from the backend unless noted.

```ts
type CertificateStatus =
  | "uploaded"
  | "pending_processing"
  | "processing"
  | "parsed"
  | "needs_review"
  | "verified_by_user"
  | "failed";

type CertificateProcessingJobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

type CertificateFileDto = {
  fileName: string;
  fileMimeType: "image/jpeg" | "image/png" | "application/pdf";
  fileSizeBytes: number;
  fileUrl: string;
};

type CertificateFieldConfidenceDto = {
  fieldName: string;
  value?: string | null;
  confidence: number;
  needsReview: boolean;
};
```

### Upload Certificates

`POST /api/certificates/upload`

Request content type: `multipart/form-data`.

```ts
type UploadCertificatesFormData = {
  files: File[];
  source?: "resume_builder" | string;
  autoProcess?: boolean;
};

type UploadCertificateItemDto = {
  certificationSqid: string;
  fileName: string;
  fileMimeType: "image/jpeg" | "image/png" | "application/pdf";
  fileSizeBytes: number;
  status: CertificateStatus;
  fileUrl: string;
  createdAt: string;
};

type UploadCertificateErrorDto = {
  fileName?: string;
  message: string;
};

type UploadCertificatesResponse = {
  uploadedCount: number;
  failedCount: number;
  items: UploadCertificateItemDto[];
  errors: UploadCertificateErrorDto[];
};
```

### Certificate List And Detail

`GET /api/certificates`

```ts
type CertificateListQuery = {
  page?: number;
  pageSize?: number;
  status?: CertificateStatus;
  schoolYear?: string;
  search?: string;
};

type CertificateListItemDto = {
  certificationSqid: string;
  achievementName?: string | null;
  institution?: string | null;
  issuedDate?: string | null;
  schoolYear?: string | null;
  status: CertificateStatus;
  overallConfidence?: number | null;
};

type CertificateListResponse = {
  page: number;
  pageSize: number;
  totalCount: number;
  items: CertificateListItemDto[];
};
```

`GET /api/certificates/{certificationSqid}`

```ts
type CertificateDetailResponse = {
  certificationSqid: string;
  achievementName?: string | null;
  institution?: string | null;
  issuedDate?: string | null;
  schoolYear?: string | null;
  gradeOrScore?: string | null;
  description?: string | null;
  tags: string[];
  file: CertificateFileDto;
  status: CertificateStatus;
  overallConfidence?: number | null;
  fieldConfidence: CertificateFieldConfidenceDto[];
  createdAt: string;
  updatedAt: string;
};
```

### Update, Confirm, Delete

`PUT /api/certificates/{certificationSqid}`

```ts
type UpdateCertificateRequest = {
  achievementName?: string | null;
  institution?: string | null;
  issuedDate?: string | null;
  schoolYear?: string | null;
  gradeOrScore?: string | null;
  description?: string | null;
  tags?: string[];
};

type UpdateCertificateResponse = CertificateDetailResponse;
```

`POST /api/certificates/{certificationSqid}/confirm`

```ts
type ConfirmCertificateRequest = {
  confirmed: boolean;
  reviewNote?: string | null;
};

type ConfirmCertificateResponse = CertificateDetailResponse;
```

`DELETE /api/certificates/{certificationSqid}`

```ts
type DeleteCertificateResponse = {
  certificationSqid: string;
  deleted: boolean;
};
```

### Processing

`POST /api/certificates/{certificationSqid}/process`

```ts
type StartCertificateProcessingResponse = {
  certificationSqid: string;
  jobSqid: string;
  status: CertificateProcessingJobStatus;
  startedAt?: string | null;
};
```

`POST /api/certificates/process-batch`

```ts
type BatchProcessCertificatesRequest = {
  certificationSqids: string[];
};

type BatchProcessCertificateItemDto = {
  certificationSqid: string;
  jobSqid?: string | null;
  status: CertificateProcessingJobStatus;
  errorMessage?: string | null;
};

type BatchProcessCertificatesResponse = {
  requestedCount: number;
  startedCount: number;
  failedCount: number;
  items: BatchProcessCertificateItemDto[];
};
```

`GET /api/certificates/{certificationSqid}/processing-status`

```ts
type CertificateProcessingStatusResponse = {
  certificationSqid: string;
  jobSqid?: string | null;
  status: CertificateProcessingJobStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  errorMessage?: string | null;
  retryCount: number;
};
```

### Resume Certificate Selection

`PUT /api/Resume/{resumeSqid}/certificates`

```ts
type ReplaceResumeCertificatesRequest = {
  certificationSqids: string[];
};

type ResumeCertificateItemDto = {
  certificationSqid: string;
  achievementName: string;
  institution: string;
  issuedDate?: string | null;
  schoolYear?: string | null;
  gradeOrScore?: string | null;
  description?: string | null;
  tags?: string[];
};

type ReplaceResumeCertificatesResponse = {
  resumeSqid: string;
  certificates: ResumeCertificateItemDto[];
};
```

### Achievement Views

`GET /api/Resume/{resumeSqid}/achievements/school-year`

```ts
type AchievementSchoolYearGroupDto = {
  schoolYear: string;
  achievements: ResumeCertificateItemDto[];
};

type AchievementGroupedBySchoolYearResponse = {
  resumeSqid: string;
  groups: AchievementSchoolYearGroupDto[];
};
```

`GET /api/Resume/{resumeSqid}/achievements/lifetime`

```ts
type LifetimeAchievementResponse = {
  resumeSqid: string;
  totalCount: number;
  items: ResumeCertificateItemDto[];
};
```

### Certificate Suggestions

`GET /api/Resume/{resumeSqid}/certificates/suggestions?jobTitle=Backend%20Engineer`

`POST /api/Resume/{resumeSqid}/certificates/suggestions`

```ts
type CertificateSuggestionRequest = {
  jobTitle: string;
  companyName?: string | null;
  jobDescription?: string | null;
  maxSuggestions?: number;
};

type CertificateSuggestionJobProfileDto = {
  jobTitle?: string;
  targetRole?: string;
  companyName?: string | null;
  detectedSignals: string[];
};

type CertificateSuggestionItemDto = {
  certificationSqid: string;
  achievementName: string;
  institution: string;
  matchScore: number;
  reason: string;
  matchedSignals: string[];
};

type CertificateNotRecommendedItemDto = {
  certificationSqid: string;
  achievementName: string;
  reason: string;
};

type CertificateSuggestionResponse = {
  resumeSqid: string;
  jobProfile: CertificateSuggestionJobProfileDto;
  suggestions: CertificateSuggestionItemDto[];
  notRecommended: CertificateNotRecommendedItemDto[];
};
```

### Export

`POST /api/Resume/{resumeSqid}/export/pdf`

`POST /api/Resume/{resumeSqid}/export/docx`

```ts
type ExportResumeRequest = {
  templateSqid?: string | null;
  includeLifetimeAchievements?: boolean;
  includeSchoolYearGrouping?: boolean;
};

type ExportResumeResponse = {
  resumeSqid: string;
  format: "pdf" | "docx";
  fileName: string;
  downloadUrl: string;
  generatedAt: string;
};
```

### Internal ADK Contracts

These are included for debugging and backend integration awareness only. Browser frontend code should not call them.

`POST /internal/adk/certificates/parse`

```ts
type AdkCertificateParseRequest = {
  certificationSqid: string;
  fileUrl: string;
  fileMimeType: "application/pdf" | "image/jpeg" | "image/png";
  fileName: string;
  expectedFields?: string[];
};

type AdkCertificateQualityCheckDto = {
  isReadable: boolean;
  recommendedDpi: number | null;
  detectedIssues: string[];
  qualityScore: number;
};

type AdkCertificateOcrDto = {
  rawText: string;
  textDetected: boolean;
  ocrConfidence: number;
};

type AdkCertificateParsedFieldsDto = {
  achievementName: string | null;
  institution: string | null;
  issuedDate: string | null;
  gradeOrScore: string | null;
  tags: string[];
};

type AdkCertificateParseResponse = {
  certificationSqid: string;
  qualityCheck: AdkCertificateQualityCheckDto;
  ocr: AdkCertificateOcrDto;
  parsedFields: AdkCertificateParsedFieldsDto;
  fieldConfidence: CertificateFieldConfidenceDto[];
  overallConfidence: number;
  statusRecommendation: "parsed" | "needs_review" | "failed";
  model: string;
  generatedAt: string;
};
```

`POST /internal/adk/certificates/suggest`

```ts
type AdkCertificateSuggestionCertificateDto = {
  certificationSqid: string;
  achievementName: string;
  institution: string;
  issuedDate?: string | null;
  description?: string | null;
  tags?: string[];
};

type AdkCertificateSuggestionRequest = {
  resumeSqid: string;
  jobTitle: string;
  companyName?: string;
  jobDescription: string;
  certificates: AdkCertificateSuggestionCertificateDto[];
  maxSuggestions?: number;
};

type AdkCertificateSuggestionItemDto = {
  certificationSqid: string;
  matchScore: number;
  recommendation: "include" | "exclude";
  reason: string;
  matchedSignals: string[];
};

type AdkCertificateExcludedItemDto = {
  certificationSqid: string;
  recommendation: "exclude";
  reason: string;
};

type AdkCertificateSuggestionResponse = {
  resumeSqid: string;
  jobProfile: {
    targetRole: string;
    companyName?: string | null;
    detectedSignals: string[];
  };
  suggestions: AdkCertificateSuggestionItemDto[];
  excluded: AdkCertificateExcludedItemDto[];
  model: string;
  generatedAt: string;
};
```

## Recommended shadcn UI

Use a focused dashboard-style workflow, not a marketing layout.

Recommended components:

| Need | shadcn component |
|---|---|
| Upload modal or review modal | `Dialog` |
| Mobile review panel | `Drawer` |
| Certificate list | `Table` or compact `Card` list |
| Upload and parse progress | `Progress`, `Spinner` |
| Loading fields | `Skeleton` |
| Editable fields | `FieldGroup`, `Field`, `Input`, `Textarea` |
| Status labels | `Badge` |
| Errors and warnings | `Alert` |
| Empty certificate list | `Empty` |
| Delete confirmation | `AlertDialog` |
| Suggestions panel | `Sheet` or `Dialog` |
| Success/error notifications | `toast()` from `sonner` |

## Upload Interaction

Best interaction:

1. User clicks `Upload certificate`.
2. Open a `Dialog` with drag/drop or file picker.
3. Validate file count and file type client-side before request.
4. Submit `multipart/form-data` to `/api/certificates/upload`.
5. Show uploaded items immediately with `Badge` status.
6. If `autoProcess` is enabled, start polling processing status.

Upload request:

```ts
const formData = new FormData();
files.forEach((file) => formData.append("files", file));
formData.append("source", "resume_builder");
formData.append("autoProcess", "true");

await fetch("/api/certificates/upload", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
  },
  body: formData,
});
```

Upload constraints to show in the UI:

- Accepted: JPEG, PNG, PDF.
- Max size: 10MB per file.
- Max batch: 20 files.

## Processing States

Map backend status to clear UI states.

| Status | UI Behavior |
|---|---|
| `uploaded` | Show uploaded item, enable manual edit, allow parse start. |
| `pending_processing` | Show processing badge and disabled review action. |
| `processing` | Show spinner/progress and poll status. |
| `parsed` | Show review action; fields can be confirmed. |
| `needs_review` | Highlight item and open review flow when selected. |
| `verified_by_user` | Show confirmed badge and allow resume selection. |
| `failed` | Show retry and manual entry actions. |

Polling pattern:

```ts
async function pollCertificateStatus(certificationSqid: string) {
  const response = await fetch(
    `/api/certificates/${certificationSqid}/processing-status`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  return response.json();
}
```

Poll every 2-4 seconds while status is `pending_processing` or `processing`. Stop polling when status is `parsed`, `needs_review`, `verified_by_user`, or `failed`.

## Review Modal

Use a `Dialog` for reviewing parsed certificate data.

Layout:

- Header: certificate file name, status `Badge`, overall confidence.
- Left: file preview or file metadata.
- Right: editable fields.
- Footer: `Cancel`, `Save changes`, `Confirm certificate`.

Fields:

- Achievement name
- Institution
- Issued date
- School year
- Grade or score
- Description
- Tags

For low-confidence fields:

- Set `Field data-invalid`.
- Set `aria-invalid` on the control.
- Show confidence with `Badge`.
- Add `FieldDescription` like `AI confidence: 73%. Please review.`

Button loading:

```tsx
<Button disabled={isSaving || isConfirming}>
  {isConfirming ? <Spinner data-icon="inline-start" /> : null}
  {isConfirming ? "Confirming" : "Confirm certificate"}
</Button>
```

## Suggestions Interaction

Use certificate suggestions inside resume tailoring or certificate selection.

Recommended flow:

1. User enters job title and job description.
2. Frontend calls backend suggestion endpoint.
3. Show `Sheet` with recommended and excluded certificates.
4. User toggles certificates to include.
5. Save selection through `PUT /api/Resume/{resumeSqid}/certificates`.

Use:

- `Badge` for match score.
- `Checkbox` for include selection.
- `Alert` if no strong matches exist.
- `Separator` between suggested and excluded groups.

Do not auto-attach AI suggestions without explicit user confirmation.

## Resume Integration

After a user confirms certificate records, let them select certificates for the resume.

Replace selected certificates:

```ts
await fetch(`/api/Resume/${resumeSqid}/certificates`, {
  method: "PUT",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    certificationSqids,
  }),
});
```

Use the review payload to render export-ready preview:

```ts
await fetch(`/api/Resume/${resumeSqid}/review`, {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
```

## Empty, Error, And Retry States

Empty:
- Use `Empty`.
- Primary action: `Upload certificate`.

Upload failed:
- Use `Alert`.
- Show the exact backend validation message.

Parse failed:
- Use `Alert`.
- Actions: `Retry parsing`, `Enter manually`.

No suggestions:
- Use `Alert`.
- Message: no certificate strongly matches this job description.

Delete:
- Use `AlertDialog`.
- Confirm that deleting detaches the certificate from resumes.

## UX Rules

- Keep AI output reviewable and editable.
- Make confidence visible but not noisy.
- Do not block manual entry if parsing fails.
- Do not hide low-confidence fields.
- Do not call internal ADK endpoints from the browser.
- Do not auto-select or auto-confirm AI recommendations.
- Use `DialogTitle`, `SheetTitle`, and `AlertDialogTitle` for accessibility.
- Use shadcn `Skeleton`, `Spinner`, `Badge`, `Alert`, and `Empty` instead of custom equivalents.
