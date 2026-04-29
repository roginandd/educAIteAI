# Certificate AI Frontend Integration

## Endpoint Usage

The frontend should continue to use the EducAIte API as the source of truth. Call the AI service only through backend-driven flows unless an internal development screen needs direct access.

Backend-facing ADK endpoints:

| Action | Method | Endpoint |
|---|---|---|
| Parse uploaded certificate | `POST` | `/internal/adk/certificates/parse` |
| Suggest certificates for a job | `POST` | `/internal/adk/certificates/suggest` |

For the user-facing app, the expected flow is:

1. Upload files through the backend certificate upload endpoint.
2. Backend creates certificate records and starts processing.
3. Frontend polls backend processing status.
4. Frontend opens a review UI when status is `parsed`, `needs_review`, or `failed`.
5. User edits fields and confirms through backend certificate endpoints.

## Best Interaction Pattern

Use a shadcn `Dialog` for certificate review after upload. This is better than navigating away because the user stays in the resume-building context while AI parsing finishes.

Recommended layout:

- `Dialog` with `DialogTitle` for reviewing one certificate.
- Left side: file preview area.
- Right side: editable certificate fields.
- Top status row: `Badge` for processing state and `Progress` for confidence.
- Field-level confidence: `Badge` beside each field, plus `FieldDescription` for needs-review messages.
- Footer actions: `Cancel`, `Save changes`, `Confirm certificate`.

For multiple uploads, show a certificate list first, then open the review dialog per certificate.

## Loading And Empty States

Use shadcn components instead of custom loading markup:

- Uploading: `Progress` plus disabled submit `Button` with `Spinner`.
- Processing: `Skeleton` rows for fields and a status `Badge`.
- No certificates: `Empty` with one upload action.
- Parse failed: `Alert` with retry action.
- Low-confidence fields: field-level `data-invalid` and `aria-invalid`.
- Success: `toast()` from `sonner`.

Button loading pattern:

```tsx
<Button disabled={isUploading || isProcessing}>
  {isProcessing ? <Spinner data-icon="inline-start" /> : null}
  {isProcessing ? "Processing" : "Confirm certificate"}
</Button>
```

## Suggested shadcn Components

Use these components for the certificate parsing workflow:

| Need | Component |
|---|---|
| Review modal | `Dialog` |
| Mobile review panel | `Drawer` |
| Upload/status feedback | `Progress`, `Spinner`, `toast()` |
| Field form | `FieldGroup`, `Field`, `Input`, `Textarea` |
| Status labels | `Badge` |
| Failure/warning state | `Alert` |
| Loading placeholders | `Skeleton` |
| Empty certificate list | `Empty` |
| Certificate list | `Card` or `Table` |

## UI States

`uploaded` or `pending_processing`:
- Show list item with disabled review action.
- Display `Badge` text: `Processing`.
- Use `Skeleton` for parsed fields if the review dialog is open.

`processing`:
- Keep actions disabled except close/cancel.
- Show progress text like `Reading certificate`.

`parsed`:
- Open review dialog automatically only for single-file uploads.
- Fields are editable, confidence badges are neutral.
- Primary action is `Confirm certificate`.

`needs_review`:
- Open review dialog and highlight low-confidence fields.
- Use `Field data-invalid` and `aria-invalid` on controls.
- Primary action remains `Confirm certificate` after edits.

`failed`:
- Show `Alert`.
- Offer `Retry parsing` and `Enter manually`.

## Direct ADK Parse Request Shape

```ts
type ParseCertificateRequest = {
  certificationSqid: string;
  fileUrl: string;
  fileMimeType: "application/pdf" | "image/jpeg" | "image/png";
  fileName: string;
  expectedFields?: string[];
};
```

## Direct ADK Suggest Request Shape

```ts
type SuggestCertificatesRequest = {
  resumeSqid: string;
  jobTitle: string;
  companyName?: string;
  jobDescription: string;
  maxSuggestions?: number;
  certificates: Array<{
    certificationSqid: string;
    achievementName: string;
    institution: string;
    issuedDate?: string | null;
    description?: string | null;
    tags?: string[];
  }>;
};
```

## Recommended Screen Flow

1. Certificate upload page shows an upload dropzone and existing certificates.
2. After upload, show uploaded items immediately with processing badges.
3. Poll backend status every few seconds until each item resolves.
4. For `needs_review`, show a review-required badge and open the dialog when clicked.
5. For job tailoring, show suggestions in a `Dialog` or `Sheet` with include/exclude toggles.
6. User confirms selected certificates through the backend resume certificate endpoint.

Keep AI output visibly reviewable. Do not silently attach AI-suggested certificates to a resume without user confirmation.
