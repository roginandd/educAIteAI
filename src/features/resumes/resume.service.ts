import type { Content } from "@google/genai";
import type { Runner } from "@google/adk";

import { env } from "../../config/env";
import { AppError } from "../../shared/errors/app-error";
import { UnauthorizedError } from "../../shared/errors/unauthorized-error";
import { UpstreamHttpClient } from "../../shared/http/upstream-http-client";
import { StructuredAgentRunnerService } from "../../shared/ai/structured-agent-runner.service";
import type { PublicWebSearchService, PublicSearchResult } from "../../shared/search/public-web-search.service";
import {
  analyzeResumeWithRelationsInputSchema,
  companyRecommendationSearchInputSchema,
  type CompanyRecommendationSearchInput,
  resumeAnalysisOutputSchema,
  resumeCertificateSuggestionsInputSchema,
  resumeCertificateSuggestionsOutputSchema,
  resumeJobProfileOutputSchema,
  resumeTailoringOutputSchema,
  studentCareerHintInputSchema,
  type StudentCareerHintInput,
  studentJobTargetSuggestionsInputSchema,
  type StudentJobTargetSuggestionsInput,
  tailorResumeForJobInputSchema,
  type AnalyzeResumeWithRelationsInput,
  type ResumeCertificateSuggestionsInput,
  type ResumeCertificateSuggestionsOutput,
  type ResumeAnalysisOutput,
  type ResumeJobProfileOutput,
  type ResumeTailoringOutput,
  type TailorResumeForJobInput,
  getResumeWithRelationsInputSchema,
  type GetResumeWithRelationsInput,
} from "./resume.dto";
import {
  analyzeResumeWithRelationsResponseSchema,
  companyRecommendationSearchResponseSchema,
  resumeCertificateSuggestionsResponseSchema,
  resumeWithRelationsResponseSchema,
  studentCareerHintResponseSchema,
  studentJobTargetSuggestionsResponseSchema,
  tailorResumeForJobResponseSchema,
  type AnalyzeResumeWithRelationsResponse,
  type CompanyRecommendationSearchResponse,
  type ResumeCertificateSuggestionsResponse,
  type ResumeWithRelationsResponse,
  type StudentCareerHintResponse,
  type StudentJobTargetSuggestionsResponse,
  type TailorResumeForJobResponse,
} from "./resume.response";

export class ResumeService {
  constructor(
    private readonly analysisRunner: Runner,
    private readonly certificateSuggestionRunner: Runner,
    private readonly jobProfileRunner: Runner,
    private readonly tailoringRunner: Runner,
    private readonly upstreamHttpClient: UpstreamHttpClient,
    private readonly structuredAgentRunnerService: StructuredAgentRunnerService,
    private readonly publicWebSearchService: PublicWebSearchService,
  ) {}

  async getResumeWithRelations(
    input: GetResumeWithRelationsInput,
    authorizationHeader: string | undefined,
  ): Promise<ResumeWithRelationsResponse> {
    const parsedInput = getResumeWithRelationsInputSchema.parse(input);
    const authHeader = this.requireAuthorizationHeader(authorizationHeader);

    const data = await this.upstreamHttpClient.getJson(
      `/api/Resume/${encodeURIComponent(parsedInput.resumeSqid)}/review`,
      {
        method: "GET",
        headers: {
          Authorization: authHeader,
          Accept: "application/json",
        },
      },
      "Unable to fetch resume details.",
    );

    return resumeWithRelationsResponseSchema.parse(data);
  }

  async analyzeResumeWithRelations(
    input: AnalyzeResumeWithRelationsInput,
    authorizationHeader: string | undefined,
  ): Promise<AnalyzeResumeWithRelationsResponse> {
    const parsedInput = analyzeResumeWithRelationsInputSchema.parse(input);
    const resume = await this.getResumeWithRelations({
      resumeSqid: parsedInput.resumeSqid,
      includeExperiences: true,
      includeEducations: true,
      includeSkills: true,
      includeProjects: true,
      includeCertifications: true,
    }, authorizationHeader);
    const analysis = await this.generateResumeAnalysis(resume);

    return analyzeResumeWithRelationsResponseSchema.parse({
      resume,
      analysis,
    });
  }

  async tailorResumeForJob(
    input: TailorResumeForJobInput,
    authorizationHeader: string | undefined,
  ): Promise<TailorResumeForJobResponse> {
    const parsedInput = tailorResumeForJobInputSchema.parse(input);
    const resume = await this.getResumeWithRelations(parsedInput, authorizationHeader);
    const jobProfile = await this.generateJobProfile(parsedInput);
    const firstAttempt = await this.generateTailoredResume(resume, parsedInput, jobProfile, undefined);
    const firstAttemptViolations = validateTailoringEvidence(resume, firstAttempt);

    let finalTailoring = firstAttempt;
    let retryCount = 0;

    if (firstAttemptViolations.length > 0) {
      retryCount = 1;
      finalTailoring = await this.generateTailoredResume(resume, parsedInput, jobProfile, firstAttemptViolations);
      const secondAttemptViolations = validateTailoringEvidence(resume, finalTailoring);

      if (secondAttemptViolations.length > 0) {
        throw new AppError(
          `Resume tailoring validation failed: ${secondAttemptViolations.join(" | ")}`,
          "TAILORING_VALIDATION_FAILED",
          422,
        );
      }
    }

    return tailorResumeForJobResponseSchema.parse({
      resume,
      jobProfile,
      alignment: finalTailoring.alignment,
      tailoredResume: finalTailoring.tailoredResume,
      tailoringDecisions: finalTailoring.tailoringDecisions,
      evidenceMap: finalTailoring.evidenceMap,
      metadata: {
        model: env.GOOGLE_GENAI_RESUME_MODEL,
        generatedAt: new Date().toISOString(),
        retryCount,
      },
    });
  }

  async suggestStudentJobTargets(
    input: StudentJobTargetSuggestionsInput,
    authorizationHeader: string | undefined,
  ): Promise<StudentJobTargetSuggestionsResponse> {
    this.requireAuthorizationHeader(authorizationHeader);
    const parsedInput = studentJobTargetSuggestionsInputSchema.parse(input);
    const degree = parsedInput.degreeProgram ?? "the student's degree";
    const subjects = parsedInput.subjects.map((subject) => subject.toLowerCase());
    const isTech = /computer|information|software|technology|systems|engineering/i.test(degree)
      || subjects.some((subject) => /software|database|web|data|algorithm|programming|system/.test(subject));

    const suggestions = isTech
      ? [
        {
          title: "Backend Developer Intern",
          roleType: "Internship",
          matchReason: `Matches ${degree} coursework and backend-adjacent subjects such as ${formatEvidenceList(parsedInput.subjects)}.`,
          importantSkills: ["APIs", "SQL", "Git", "Backend frameworks"],
          recommendedResumeFocus: ["Projects", "Database work", "API development"],
          companyTypes: ["Software companies", "Startups", "IT departments"],
        },
        {
          title: "Web Developer Intern",
          roleType: "Internship",
          matchReason: "Fits students with programming, web, database, or software engineering coursework.",
          importantSkills: ["HTML", "CSS", "JavaScript", "Git"],
          recommendedResumeFocus: ["Web projects", "UI implementation", "Team coursework"],
          companyTypes: ["Digital agencies", "SaaS companies", "Campus IT teams"],
        },
        {
          title: "QA Tester Intern",
          roleType: "Internship",
          matchReason: "Appropriate for undergraduate students learning software validation and system behavior.",
          importantSkills: ["Test cases", "Bug reports", "Attention to detail", "Basic SQL"],
          recommendedResumeFocus: ["Course projects", "Testing activities", "Documentation"],
          companyTypes: ["Software companies", "BPO IT teams", "Product teams"],
        },
      ]
      : [
        {
          title: "Administrative Intern",
          roleType: "Internship",
          matchReason: `A practical student-level role for ${degree} with transferable academic and organization experience.`,
          importantSkills: ["Communication", "Documentation", "Organization", "Research"],
          recommendedResumeFocus: ["Education", "Organizations", "Coursework"],
          companyTypes: ["Local businesses", "Schools", "Government offices"],
        },
        {
          title: "Research Assistant Intern",
          roleType: "Internship",
          matchReason: "Fits students with coursework-heavy profiles and limited full-time work history.",
          importantSkills: ["Research", "Writing", "Data gathering", "Presentation"],
          recommendedResumeFocus: ["Research activity", "Coursework", "Academic outputs"],
          companyTypes: ["Universities", "Research groups", "Nonprofits"],
        },
        {
          title: "Customer Support Intern",
          roleType: "Internship",
          matchReason: "A student-appropriate role that values communication and problem-solving.",
          importantSkills: ["Communication", "Problem solving", "Documentation", "Customer service"],
          recommendedResumeFocus: ["Volunteer work", "Organizations", "Part-time experience"],
          companyTypes: ["Service companies", "Startups", "Retail operations"],
        },
      ];

    return studentJobTargetSuggestionsResponseSchema.parse({
      suggestions: suggestions.slice(0, 6),
    });
  }

  async generateStudentCareerHint(
    input: StudentCareerHintInput,
    authorizationHeader: string | undefined,
  ): Promise<StudentCareerHintResponse> {
    this.requireAuthorizationHeader(authorizationHeader);
    const parsedInput = studentCareerHintInputSchema.parse(input);
    const role = parsedInput.targetRole ?? "your target role";
    const section = parsedInput.activeSection.toLowerCase();
    const hint = section.includes("project")
      ? `For ${role}, lead with what you built, the tools you used, and the problem your project solved.`
      : section.includes("skill")
        ? `For ${role}, list skills you can support with coursework, certificates, or projects.`
        : section.includes("summary")
          ? `For ${role}, keep the summary focused on your degree, strongest student experience, and the role direction.`
          : `For ${role}, prioritize student evidence such as coursework, projects, certificates, and organization work.`;

    return studentCareerHintResponseSchema.parse({ hint });
  }

  async suggestResumeCertificates(
    input: ResumeCertificateSuggestionsInput,
    authorizationHeader: string | undefined,
  ): Promise<ResumeCertificateSuggestionsResponse> {
    this.requireAuthorizationHeader(authorizationHeader);
    const parsedInput = resumeCertificateSuggestionsInputSchema.parse(input);
    const suggestions = await this.generateResumeCertificateSuggestions(parsedInput);

    return resumeCertificateSuggestionsResponseSchema.parse({
      ...suggestions,
      resumeSqid: parsedInput.resumeSqid,
      targetRole: parsedInput.targetRole,
      totalCertificatesReviewed: parsedInput.certificates.length,
    });
  }

  async recommendResumeJobOpportunities(
    input: CompanyRecommendationSearchInput,
    authorizationHeader: string | undefined,
  ): Promise<CompanyRecommendationSearchResponse> {
    const parsedInput = companyRecommendationSearchInputSchema.parse(input);
    const resume = await this.getResumeWithRelations({
      resumeSqid: parsedInput.resumeSqid,
      includeExperiences: true,
      includeEducations: true,
      includeSkills: true,
      includeProjects: true,
      includeCertifications: true,
    }, authorizationHeader);
    const targetRole = parsedInput.targetRole ?? resume.targetRole ?? "Student Intern";
    const queries = buildOpportunityQueries(targetRole, parsedInput);
    const searchResults = await runSearches(this.publicWebSearchService, queries, parsedInput.maxResults * 2);
    const resumeTerms = collectResumeTerms(resume);
    const searchedAt = new Date().toISOString();
    const results = searchResults
      .filter(isPublicJobSuggestionResult)
      .map((result) => scoreSearchResult(result, targetRole, parsedInput, resumeTerms, searchedAt))
      .filter((result) => result.matchScore >= 50)
      .sort((left, right) => right.matchScore - left.matchScore)
      .slice(0, parsedInput.maxResults);

    return companyRecommendationSearchResponseSchema.parse({
      resumeSqid: parsedInput.resumeSqid,
      targetRole,
      results,
      searchedAt,
    });
  }

  private async generateResumeAnalysis(resume: ResumeWithRelationsResponse): Promise<ResumeAnalysisOutput> {
    const message: Content = {
      role: "user",
      parts: [{ text: buildResumeAnalysisPrompt(resume) }],
    };

    return this.structuredAgentRunnerService.runStructuredPrompt({
      runner: this.analysisRunner,
      userId: "resume_service_analysis",
      message,
      outputKey: "resume_analysis_output",
      outputSchema: resumeAnalysisOutputSchema,
      invalidJsonMessage: "Resume analysis agent returned invalid JSON.",
      noResponseMessage: "Resume analysis agent did not return a final response.",
    });
  }

  private async generateJobProfile(input: TailorResumeForJobInput): Promise<ResumeJobProfileOutput> {
    const message: Content = {
      role: "user",
      parts: [{ text: buildResumeJobProfilePrompt(input) }],
    };

    return this.structuredAgentRunnerService.runStructuredPrompt({
      runner: this.jobProfileRunner,
      userId: "resume_service_job_profile",
      message,
      outputKey: "resume_job_profile_output",
      outputSchema: resumeJobProfileOutputSchema,
      invalidJsonMessage: "Resume job profiling agent returned invalid JSON.",
      noResponseMessage: "Resume job profiling agent did not return a final response.",
    });
  }

  private async generateResumeCertificateSuggestions(
    input: ResumeCertificateSuggestionsInput,
  ): Promise<ResumeCertificateSuggestionsOutput> {
    const message: Content = {
      role: "user",
      parts: [{ text: buildResumeCertificateSuggestionPrompt(input) }],
    };

    return this.structuredAgentRunnerService.runStructuredPrompt({
      runner: this.certificateSuggestionRunner,
      userId: `resume_service_certificate_suggestions_${input.resumeSqid}`,
      message,
      outputKey: "resume_certificate_suggestions_output",
      outputSchema: resumeCertificateSuggestionsOutputSchema,
      invalidJsonMessage: "Resume certificate suggestion agent returned invalid JSON.",
      noResponseMessage: "Resume certificate suggestion agent did not return a final response.",
    });
  }

  private async generateTailoredResume(
    resume: ResumeWithRelationsResponse,
    input: TailorResumeForJobInput,
    jobProfile: ResumeJobProfileOutput,
    priorViolations: string[] | undefined,
  ): Promise<ResumeTailoringOutput> {
    const message: Content = {
      role: "user",
      parts: [{ text: buildResumeTailoringPrompt(resume, input, jobProfile, priorViolations) }],
    };

    return this.structuredAgentRunnerService.runStructuredPrompt({
      runner: this.tailoringRunner,
      userId: priorViolations?.length ? "resume_service_tailoring_retry" : "resume_service_tailoring",
      message,
      outputKey: "resume_tailoring_output",
      outputSchema: resumeTailoringOutputSchema,
      invalidJsonMessage: "Resume tailoring agent returned invalid JSON.",
      noResponseMessage: "Resume tailoring agent did not return a final response.",
    });
  }

  private requireAuthorizationHeader(headerValue: string | undefined): string {
    if (!headerValue?.trim()) {
      throw new UnauthorizedError();
    }

    return headerValue;
  }
}

function buildResumeAnalysisPrompt(resume: ResumeWithRelationsResponse): string {
  return [
    "You are evaluating one student's resume data and related entities for quality, completeness, and actionability.",
    "Return only JSON.",
    "Return exactly this shape:",
    '{"strengths":[{"title":"...","evidence":"...","relationType":"...","relationSqid":"..."}],"gaps":[{"title":"...","impact":"...","evidence":"...","relationType":"...","relationSqid":"..."}],"relationIssues":[{"relationType":"...","relationSqid":"...","issue":"...","severity":"low|medium|high","recommendedFix":"..."}],"nextActions":[{"priority":"high|medium|low","action":"...","reason":"..."}]}',
    "Rules:",
    "- Use only evidence found in the provided resume payload.",
    "- Do not invent achievements, projects, institutions, roles, or skills.",
    "- relationType must be one of: experience, education, certification, resume, or general.",
    "- Keep each field concise and implementation-ready.",
    "",
    "Resume payload:",
    JSON.stringify(resume),
  ].join("\n");
}

function buildResumeJobProfilePrompt(input: TailorResumeForJobInput): string {
  return [
    "Analyze this target role and extract the real hiring signals for resume tailoring.",
    "Return only JSON.",
    'Return exactly this shape: {"targetRole":"...","companyName":"...","targetTone":"...","recruiterSignals":["..."],"coreRequirements":[{"requirement":"...","priority":"high|medium|low","rationale":"...","keywords":["..."]}],"focusAreas":["..."],"downplayAreas":["..."]}',
    "Rules:",
    "- Use only the supplied job title, company name, and job description.",
    "- Extract what matters most to the recruiter.",
    "- Keep priorities grounded in the job description.",
    "- Keep focusAreas and downplayAreas concise and usable for rewriting decisions.",
    "",
    "Job input:",
    JSON.stringify({
      jobTitle: input.jobTitle,
      companyName: input.companyName ?? null,
      jobDescription: input.jobDescription,
    }),
  ].join("\n");
}

function buildResumeTailoringPrompt(
  resume: ResumeWithRelationsResponse,
  input: TailorResumeForJobInput,
  jobProfile: ResumeJobProfileOutput,
  priorViolations: string[] | undefined,
): string {
  return [
    "Tailor this existing resume to the target role without changing the person's underlying facts.",
    "Return only JSON.",
    'Return exactly this shape: {"alignment":{"score":0,"matched":[{"requirement":"...","evidence":"...","priority":"high|medium|low"}],"gaps":[{"requirement":"...","reason":"...","priority":"high|medium|low"}],"priorityFocus":["..."]},"tailoredResume":{"headline":{"statementId":"...","text":"..."},"professionalSummary":[{"statementId":"...","text":"..."}],"keySkills":[{"statementId":"...","text":"..."}],"experiences":[{"employmentSqid":"...","companyName":"...","positionTitle":"...","location":"...","dateRange":"...","bullets":[{"statementId":"...","text":"..."}]}],"education":[{"educationSqid":"...","schoolName":"...","degree":"...","dateRange":"...","highlights":[{"statementId":"...","text":"..."}]}],"certifications":[{"certificationSqid":"...","name":"...","issuer":"...","highlight":{"statementId":"...","text":"..."}}]},"tailoringDecisions":{"highlighted":["..."],"downplayed":["..."],"noiseReduced":["..."]},"evidenceMap":[{"statementId":"...","statement":"...","sourceRefs":[{"relationType":"experience|education|certification|resume|general","relationSqid":"...","field":"...","quote":"..."}]}]}',
    "Truth rules:",
    "- No fake experience, skills, tools, employers, dates, metrics, or certifications.",
    "- Reframe and prioritize. Do not fabricate.",
    "- Keep the result truthful and role-aligned.",
    "- Every tailored statement must have an evidenceMap item with matching statementId and statement text.",
    "- sourceRef.quote must come directly from or be tightly grounded in the provided resume data.",
    "- If the resume does not support a job requirement, reflect it as a gap instead of pretending it exists.",
    "",
    "Target job input:",
    JSON.stringify({
      jobTitle: input.jobTitle,
      companyName: input.companyName ?? null,
      jobDescription: input.jobDescription,
    }),
    "",
    "Job profile:",
    JSON.stringify(jobProfile),
    "",
    "Resume payload:",
    JSON.stringify(resume),
    priorViolations?.length
      ? ["", "Correct the following validation failures from the prior attempt:", ...priorViolations.map((item) => `- ${item}`)].join("\n")
      : undefined,
  ].filter((part): part is string => Boolean(part)).join("\n");
}

function buildResumeCertificateSuggestionPrompt(input: ResumeCertificateSuggestionsInput): string {
  return [
    "Review this student's saved resume context and existing certificates.",
    "Handpick the certificates that are most relevant to the target role.",
    "Return only JSON.",
    'Return exactly this shape: {"resumeSqid":"...","targetRole":"...","totalCertificatesReviewed":0,"suggestions":[{"certificationSqid":"...","achievementName":"...","institution":"...","issuedDate":"...","schoolYear":"...","gradeOrScore":"...","description":"...","tags":["..."],"status":"...","relevanceScore":0,"matchReason":"...","recommendedUsage":"..."}]}',
    "Rules:",
    "- Use only the provided target role, experience summaries, leadership summaries, activity summaries, and certificate list.",
    "- Do not invent experience, leadership, activities, certificate facts, institutions, grades, tags, or dates.",
    "- Select only certificates from the provided list.",
    "- Return at most maxResults suggestions and rank the strongest matches first.",
    "- If a certificate is weakly related, omit it instead of forcing it into suggestions.",
    "- matchReason must connect the certificate to the target role and the student's actual resume context.",
    "- recommendedUsage must tell the student how to position that certificate in the resume or application.",
    "",
    "Certificate suggestion input:",
    JSON.stringify(input),
  ].join("\n");
}

function validateTailoringEvidence(
  resume: ResumeWithRelationsResponse,
  tailoring: ResumeTailoringOutput,
): string[] {
  const violations: string[] = [];
  const statementMap = collectTailoredStatements(tailoring);
  const evidenceMap = new Map(tailoring.evidenceMap.map((item) => [item.statementId, item]));

  for (const [statementId, statement] of statementMap.entries()) {
    const evidence = evidenceMap.get(statementId);
    if (!evidence) {
      violations.push(`Missing evidenceMap entry for statementId "${statementId}".`);
      continue;
    }

    if (normalizeText(evidence.statement) !== normalizeText(statement)) {
      violations.push(`Evidence statement text mismatch for statementId "${statementId}".`);
    }

    if (evidence.sourceRefs.length === 0) {
      violations.push(`No sourceRefs were provided for statementId "${statementId}".`);
      continue;
    }

    for (const sourceRef of evidence.sourceRefs) {
      if (!isSourceRefSupported(resume, sourceRef.relationType, sourceRef.relationSqid, sourceRef.quote)) {
        violations.push(`Unsupported sourceRef for statementId "${statementId}" using relationType "${sourceRef.relationType}".`);
      }
    }
  }

  for (const evidence of tailoring.evidenceMap) {
    if (!statementMap.has(evidence.statementId)) {
      violations.push(`evidenceMap contains unknown statementId "${evidence.statementId}".`);
    }
  }

  return violations;
}

function collectTailoredStatements(tailoring: ResumeTailoringOutput): Map<string, string> {
  const statements = new Map<string, string>();

  statements.set(tailoring.tailoredResume.headline.statementId, tailoring.tailoredResume.headline.text);

  for (const item of tailoring.tailoredResume.professionalSummary) {
    statements.set(item.statementId, item.text);
  }

  for (const item of tailoring.tailoredResume.keySkills) {
    statements.set(item.statementId, item.text);
  }

  for (const experience of tailoring.tailoredResume.experiences) {
    for (const bullet of experience.bullets) {
      statements.set(bullet.statementId, bullet.text);
    }
  }

  for (const education of tailoring.tailoredResume.education) {
    for (const highlight of education.highlights) {
      statements.set(highlight.statementId, highlight.text);
    }
  }

  for (const certification of tailoring.tailoredResume.certifications) {
    statements.set(certification.highlight.statementId, certification.highlight.text);
  }

  return statements;
}

function isSourceRefSupported(
  resume: ResumeWithRelationsResponse,
  relationType: string,
  relationSqid: string | undefined,
  quote: string,
): boolean {
  const normalizedQuote = normalizeText(quote);
  if (!normalizedQuote) {
    return false;
  }

  switch (relationType) {
    case "experience": {
      const match = resume.employmentHistory.find((item) => item.employmentSqid === relationSqid);
      return match ? containsNormalized(JSON.stringify(match), normalizedQuote) : false;
    }
    case "education": {
      const match = resume.education.find((item) => item.educationSqid === relationSqid);
      return match ? containsNormalized(JSON.stringify(match), normalizedQuote) : false;
    }
    case "certification": {
      const match = resume.certificates.find((item) => item.certificationSqid === relationSqid);
      return match ? containsNormalized(JSON.stringify(match), normalizedQuote) : false;
    }
    case "resume":
    case "general":
      return containsNormalized(JSON.stringify(resume), normalizedQuote);
    default:
      return false;
  }
}

function containsNormalized(source: string, target: string): boolean {
  return normalizeText(source).includes(target);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function formatEvidenceList(values: string[]): string {
  const normalized = values.filter((value) => value.trim()).slice(0, 3);
  return normalized.length > 0 ? normalized.join(", ") : "your current subjects";
}

function buildOpportunityQueries(targetRole: string, input: CompanyRecommendationSearchInput): string[] {
  const location = input.location ?? "";
  const employment = input.employmentType.length > 0 ? input.employmentType.join(" ") : "internship entry level";
  const workSetup = input.workSetup.length > 0 ? input.workSetup.join(" ") : "";

  return [
    `${targetRole} ${employment} ${location}`.trim(),
    `${targetRole} student internship ${location}`.trim(),
    `${targetRole} entry level ${workSetup} ${location}`.trim(),
    `companies hiring ${targetRole} interns ${location}`.trim(),
  ].filter((query, index, queries) => query.length > 0 && queries.indexOf(query) === index);
}

async function runSearches(
  searchService: PublicWebSearchService,
  queries: string[],
  maxResults: number,
): Promise<PublicSearchResult[]> {
  const seenUrls = new Set<string>();
  const results: PublicSearchResult[] = [];

  for (const query of queries) {
    const queryResults = await searchService.search(query, maxResults);
    for (const result of queryResults) {
      const normalizedUrl = normalizeUrlForDedupe(result.url);
      if (!normalizedUrl || seenUrls.has(normalizedUrl)) {
        continue;
      }

      seenUrls.add(normalizedUrl);
      results.push(result);

      if (results.length >= maxResults) {
        return results;
      }
    }
  }

  return results;
}

function collectResumeTerms(resume: ResumeWithRelationsResponse): string[] {
  const terms = new Set<string>();
  const source = JSON.stringify(resume).toLowerCase();
  for (const token of source.match(/[a-z][a-z0-9+#.-]{2,}/g) ?? []) {
    if (token.length <= 2 || commonWords.has(token)) {
      continue;
    }

    terms.add(token);
  }

  return [...terms].slice(0, 60);
}

function scoreSearchResult(
  result: PublicSearchResult,
  targetRole: string,
  input: CompanyRecommendationSearchInput,
  resumeTerms: string[],
  searchedAt: string,
) {
  const haystack = `${result.title} ${result.snippet}`.toLowerCase();
  const targetTokens = targetRole.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) ?? [];
  const matchedTargetTokens = targetTokens.filter((token) => haystack.includes(token));
  const matchedResumeTerms = resumeTerms.filter((term) => haystack.includes(term)).slice(0, 10);
  const locationMatched = input.location ? haystack.includes(input.location.toLowerCase()) : false;
  const workSetupMatched = input.workSetup.find((setup) => haystack.includes(setup.toLowerCase()));
  const employmentTypeMatched = input.employmentType.find((type) => haystack.includes(type.toLowerCase()));
  const score = Math.min(
    100,
    45
      + matchedTargetTokens.length * 10
      + matchedResumeTerms.length * 3
      + (locationMatched ? 10 : 0)
      + (workSetupMatched ? 5 : 0)
      + (employmentTypeMatched ? 5 : 0),
  );
  const requiredSkills = inferRequiredSkills(haystack);
  const missingSkills = requiredSkills.filter(
    (skill) => !matchedResumeTerms.some((term) => skill.toLowerCase().includes(term) || term.includes(skill.toLowerCase())),
  );

  return {
    recommendationSqid: null,
    companyName: inferCompanyName(result),
    roleTitle: inferRoleTitle(result, targetRole),
    matchScore: score,
    matchLevel: getMatchLevel(score),
    whyItMatches: buildMatchExplanation(targetRole, matchedTargetTokens, matchedResumeTerms, locationMatched),
    requiredSkills,
    studentMatchingSkills: matchedResumeTerms.slice(0, 8),
    missingSkills: missingSkills.slice(0, 8),
    location: input.location ?? null,
    workSetup: workSetupMatched ?? "unknown",
    employmentType: employmentTypeMatched ?? input.employmentType[0] ?? null,
    sourceUrl: result.url,
    sourceDomain: getSourceDomain(result.url),
    recommendedAction: missingSkills.length > 0
      ? "Review the posting and improve resume evidence for the missing skills before applying."
      : "Review the source link and consider applying.",
    status: null,
    savedAt: null,
    searchedAt,
  };
}

function normalizeUrlForDedupe(value: string): string | null {
  try {
    const url = new URL(value.trim());
    url.hash = "";
    url.searchParams.sort();
    return url.toString().toLowerCase();
  } catch {
    return null;
  }
}

function isPublicJobSuggestionResult(result: PublicSearchResult): boolean {
  let url: URL;
  try {
    url = new URL(result.url.trim());
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.toLowerCase();
  const haystack = `${host} ${path} ${result.title} ${result.snippet}`.toLowerCase();

  if (blockedJobSuggestionHosts.some((blockedHost) => host === blockedHost || host.endsWith(`.${blockedHost}`))) {
    return false;
  }

  if (blockedJobSuggestionPathSegments.some((segment) => path.includes(segment))) {
    return false;
  }

  return jobSuggestionSignals.some((signal) => haystack.includes(signal));
}

function getSourceDomain(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function inferCompanyName(result: PublicSearchResult): string {
  const title = result.title.trim();
  const separatorMatch = title.split(/\s[-|]\s/).find((part) => part.trim().length > 0);
  if (separatorMatch) {
    return separatorMatch.trim().slice(0, 200);
  }

  try {
    return new URL(result.url).hostname.replace(/^www\./, "").slice(0, 200);
  } catch {
    return "Source company";
  }
}

function inferRoleTitle(result: PublicSearchResult, targetRole: string): string {
  const title = result.title.trim();
  return title.toLowerCase().includes(targetRole.toLowerCase())
    ? title.slice(0, 200)
    : targetRole;
}

function inferRequiredSkills(haystack: string): string[] {
  const knownSkills = [
    "Java",
    "SQL",
    "REST API",
    "Git",
    "JavaScript",
    "React",
    "Testing",
    "Docker",
    "Communication",
    "Documentation",
  ];

  return knownSkills.filter((skill) => haystack.includes(skill.toLowerCase())).slice(0, 10);
}

function buildMatchExplanation(
  targetRole: string,
  matchedTargetTokens: string[],
  matchedResumeTerms: string[],
  locationMatched: boolean,
): string {
  const evidence = [
    matchedTargetTokens.length > 0 ? `the source text matches the target role "${targetRole}"` : null,
    matchedResumeTerms.length > 0 ? `resume terms also appear in the source: ${matchedResumeTerms.slice(0, 5).join(", ")}` : null,
    locationMatched ? "the source appears to match the requested location" : null,
  ].filter((item): item is string => Boolean(item));

  return evidence.length > 0
    ? evidence.join("; ") + "."
    : `The result is related to ${targetRole}, but the source has limited matching detail.`;
}

function getMatchLevel(score: number): string {
  if (score >= 85) return "Strong Match";
  if (score >= 70) return "Good Match";
  if (score >= 50) return "Possible Match";
  return "Weak Match";
}

const blockedJobSuggestionHosts = [
  "google.com",
  "bing.com",
  "duckduckgo.com",
  "search.yahoo.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
];

const blockedJobSuggestionPathSegments = [
  "/login",
  "/signin",
  "/sign-in",
  "/auth",
  "/account",
  "/search",
];

const jobSuggestionSignals = [
  "career",
  "careers",
  "job",
  "jobs",
  "opening",
  "position",
  "greenhouse.io",
  "lever.co",
  "workdayjobs.com",
  "smartrecruiters.com",
  "ashbyhq.com",
  "bamboohr.com",
];

const commonWords = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "this",
  "that",
  "your",
  "resume",
  "student",
  "education",
  "experience",
  "history",
  "summary",
]);
