# Resume Certificate Suggestions

## Purpose

`suggest_resume_certificates` lets EducAIteAI rank the student's existing certificates against the student's saved resume context and target role.

The API backend is responsible for gathering the context first. EducAIteAI does not fetch resume data for this task. It only evaluates the payload it receives.

## Intent

- `suggest_resume_certificates`

## Input Contract

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

## Output Contract

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

## AI Rules

- Rank only from the provided certificate list.
- Use the target role plus the supplied experience, leadership, and activity summaries as context.
- Do not invent resume facts or certificate metadata.
- Return fewer than `maxResults` when only a few certificates are actually relevant.
- Keep `matchReason` and `recommendedUsage` concise and practical.
