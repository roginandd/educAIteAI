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
  jobMatchIntelligenceOutputSchema,
  type CompanyRecommendationSearchInput,
  type JobMatchIntelligenceOutput,
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
    private readonly jobMatchIntelligenceRunner: Runner,
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
    const deterministicQueries = buildOpportunityQueries(targetRole, parsedInput);
    const searchPlan = await this.generateJobMatchSearchPlan(resume, parsedInput, targetRole)
      .catch(() => ({ plannedQueries: deterministicQueries, results: [] }));
    const searchPasses = buildOpportunitySearchPasses(targetRole, parsedInput, searchPlan.plannedQueries, deterministicQueries);
    const searchOutcome = await runOpportunitySearchPasses(
      this.publicWebSearchService,
      searchPasses,
      Math.max(parsedInput.maxResults * 5, 30),
      Math.max(parsedInput.maxResults, 6),
    );
    const queries = searchOutcome.queries;
    const searchResults = searchOutcome.results;
    const discoveredJobResults = await discoverBoardJobPostingResults(
      searchResults,
      targetRole,
      parsedInput,
      Math.max(parsedInput.maxResults * 3, 18),
    );
    const publicJobResults = mergePublicSearchResults(
      searchResults.filter(isPublicJobSuggestionResult),
      discoveredJobResults,
      Math.max(parsedInput.maxResults * 3, 18),
    );
    const jobCandidates = await fetchPublicJobOpportunityCandidates(publicJobResults, Math.min(parsedInput.maxResults * 3, 18));
    const resumeTerms = collectResumeTerms(resume);
    const searchedAt = new Date().toISOString();

    const intelligenceResults = jobCandidates.length > 0
      ? await this.generateJobMatchIntelligence(resume, parsedInput, targetRole, queries, jobCandidates, searchedAt)
        .then((output) => normalizeJobMatchIntelligenceResults(
          output,
          jobCandidates,
          searchedAt,
          parsedInput.maxResults,
          targetRole,
          parsedInput,
          resumeTerms,
        ))
        .catch(() => [])
      : [];

    const results = (intelligenceResults.length > 0 ? intelligenceResults : publicJobResults
      .map((result) => scoreSearchResult(result, targetRole, parsedInput, resumeTerms, searchedAt))
      .filter((result) => result.matchScore >= 50)
      .sort((left, right) => right.matchScore - left.matchScore)
      .slice(0, parsedInput.maxResults));

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

  private async generateJobMatchSearchPlan(
    resume: ResumeWithRelationsResponse,
    input: CompanyRecommendationSearchInput,
    targetRole: string,
  ): Promise<JobMatchIntelligenceOutput> {
    const message: Content = {
      role: "user",
      parts: [{ text: buildJobMatchSearchPlanningPrompt(resume, input, targetRole) }],
    };

    return this.structuredAgentRunnerService.runStructuredPrompt({
      runner: this.jobMatchIntelligenceRunner,
      userId: `resume_service_job_match_plan_${input.resumeSqid}`,
      message,
      outputKey: "job_match_intelligence_output",
      outputSchema: jobMatchIntelligenceOutputSchema,
      invalidJsonMessage: "Job match search planner returned invalid JSON.",
      noResponseMessage: "Job match search planner did not return a final response.",
    });
  }

  private async generateJobMatchIntelligence(
    resume: ResumeWithRelationsResponse,
    input: CompanyRecommendationSearchInput,
    targetRole: string,
    plannedQueries: string[],
    candidates: JobOpportunityCandidate[],
    searchedAt: string,
  ): Promise<JobMatchIntelligenceOutput> {
    const message: Content = {
      role: "user",
      parts: [{ text: buildJobMatchEvaluationPrompt(resume, input, targetRole, plannedQueries, candidates, searchedAt) }],
    };

    return this.structuredAgentRunnerService.runStructuredPrompt({
      runner: this.jobMatchIntelligenceRunner,
      userId: `resume_service_job_match_evaluation_${input.resumeSqid}`,
      message,
      outputKey: "job_match_intelligence_output",
      outputSchema: jobMatchIntelligenceOutputSchema,
      invalidJsonMessage: "Job match intelligence agent returned invalid JSON.",
      noResponseMessage: "Job match intelligence agent did not return a final response.",
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

function buildJobMatchSearchPlanningPrompt(
  resume: ResumeWithRelationsResponse,
  input: CompanyRecommendationSearchInput,
  targetRole: string,
): string {
  return [
    "Plan public web searches for student job opportunities.",
    "Return only JSON.",
    'Return exactly this shape: {"plannedQueries":["..."],"results":[]}',
    "Rules:",
    "- Return 8 to 12 concise search queries.",
    "- Use the target role, student evidence, requested location, work setup, and employment type.",
    "- Include student, intern, junior, or entry-level phrasing when appropriate.",
    "- Include related role names, skill-aware searches, and Philippines-aware terms when useful.",
    "- Keep results empty for this planning step.",
    "",
    "Search input:",
    JSON.stringify({
      targetRole,
      location: input.location ?? null,
      workSetup: input.workSetup,
      employmentType: input.employmentType,
      maxResults: input.maxResults,
    }),
    "",
    "Resume payload:",
    JSON.stringify(resume),
  ].join("\n");
}

function buildJobMatchEvaluationPrompt(
  resume: ResumeWithRelationsResponse,
  input: CompanyRecommendationSearchInput,
  targetRole: string,
  plannedQueries: string[],
  candidates: JobOpportunityCandidate[],
  searchedAt: string,
): string {
  return [
    "Evaluate these public job candidates against one student resume.",
    "Return only JSON.",
    'Return exactly this shape: {"plannedQueries":["..."],"results":[{"recommendationSqid":null,"companyName":"...","roleTitle":"...","matchScore":0,"matchLevel":"Strong Match|Good Match|Possible Match|Weak Match","whyItMatches":"...","requiredSkills":["..."],"studentMatchingSkills":["..."],"missingSkills":["..."],"location":"...","workSetup":"Remote|Hybrid|Onsite|unknown","employmentType":"...","sourceUrl":"https://...","sourceDomain":"...","recommendedAction":"...","matchIntelligence":{"jobUnderstanding":{"requiredSkills":["..."],"niceToHaveSkills":["..."],"experienceLevel":"...","confidence":0.8},"fitBreakdown":{"skillMatch":0,"roleMatch":0,"locationCompatibility":0,"educationMatch":0,"careerGoalMatch":0,"freshnessConfidence":0},"matchReasons":["..."],"gapReasons":["..."],"recommendedActions":[{"type":"resume_update|flashcard_generation|certificate_suggestion|project_recommendation|learning_action","label":"..."}],"roadmap":{"summary":"...","targetFitScore":82,"generatedFrom":"gemini","items":[{"timeline":"today|this_week|this_month|next_60_days","priority":"high|medium|low","skill":"...","title":"...","reason":"...","actions":["..."],"outcome":"...","resources":[{"title":"...","url":"https://...","type":"article|course|documentation|video|practice|certificate|job_posting"}]}],"betterFitRoles":["..."]},"aiConfidence":0.8},"status":null,"savedAt":null,"searchedAt":"..."}]}',
    "Rules:",
    "- Preserve sourceUrl exactly from candidate input.",
    "- Return only real job/career pages with enough evidence.",
    "- Use pageText when present; use snippet only when pageText is unavailable.",
    "- Every returned result must include a non-null matchIntelligence object.",
    "- Score fit from 0 to 100 using student evidence and job requirements.",
    "- matchIntelligence.jobUnderstanding.requiredSkills must reflect the posting evidence.",
    "- Extract missingSkills for technical and non-technical roles, including marketing, operations, design, sales, and support roles.",
    "- Infer workSetup from posting evidence; if unclear, use the requested work setup instead of returning unknown.",
    "- recommendedAction should summarize the highest-value next step.",
    "- recommendedActions are display-only Improve My Fit and roadmap actions. Include Today, This week, and This month actions when gaps exist.",
    "- matchIntelligence.roadmap is REQUIRED for every result. Do not omit it. Set generatedFrom to gemini.",
    "- The roadmap must be personalized, not a generic template: tie every item to this student's resume evidence, this exact job posting, and the detected skill gaps.",
    "- The roadmap must answer the next best move, what to learn, what project/proof to create, what resume change to make, and what adjacent roles may fit better.",
    "- Roadmap items must include priority, timeline, reason, concrete actions, expected outcome, and resources when useful.",
    "- Use specific verbs and concrete deliverables. Avoid repeated deterministic wording such as 'study basics' unless the posting evidence truly warrants it.",
    "- Resource URLs must be valid public http/https links; omit url when you are uncertain.",
    "- Use betterFitRoles for adjacent roles that better use the student's existing strengths when this job is weakly aligned.",
    "- searchedAt must be the provided searchedAt value.",
    "- Return at most maxResults results.",
    "",
    "Evaluation input:",
    JSON.stringify({
      targetRole,
      location: input.location ?? null,
      workSetup: input.workSetup,
      employmentType: input.employmentType,
      maxResults: input.maxResults,
      plannedQueries,
      searchedAt,
    }),
    "",
    "Resume payload:",
    JSON.stringify(resume),
    "",
    "Candidates:",
    JSON.stringify(candidates),
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

interface JobOpportunityCandidate {
  title: string;
  url: string;
  snippet: string;
  sourceDomain: string;
  pageText: string | null;
}

interface OpportunitySearchPass {
  name: string;
  queries: string[];
  maxResultsPerQuery: number;
}

interface OpportunitySearchOutcome {
  results: PublicSearchResult[];
  queries: string[];
  completedPasses: string[];
}

type CompanyRecommendationResult = JobMatchIntelligenceOutput["results"][number];

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

function buildOpportunitySearchPasses(
  targetRole: string,
  input: CompanyRecommendationSearchInput,
  plannedQueries: string[],
  deterministicQueries: string[],
): OpportunitySearchPass[] {
  return [
    {
      name: "planned",
      queries: mergeOpportunityQueries(plannedQueries, deterministicQueries, 12),
      maxResultsPerQuery: 8,
    },
    {
      name: "expanded",
      queries: buildExpandedOpportunityQueries(targetRole, input),
      maxResultsPerQuery: 8,
    },
    {
      name: "targeted",
      queries: buildTargetedOpportunityQueries(targetRole, input),
      maxResultsPerQuery: 6,
    },
  ].filter((pass) => pass.queries.length > 0);
}

function mergeOpportunityQueries(plannedQueries: string[], fallbackQueries: string[], maxQueries = 12): string[] {
  return [...plannedQueries, ...fallbackQueries]
    .map((query) => query.trim())
    .filter((query, index, queries) => query.length > 0 && queries.indexOf(query) === index)
    .slice(0, maxQueries);
}

function buildExpandedOpportunityQueries(targetRole: string, input: CompanyRecommendationSearchInput): string[] {
  const location = input.location ?? "Philippines";
  const employment = input.employmentType.length > 0 ? input.employmentType.join(" ") : "internship entry level fresh graduate";
  const workSetup = input.workSetup.length > 0 ? input.workSetup.join(" ") : "remote hybrid onsite";

  return mergeOpportunityQueries([], [
    `${targetRole} ${employment} jobs ${location}`,
    `${targetRole} junior jobs ${location}`,
    `${targetRole} student internship ${location}`,
    `${targetRole} OJT internship Philippines`,
    `${targetRole} fresh graduate hiring Philippines`,
    `${targetRole} ${workSetup} careers Philippines`,
    `${targetRole} hiring students Philippines`,
    `${targetRole} graduate trainee Philippines`,
    `entry level ${targetRole} company careers ${location}`,
    `internship ${targetRole} apply ${location}`,
    `remote ${targetRole} internship Philippines`,
    `campus hiring ${targetRole} Philippines`,
  ], 12);
}

function buildTargetedOpportunityQueries(targetRole: string, input: CompanyRecommendationSearchInput): string[] {
  const location = input.location ?? "Philippines";
  const employment = input.employmentType.length > 0 ? input.employmentType[0] : "internship";
  const domains = [
    "greenhouse.io",
    "lever.co",
    "workdayjobs.com",
    "smartrecruiters.com",
    "ashbyhq.com",
    "jobstreet.com.ph",
    "kalibrr.com",
    "indeed.com",
  ];

  return domains.flatMap((domain) => [
    `site:${domain} ${targetRole} ${location}`,
    `site:${domain} ${targetRole} ${employment}`,
  ]).slice(0, 12);
}

async function runOpportunitySearchPasses(
  searchService: PublicWebSearchService,
  passes: OpportunitySearchPass[],
  maxResults: number,
  minPublicJobResults: number,
): Promise<OpportunitySearchOutcome> {
  const seenUrls = new Set<string>();
  const seenQueries = new Set<string>();
  const results: PublicSearchResult[] = [];
  const queries: string[] = [];
  const completedPasses: string[] = [];

  for (const pass of passes) {
    completedPasses.push(pass.name);

    for (const query of pass.queries) {
      const normalizedQuery = query.trim();
      if (!normalizedQuery || seenQueries.has(normalizedQuery.toLowerCase())) {
        continue;
      }

      seenQueries.add(normalizedQuery.toLowerCase());
      queries.push(normalizedQuery);

      const queryResults = await searchService.search(normalizedQuery, pass.maxResultsPerQuery).catch(() => []);
      for (const result of queryResults) {
        const normalizedUrl = normalizeUrlForDedupe(result.url);
        if (!normalizedUrl || seenUrls.has(normalizedUrl)) {
          continue;
        }

        seenUrls.add(normalizedUrl);
        results.push(result);

        if (results.length >= maxResults) {
          return { results, queries, completedPasses };
        }
      }
    }

    if (results.filter(isPublicJobSuggestionResult).length >= minPublicJobResults) {
      break;
    }
  }

  return { results, queries, completedPasses };
}

async function fetchPublicJobOpportunityCandidates(
  searchResults: PublicSearchResult[],
  maxCandidates: number,
): Promise<JobOpportunityCandidate[]> {
  const candidates = await Promise.all(
    searchResults.slice(0, Math.max(0, maxCandidates)).map(async (result) => ({
      title: result.title,
      url: result.url,
      snippet: result.snippet,
      sourceDomain: getSourceDomain(result.url),
      pageText: await fetchPublicJobPageText(result.url),
    })),
  );

  return candidates;
}

async function discoverBoardJobPostingResults(
  searchResults: PublicSearchResult[],
  targetRole: string,
  input: CompanyRecommendationSearchInput,
  maxResults: number,
): Promise<PublicSearchResult[]> {
  const discoveryPages = mergeDiscoveryPages(
    searchResults.filter(isJobBoardDiscoveryPageResult).map((result) => ({
      name: result.title,
      url: result.url,
    })),
    buildJobBoardDiscoveryPages(targetRole, input),
    12,
  );
  const discoveredResults: PublicSearchResult[] = [];
  const seenUrls = new Set<string>();

  for (const page of discoveryPages) {
    const html = await fetchPublicHtml(page.url, 5000);
    if (!html) {
      continue;
    }

    for (const result of extractJobPostingResultsFromHtml(page.url, html, targetRole)) {
      const normalizedUrl = normalizeUrlForDedupe(result.url);
      if (!normalizedUrl || seenUrls.has(normalizedUrl)) {
        continue;
      }

      seenUrls.add(normalizedUrl);
      discoveredResults.push(result);

      if (discoveredResults.length >= maxResults) {
        return discoveredResults;
      }
    }
  }

  return discoveredResults;
}

interface JobBoardDiscoveryPage {
  name: string;
  url: string;
}

function buildJobBoardDiscoveryPages(
  targetRole: string,
  input: CompanyRecommendationSearchInput,
): JobBoardDiscoveryPage[] {
  const location = input.location ?? "Philippines";
  const employment = input.employmentType[0] ?? "Internship";
  const query = `${targetRole} ${employment} ${location}`.replace(/\s+/g, " ").trim();
  const encodedQuery = encodeURIComponent(query);
  const encodedRole = encodeURIComponent(targetRole);
  const encodedLocation = encodeURIComponent(location);

  return [
    {
      name: "JobStreet Philippines",
      url: `https://www.jobstreet.com.ph/en/job-search/${encodedRole}-jobs-in-${encodedLocation}/`,
    },
    {
      name: "Kalibrr",
      url: `https://www.kalibrr.com/job-board/te/${encodedQuery}`,
    },
    {
      name: "Indeed Philippines",
      url: `https://ph.indeed.com/jobs?q=${encodedQuery}`,
    },
  ];
}

function mergeDiscoveryPages(
  primaryPages: JobBoardDiscoveryPage[],
  fallbackPages: JobBoardDiscoveryPage[],
  maxPages: number,
): JobBoardDiscoveryPage[] {
  const seenUrls = new Set<string>();
  const merged: JobBoardDiscoveryPage[] = [];

  for (const page of [...primaryPages, ...fallbackPages]) {
    const normalizedUrl = normalizeUrlForDedupe(page.url);
    if (!normalizedUrl || seenUrls.has(normalizedUrl)) {
      continue;
    }

    seenUrls.add(normalizedUrl);
    merged.push(page);

    if (merged.length >= maxPages) {
      break;
    }
  }

  return merged;
}

function extractJobPostingResultsFromHtml(
  sourceUrl: string,
  html: string,
  targetRole: string,
): PublicSearchResult[] {
  const results: PublicSearchResult[] = [];
  const anchorPattern = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  const seenUrls = new Set<string>();

  for (const match of html.matchAll(anchorPattern)) {
    const href = match[2]?.trim();
    if (!href || href.startsWith("#") || href.toLowerCase().startsWith("javascript:")) {
      continue;
    }

    const url = toAbsoluteUrl(href, sourceUrl);
    if (!url || !isSpecificJobPostingUrl(url)) {
      continue;
    }

    const normalizedUrl = normalizeUrlForDedupe(url);
    if (!normalizedUrl || seenUrls.has(normalizedUrl)) {
      continue;
    }

    const anchorIndex = match.index ?? 0;
    const anchorText = cleanHtmlText(match[3] ?? "");
    const nearbyText = cleanHtmlText(html.slice(Math.max(0, anchorIndex - 600), anchorIndex + 1800));
    const title = choosePostingTitle(anchorText, nearbyText, targetRole);
    if (!title) {
      continue;
    }

    seenUrls.add(normalizedUrl);
    results.push({
      title,
      url,
      snippet: nearbyText.slice(0, 500) || `${title} public job posting.`,
    });
  }

  return results;
}

function toAbsoluteUrl(href: string, sourceUrl: string): string | null {
  try {
    const url = new URL(href, sourceUrl);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function choosePostingTitle(anchorText: string, nearbyText: string, targetRole: string): string | null {
  const normalizedAnchor = anchorText.trim();
  const weakLabels = ["apply", "apply now", "view", "view job", "view details", "learn more", "read more"];
  if (normalizedAnchor.length >= 6 && !weakLabels.includes(normalizedAnchor.toLowerCase())) {
    return normalizedAnchor.slice(0, 200);
  }

  const targetTokens = targetRole.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) ?? [];
  const sentence = nearbyText
    .split(/(?<=[.!?])\s+|\s{2,}/)
    .map((part) => part.trim())
    .find((part) => {
      const lower = part.toLowerCase();
      return part.length >= 8 && targetTokens.some((token) => lower.includes(token));
    });

  return sentence ? sentence.slice(0, 200) : null;
}

function cleanHtmlText(value: string): string {
  return decodeHtmlEntities(value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2f;/gi, "/");
}

function mergePublicSearchResults(
  primaryResults: PublicSearchResult[],
  fallbackResults: PublicSearchResult[],
  maxResults: number,
): PublicSearchResult[] {
  const seenUrls = new Set<string>();
  const merged: PublicSearchResult[] = [];

  for (const result of [...primaryResults, ...fallbackResults]) {
    const normalizedUrl = normalizeUrlForDedupe(result.url);
    if (!normalizedUrl || seenUrls.has(normalizedUrl)) {
      continue;
    }

    seenUrls.add(normalizedUrl);
    merged.push(result);

    if (merged.length >= maxResults) {
      break;
    }
  }

  return merged;
}

async function fetchPublicHtml(url: string, timeoutMs = 4000): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
        "User-Agent": "EducAIteAI/1.0 job-match-intelligence",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType && !contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return null;
    }

    const text = await response.text();
    return text.trim().length > 0 ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchPublicJobPageText(url: string): Promise<string | null> {
  const html = await fetchPublicHtml(url, 4000);
  return html ? cleanFetchedPageText(html) : null;
}

function cleanFetchedPageText(value: string): string | null {
  const cleaned = decodeHtmlEntities(value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim());

  return cleaned.length >= 240 ? cleaned.slice(0, 7000) : null;
}

function normalizeJobMatchIntelligenceResults(
  output: JobMatchIntelligenceOutput,
  candidates: JobOpportunityCandidate[],
  searchedAt: string,
  maxResults: number,
  targetRole: string,
  input: CompanyRecommendationSearchInput,
  resumeTerms: string[],
) {
  const candidateUrls = new Map<string, string>();
  const candidateByUrl = new Map<string, JobOpportunityCandidate>();
  for (const candidate of candidates) {
    const normalizedUrl = normalizeUrlForDedupe(candidate.url);
    if (normalizedUrl) {
      candidateUrls.set(normalizedUrl, candidate.url);
      candidateByUrl.set(normalizedUrl, candidate);
    }
  }

  return output.results
    .map((result) => {
      const normalizedUrl = normalizeUrlForDedupe(result.sourceUrl);
      const sourceUrl = normalizedUrl ? candidateUrls.get(normalizedUrl) : undefined;
      if (!sourceUrl) {
        return null;
      }

      const normalizedResult = {
        ...result,
        recommendationSqid: result.recommendationSqid ?? null,
        sourceUrl,
        sourceDomain: result.sourceDomain ?? getSourceDomain(sourceUrl),
        matchLevel: getMatchLevel(result.matchScore),
        status: result.status ?? null,
        savedAt: null,
        searchedAt,
      };

      return ensureRecommendationIntelligence(
        normalizedResult,
        targetRole,
        input,
        resumeTerms,
        searchedAt,
        candidateByUrl.get(normalizedUrl ?? ""),
      );
    })
    .filter((result): result is NonNullable<typeof result> => result !== null)
    .filter((result) => result.matchScore >= 50)
    .sort((left, right) => right.matchScore - left.matchScore)
    .slice(0, maxResults);
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

function ensureRecommendationIntelligence(
  result: CompanyRecommendationResult,
  targetRole: string,
  input: CompanyRecommendationSearchInput,
  resumeTerms: string[],
  searchedAt: string,
  candidate?: JobOpportunityCandidate,
): CompanyRecommendationResult {
  const evidence = buildJobEvidenceText(result, candidate);
  const targetTokens = targetRole.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) ?? [];
  const matchedTargetTokens = targetTokens.filter((token) => evidence.toLowerCase().includes(token));
  const requiredSkills = mergeUniqueValues([
    ...result.requiredSkills,
    ...(result.matchIntelligence?.jobUnderstanding.requiredSkills ?? []),
    ...inferRequiredSkills(evidence),
  ]).slice(0, 30);
  const studentMatchingSkills = mergeUniqueValues([
    ...result.studentMatchingSkills,
    ...requiredSkills.filter((skill) => resumeHasSkillEvidence(skill, resumeTerms)),
  ]).slice(0, 30);
  const missingSkills = mergeUniqueValues([
    ...result.missingSkills,
    ...requiredSkills.filter((skill) => !resumeHasSkillEvidence(skill, resumeTerms)),
  ]).slice(0, 30);
  const location = result.location ?? inferLocation(evidence, input);
  const workSetup = normalizeWorkSetup(result.workSetup, evidence, input);
  const employmentType = result.employmentType ?? inferEmploymentType(evidence, input);
  const skillMatch = requiredSkills.length > 0
    ? Math.round((studentMatchingSkills.length / requiredSkills.length) * 100)
    : result.matchScore;
  const roleMatch = matchedTargetTokens.length > 0
    ? Math.min(100, 55 + matchedTargetTokens.length * 15)
    : Math.max(45, result.matchScore - 15);
  const locationCompatibility = input.location
    ? (location?.toLowerCase().includes(input.location.toLowerCase()) || evidence.toLowerCase().includes(input.location.toLowerCase()) ? 100 : 60)
    : 80;
  const sourceConfidence = candidate?.pageText ? 82 : 62;
  const existing = result.matchIntelligence ?? null;
  const matchReasons = existing?.matchReasons.length
    ? existing.matchReasons
    : [buildMatchExplanation(targetRole, matchedTargetTokens, studentMatchingSkills, Boolean(location))];
  const gapReasons = existing?.gapReasons.length
    ? existing.gapReasons
    : buildGapReasons(missingSkills, requiredSkills);
  const recommendedActions = mergeRecommendedActions(
    existing?.recommendedActions ?? [],
    buildRoadmapActions(missingSkills, studentMatchingSkills, targetRole),
  );
  const roadmap = existing?.roadmap ?? buildStructuredRoadmap(
    result,
    targetRole,
    missingSkills,
    studentMatchingSkills,
    recommendedActions,
  );

  return {
    ...result,
    requiredSkills,
    studentMatchingSkills,
    missingSkills,
    location,
    workSetup,
    employmentType,
    recommendedAction: buildRecommendedAction(result.recommendedAction, missingSkills),
    matchIntelligence: {
      jobUnderstanding: {
        requiredSkills,
        niceToHaveSkills: mergeUniqueValues(existing?.jobUnderstanding.niceToHaveSkills ?? []).slice(0, 30),
        experienceLevel: existing?.jobUnderstanding.experienceLevel ?? inferExperienceLevel(evidence, employmentType),
        confidence: existing?.jobUnderstanding.confidence ?? (candidate?.pageText ? 0.78 : 0.58),
      },
      fitBreakdown: {
        skillMatch: clampPercentNumber(existing?.fitBreakdown.skillMatch ?? skillMatch),
        roleMatch: clampPercentNumber(existing?.fitBreakdown.roleMatch ?? roleMatch),
        locationCompatibility: clampPercentNumber(existing?.fitBreakdown.locationCompatibility ?? locationCompatibility),
        educationMatch: clampPercentNumber(existing?.fitBreakdown.educationMatch ?? 70),
        careerGoalMatch: clampPercentNumber(existing?.fitBreakdown.careerGoalMatch ?? Math.max(50, roleMatch - 5)),
        freshnessConfidence: clampPercentNumber(existing?.fitBreakdown.freshnessConfidence ?? sourceConfidence),
      },
      matchReasons: matchReasons.slice(0, 8),
      gapReasons: gapReasons.slice(0, 8),
      recommendedActions: recommendedActions.slice(0, 8),
      roadmap,
      aiConfidence: existing?.aiConfidence ?? (candidate?.pageText ? 0.72 : 0.55),
    },
    searchedAt,
  };
}

function scoreSearchResult(
  result: PublicSearchResult,
  targetRole: string,
  input: CompanyRecommendationSearchInput,
  resumeTerms: string[],
  searchedAt: string,
) {
  const rawHaystack = `${result.title} ${result.snippet}`;
  const haystack = rawHaystack.toLowerCase();
  const targetTokens = targetRole.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) ?? [];
  const matchedTargetTokens = targetTokens.filter((token) => haystack.includes(token));
  const matchedResumeTerms = resumeTerms.filter((term) => haystack.includes(term)).slice(0, 10);
  const locationMatched = input.location ? haystack.includes(input.location.toLowerCase()) : false;
  const workSetupMatched = inferWorkSetup(rawHaystack, input);
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

  return ensureRecommendationIntelligence({
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
    workSetup: workSetupMatched,
    employmentType: employmentTypeMatched ?? input.employmentType[0] ?? null,
    sourceUrl: result.url,
    sourceDomain: getSourceDomain(result.url),
    recommendedAction: missingSkills.length > 0
      ? "Review the posting and improve resume evidence for the missing skills before applying."
      : "Review the source link and consider applying.",
    status: null,
    savedAt: null,
    searchedAt,
    matchIntelligence: null,
  }, targetRole, input, resumeTerms, searchedAt);
}

function buildJobEvidenceText(result: CompanyRecommendationResult, candidate?: JobOpportunityCandidate): string {
  return [
    candidate?.title,
    candidate?.snippet,
    candidate?.pageText,
    result.companyName,
    result.roleTitle,
    result.whyItMatches,
    result.requiredSkills.join(" "),
    result.missingSkills.join(" "),
  ].filter((value): value is string => Boolean(value?.trim())).join(" ");
}

function mergeUniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(normalized);
  }

  return merged;
}

function resumeHasSkillEvidence(skill: string, resumeTerms: string[]): boolean {
  const normalizedSkill = skill.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();
  const skillTokens = normalizedSkill.split(/\s+/).filter(Boolean);

  return skillTokens.some((token) => resumeTerms.includes(token))
    || resumeTerms.some((term) => normalizedSkill.includes(term) || term.includes(normalizedSkill));
}

function normalizeWorkSetup(
  currentValue: string,
  evidence: string,
  input: CompanyRecommendationSearchInput,
): string {
  if (currentValue && currentValue.toLowerCase() !== "unknown") {
    return currentValue;
  }

  return inferWorkSetup(evidence, input);
}

function inferWorkSetup(evidence: string, input: CompanyRecommendationSearchInput): string {
  const lower = evidence.toLowerCase();

  if (/\b(remote|work from home|wfh|anywhere|fully distributed)\b/.test(lower)) {
    return "Remote";
  }

  if (/\b(hybrid|days onsite|days on-site|office days)\b/.test(lower)) {
    return "Hybrid";
  }

  if (/\b(onsite|on-site|office based|office-based|in office|in-office)\b/.test(lower)) {
    return "Onsite";
  }

  if (input.workSetup.length > 0) {
    return input.workSetup.slice(0, 2).join(" / ");
  }

  return "Not specified";
}

function inferLocation(evidence: string, input: CompanyRecommendationSearchInput): string | null {
  if (input.location?.trim()) {
    return input.location.trim();
  }

  const knownLocations = [
    "Manila",
    "Makati",
    "Taguig",
    "Quezon City",
    "Pasig",
    "Mandaluyong",
    "Cebu",
    "Davao",
    "Philippines",
    "Remote",
  ];
  const lower = evidence.toLowerCase();

  return knownLocations.find((location) => lower.includes(location.toLowerCase())) ?? null;
}

function inferEmploymentType(evidence: string, input: CompanyRecommendationSearchInput): string | null {
  const lower = evidence.toLowerCase();
  const matchedInput = input.employmentType.find((type) => lower.includes(type.toLowerCase()));
  if (matchedInput) {
    return matchedInput;
  }

  if (/\b(internship|intern|ojt)\b/.test(lower)) return "Internship";
  if (/\b(entry level|entry-level|junior|fresh graduate|graduate)\b/.test(lower)) return "Entry-level";
  if (/\b(part time|part-time)\b/.test(lower)) return "Part-time";
  if (/\b(contract|contractor)\b/.test(lower)) return "Contract";

  return input.employmentType[0] ?? null;
}

function inferExperienceLevel(evidence: string, employmentType: string | null | undefined): string {
  const lower = evidence.toLowerCase();

  if (employmentType === "Internship" || /\b(internship|intern|ojt|student)\b/.test(lower)) {
    return "Student / Intern";
  }

  if (employmentType === "Entry-level" || /\b(entry level|entry-level|junior|fresh graduate)\b/.test(lower)) {
    return "Entry-level";
  }

  return "Not specified";
}

function buildGapReasons(missingSkills: string[], requiredSkills: string[]): string[] {
  if (missingSkills.length > 0) {
    return missingSkills.slice(0, 5).map((skill) => `No clear resume evidence for ${skill}.`);
  }

  if (requiredSkills.length > 0) {
    return ["No critical missing skills were detected from the available posting evidence."];
  }

  return ["The posting has limited skill detail, so verify requirements before applying."];
}

function buildRoadmapActions(
  missingSkills: string[],
  studentMatchingSkills: string[],
  targetRole: string,
): NonNullable<CompanyRecommendationResult["matchIntelligence"]>["recommendedActions"] {
  const primaryGap = missingSkills[0];
  const strongestSkill = studentMatchingSkills[0];
  const actions: NonNullable<CompanyRecommendationResult["matchIntelligence"]>["recommendedActions"] = [
    {
      type: "resume_update",
      label: `Today: Tailor the resume summary and top skills toward ${targetRole}.`,
    },
  ];

  if (primaryGap) {
    actions.push(
      {
        type: "learning_action",
        label: `This week: Study ${primaryGap} basics and collect 3 examples from real job posts.`,
      },
      {
        type: "project_recommendation",
        label: `This month: Build a small proof-of-skill project or portfolio item that demonstrates ${primaryGap}.`,
      },
    );
  }

  if (strongestSkill) {
    actions.push({
      type: "resume_update",
      label: `Future direction: Keep ${strongestSkill} visible; it may point to adjacent roles if this job underuses it.`,
    });
  }

  if (missingSkills.length > 1) {
    actions.push({
      type: "flashcard_generation",
      label: `Practice interview flashcards for ${missingSkills.slice(0, 3).join(", ")}.`,
    });
  }

  return actions;
}

function buildStructuredRoadmap(
  result: CompanyRecommendationResult,
  targetRole: string,
  missingSkills: string[],
  studentMatchingSkills: string[],
  recommendedActions: NonNullable<CompanyRecommendationResult["matchIntelligence"]>["recommendedActions"],
): NonNullable<NonNullable<CompanyRecommendationResult["matchIntelligence"]>["roadmap"]> {
  const primaryGap = missingSkills[0];
  const strongestSkill = studentMatchingSkills[0];
  const items: NonNullable<NonNullable<CompanyRecommendationResult["matchIntelligence"]>["roadmap"]>["items"] = [
    {
      timeline: "today",
      priority: "high",
      skill: primaryGap ?? null,
      title: `Tailor your resume for ${result.roleTitle}`,
      reason: primaryGap
        ? `${primaryGap} is not clearly proven in the resume yet.`
        : "A targeted application should still show role-specific evidence.",
      actions: [
        `Rewrite the summary toward ${targetRole}.`,
        primaryGap ? `Add one bullet that shows exposure to ${primaryGap}.` : "Move the strongest matching evidence near the top.",
      ],
      outcome: "A recruiter can see the role fit without hunting through the resume.",
      resources: [],
    },
  ];

  if (primaryGap) {
    items.push(
      {
        timeline: "this_week",
        priority: "high",
        skill: primaryGap,
        title: `Build working knowledge of ${primaryGap}`,
        reason: `${primaryGap} appears as a gap for this job.`,
        actions: [
          `Study the fundamentals of ${primaryGap}.`,
          "Create notes or flashcards for interview terms and examples.",
          "Collect examples from 3 similar postings.",
        ],
        outcome: `You can explain ${primaryGap} confidently in screening or interview conversations.`,
        resources: [
          {
            title: `Search learning resources for ${primaryGap}`,
            url: `https://www.google.com/search?q=${encodeURIComponent(`${primaryGap} basics tutorial`)}`,
            type: "practice",
          },
        ],
      },
      {
        timeline: "this_month",
        priority: "medium",
        skill: primaryGap,
        title: `Create proof for ${primaryGap}`,
        reason: "A small concrete artifact is stronger than only listing a skill.",
        actions: [
          `Build a small project, campaign, case study, or portfolio item that demonstrates ${primaryGap}.`,
          "Add the artifact to the resume or portfolio.",
        ],
        outcome: "The missing skill becomes visible evidence instead of an unsupported claim.",
        resources: [],
      },
    );
  }

  if (strongestSkill) {
    items.push({
      timeline: "next_60_days",
      priority: "low",
      skill: strongestSkill,
      title: `Use ${strongestSkill} to guide better-fit searches`,
      reason: "This is already visible in the resume and may point to adjacent opportunities.",
      actions: [
        `Search for ${strongestSkill} internships related to ${targetRole}.`,
        "Compare those postings with this job before applying broadly.",
      ],
      outcome: "The student can pursue roles that better use existing strengths while closing this job's gaps.",
      resources: [],
    });
  }

  return {
    summary: primaryGap
      ? `Prioritize ${primaryGap}, then turn it into resume evidence for ${result.roleTitle}.`
      : `Use the roadmap to make the application more specific for ${result.roleTitle}.`,
    targetFitScore: Math.min(100, Math.max(result.matchScore + 10, 75)),
    generatedFrom: "fallback",
    items: items.slice(0, 8),
    betterFitRoles: buildBetterFitRoles(strongestSkill, targetRole),
  };
}

function buildBetterFitRoles(strongestSkill: string | undefined, targetRole: string): string[] {
  if (!strongestSkill) {
    return [];
  }

  return mergeUniqueValues([
    `${strongestSkill} Intern`,
    `Junior ${strongestSkill} Assistant`,
    `${targetRole} with ${strongestSkill}`,
  ]).slice(0, 3);
}

function mergeRecommendedActions(
  primaryActions: NonNullable<CompanyRecommendationResult["matchIntelligence"]>["recommendedActions"],
  fallbackActions: NonNullable<CompanyRecommendationResult["matchIntelligence"]>["recommendedActions"],
): NonNullable<CompanyRecommendationResult["matchIntelligence"]>["recommendedActions"] {
  const seen = new Set<string>();
  const merged: NonNullable<CompanyRecommendationResult["matchIntelligence"]>["recommendedActions"] = [];

  for (const action of [...primaryActions, ...fallbackActions]) {
    const key = `${action.type}:${action.label.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(action);
  }

  return merged;
}

function buildRecommendedAction(currentValue: string, missingSkills: string[]): string {
  const isGeneric = /review (the source link|this job link)|consider applying/i.test(currentValue);
  if (!isGeneric) {
    return currentValue;
  }

  return missingSkills.length > 0
    ? `Before applying, strengthen evidence for ${missingSkills.slice(0, 3).join(", ")}.`
    : "Review the posting details and tailor the resume before applying.";
}

function clampPercentNumber(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
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

  return isSpecificJobPostingUrl(url.toString()) && jobSuggestionSignals.some((signal) => haystack.includes(signal));
}

function isJobBoardDiscoveryPageResult(result: PublicSearchResult): boolean {
  try {
    const url = new URL(result.url.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.toLowerCase();
    const query = url.search.toLowerCase();

    return [
      host.endsWith("jobstreet.com.ph") && path.includes("job-search"),
      host.endsWith("kalibrr.com") && path.includes("/job-board/"),
      host.endsWith("indeed.com") && path.includes("/jobs") && query.includes("q="),
    ].some(Boolean);
  } catch {
    return false;
  }
}

function isSpecificJobPostingUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.toLowerCase();
  const search = url.search.toLowerCase();
  const searchKeys = [...url.searchParams.keys()].map((key) => key.toLowerCase());

  if (blockedJobSuggestionHosts.some((blockedHost) => host === blockedHost || host.endsWith(`.${blockedHost}`))) {
    return false;
  }

  if (path === "/" && searchKeys.some((key) => ["q", "query", "search", "keyword", "keywords"].includes(key))) {
    return false;
  }

  if (path.includes("/job-search") || path.includes("/jobs/search") || path.includes("/job-board/te/")) {
    return false;
  }

  if (host.endsWith("indeed.com")) {
    return path.includes("/viewjob") && url.searchParams.has("jk");
  }

  if (host.endsWith("jobstreet.com.ph")) {
    return /\/job\/\d+/.test(path) || /\/job\/[a-z0-9-]+/.test(path);
  }

  if (host.endsWith("kalibrr.com")) {
    return /\/c\/[^/]+\/jobs\/\d+/i.test(path) || /\/jobs\/\d+/i.test(path);
  }

  if (host.endsWith("greenhouse.io") || host.endsWith("ashbyhq.com")) {
    return path.includes("/jobs/") || search.includes("gh_jid=");
  }

  if (host.endsWith("lever.co")) {
    return path.split("/").filter(Boolean).length >= 2;
  }

  if (host.endsWith("smartrecruiters.com")) {
    return path.split("/").filter(Boolean).length >= 2 && !path.includes("/search");
  }

  if (host.endsWith("workdayjobs.com")) {
    return path.includes("/job/");
  }

  return path.includes("/job/") || path.includes("/jobs/") || path.includes("/careers/");
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
    "TypeScript",
    "HTML",
    "CSS",
    "Node.js",
    "Python",
    "Testing",
    "Docker",
    "Communication",
    "Documentation",
    "Excel",
    "Data Analysis",
    "Analytics",
    "Research",
    "Social Media",
    "Content Creation",
    "Influencer Marketing",
    "Campaign Management",
    "Marketing",
    "Copywriting",
    "SEO",
    "Customer Service",
    "Sales",
    "Canva",
    "Figma",
    "Project Management",
    "Teamwork",
  ];
  const lower = haystack.toLowerCase();
  const inferred = knownSkills.filter((skill) => lower.includes(skill.toLowerCase()));

  if (/\b(marketing|influencer|social media|campaign|content)\b/.test(lower)) {
    inferred.push("Marketing", "Communication", "Social Media", "Campaign Management");
  }

  if (/\b(frontend|front-end|web developer|react|javascript)\b/.test(lower)) {
    inferred.push("JavaScript", "HTML", "CSS", "Git");
  }

  if (/\b(data|analytics|reporting|excel|sql)\b/.test(lower)) {
    inferred.push("Data Analysis", "Excel", "SQL");
  }

  return mergeUniqueValues(inferred).slice(0, 10);
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
