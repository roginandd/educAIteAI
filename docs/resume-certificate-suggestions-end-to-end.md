# Resume Certificate Suggestions End-to-End

## Purpose

This document describes the full integration between `EducAIteAPI` and `EducAIteAI` for resume-based certificate suggestions.

The goal is:
- `EducAIteAPI` gathers the authenticated student's saved resume context and owned certificates.
- `EducAIteAPI` sends that normalized context to `EducAIteAI`.
- `EducAIteAI` ranks only the provided certificates and returns the most relevant ones for the student's target role.

## API Entry Point

`EducAIteAPI` exposes:

- `POST /api/Resume/{resumeSqid}/certificate-suggestions`

Request body:

```json
{
  "maxResults": 5
}
```

The frontend does not send raw experience or certificate content to this endpoint. The API backend loads that data from saved EducAIte records.

## API Responsibilities

`EducAIteAPI` is responsible for:

- validating the authenticated student
- decoding and validating `resumeSqid`
- verifying resume ownership
- loading the saved resume context
- loading all student-owned certificates
- normalizing the payload for AI
- forwarding the bearer token to `EducAIteAI`
- returning the ranked result to the frontend

Context sent from API to AI:

- `resumeSqid`
- `targetRole`
- `experienceSummaries`
- `leadershipSummaries`
- `activitySummaries`
- `certificates`
- `maxResults`

## AI Task Intent

`EducAIteAI` accepts the task intent:

- `suggest_resume_certificates`

This is handled through the generic agent task pipeline, not through a separate public resume route.

## API to AI Payload

`EducAIteAPI` sends this shape to `EducAIteAI`:

```json
{
  "intent": "suggest_resume_certificates",
  "payload": {
    "resumeSqid": "LKWpHOn6",
    "targetRole": "Backend Developer Intern",
    "experienceSummaries": [
      "Built REST APIs for a capstone project using C# and SQL Server."
    ],
    "leadershipSummaries": [
      "Led a student development team for a campus hackathon."
    ],
    "activitySummaries": [
      "Participated in coding competitions and peer tutoring."
    ],
    "certificates": [
      {
        "certificationSqid": "abc123",
        "achievementName": "AWS Cloud Practitioner",
        "institution": "Amazon Web Services",
        "issuedDate": "2025-03-10",
        "schoolYear": null,
        "gradeOrScore": null,
        "description": "Cloud fundamentals and core AWS services.",
        "tags": ["cloud", "aws", "fundamentals"],
        "status": "verified"
      }
    ],
    "maxResults": 5
  }
}
```

## AI Responsibilities

`EducAIteAI` is responsible for:

- analyzing the target role against the saved resume context
- evaluating only the provided certificate list
- ranking the most relevant certificates
- returning concise reasons and usage guidance
- not inventing any missing resume or certificate facts

`EducAIteAI` must not:

- fetch extra resume data for this task
- invent new certificates
- return certificates not present in the payload
- fabricate tags, grades, dates, or institutions

## AI to API Response

`EducAIteAI` returns this shape:

```json
{
  "resumeSqid": "LKWpHOn6",
  "targetRole": "Backend Developer Intern",
  "totalCertificatesReviewed": 1,
  "suggestions": [
    {
      "certificationSqid": "abc123",
      "achievementName": "AWS Cloud Practitioner",
      "institution": "Amazon Web Services",
      "issuedDate": "2025-03-10",
      "schoolYear": null,
      "gradeOrScore": null,
      "description": "Cloud fundamentals and core AWS services.",
      "tags": ["cloud", "aws", "fundamentals"],
      "status": "verified",
      "relevanceScore": 88,
      "matchReason": "Supports backend internship roles that touch cloud deployment, API hosting, and infrastructure basics.",
      "recommendedUsage": "Keep this in the certifications section and mention it when describing backend or deployment-related projects."
    }
  ]
}
```

## API Response to Frontend

`EducAIteAPI` returns the same result contract to the frontend after validation and normalization:

- `resumeSqid`
- `targetRole`
- `totalCertificatesReviewed`
- `suggestions`

Each suggestion includes:

- `certificationSqid`
- `achievementName`
- `institution`
- `issuedDate`
- `schoolYear`
- `gradeOrScore`
- `description`
- `tags`
- `status`
- `relevanceScore`
- `matchReason`
- `recommendedUsage`

## Flow Summary

1. Frontend calls `POST /api/Resume/{resumeSqid}/certificate-suggestions`.
2. `EducAIteAPI` validates auth and ownership.
3. `EducAIteAPI` loads saved resume context and owned certificates.
4. `EducAIteAPI` sends `suggest_resume_certificates` to `EducAIteAI`.
5. `EducAIteAI` ranks the provided certificates against the target role and resume context.
6. `EducAIteAI` returns ranked suggestions.
7. `EducAIteAPI` returns that result to the frontend.

## Error Expectations

From `EducAIteAPI`:

- `401` when auth is missing or invalid
- `404` when the resume does not exist or is not owned by the student
- `400` or validation error when the request is malformed
- `422` when the saved resume context is not sufficient for this feature
- `502` style upstream failure if `EducAIteAI` fails

From `EducAIteAI`:

- schema validation failure if the payload shape is wrong
- structured runner failure if the model returns invalid JSON

## Frontend Notes

- The frontend should treat this as an on-demand recommendation action.
- The frontend should not recompute relevance client-side.
- The frontend should display `matchReason` and `recommendedUsage` directly.
- The frontend should allow empty results when no certificate is strongly relevant.
