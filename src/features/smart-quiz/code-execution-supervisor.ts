import {
  codeExecutionOutputSchema,
  type CodeExecutionOutput,
  type ExecuteSmartQuizCodeInput,
} from "./smart-quiz.dto";

export interface CodeExecutionSupervisor {
  execute(input: ExecuteSmartQuizCodeInput): Promise<CodeExecutionOutput>;
}

export class DisabledCodeExecutionSupervisor implements CodeExecutionSupervisor {
  async execute(input: ExecuteSmartQuizCodeInput): Promise<CodeExecutionOutput> {
    return codeExecutionOutputSchema.parse({
      executionStatus: "sandboxUnavailable",
      compileStatus: "notRun",
      runtimeStatus: "notRun",
      stdout: "",
      stderr: "",
      visibleTestsPassed: 0,
      visibleTestsTotal: input.visibleTests.length,
      hiddenTestsPassed: 0,
      hiddenTestsTotal: input.hiddenTests.length,
      message: "Code execution sandbox is not configured. The service accepted the request but did not run untrusted code.",
    });
  }
}

type Judge0Language = ExecuteSmartQuizCodeInput["language"];

type Judge0SubmissionResponse = {
  token?: string;
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  status?: {
    id?: number;
    description?: string;
  } | null;
};

type Judge0CodeExecutionSupervisorOptions = {
  baseUrl: string;
  apiKey?: string;
  apiKeyHeader?: string;
};

type Judge0BatchCreateResponseItem = {
  token?: string;
  error?: string;
  [key: string]: unknown;
};

type Judge0BatchGetResponse = {
  submissions?: Array<Judge0SubmissionResponse | null>;
};

const judge0LanguageIds: Record<Judge0Language, number> = {
  cpp: 54,
  csharp: 51,
  java: 62,
  python: 71,
  javascript: 63,
  sql: 82,
};

type NormalizedJudge0TestCase = {
  name: string;
  stdin: string;
  expectedOutput: string;
  visibility: "visible" | "hidden" | "meta";
};

type DetailedExecutionResult = {
  testCase: NormalizedJudge0TestCase;
  actualOutput: string;
  stderr: string;
  statusId: number | undefined;
  statusDescription: string;
  passed: boolean;
};

export class Judge0CodeExecutionSupervisor implements CodeExecutionSupervisor {
  private static readonly pollingIntervalMs = 150;
  private static readonly maxPollingWindowMs = 15_000;

  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly apiKeyHeader: string;

  constructor(options: Judge0CodeExecutionSupervisorOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey?.trim() || undefined;
    this.apiKeyHeader = options.apiKeyHeader?.trim() || "X-Auth-Token";
  }

  async execute(input: ExecuteSmartQuizCodeInput): Promise<CodeExecutionOutput> {
    const testCases = [
      ...input.visibleTests.map((testCase, index) => normalizeJudge0TestCase(testCase, "visible", index)),
      ...input.hiddenTests.map((testCase, index) => normalizeJudge0TestCase(testCase, "hidden", index)),
    ];
    if (testCases.length === 0) {
      testCases.push({
        name: "Compilation Check",
        stdin: "",
        expectedOutput: "",
        visibility: "meta",
      });
    }

    const submissions = await this.createSubmissionBatch(input, testCases);
    const results = testCases.map((testCase, index) =>
      toDetailedExecutionResult(testCase, submissions[index] ?? internalErrorSubmission("Judge0 returned an incomplete batch response.")));

    return this.toExecutionOutput(input, results);
  }

  private async createSubmissionBatch(
    input: ExecuteSmartQuizCodeInput,
    testCases: NormalizedJudge0TestCase[],
  ): Promise<Judge0SubmissionResponse[]> {
    const createResponse = await fetch(`${this.baseUrl}/submissions/batch?base64_encoded=false`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...this.authHeaders(),
      },
      body: JSON.stringify({
        submissions: testCases.map((testCase) => ({
          language_id: judge0LanguageIds[input.language],
          source_code: input.studentCode,
          stdin: testCase.stdin,
          expected_output: testCase.expectedOutput,
          cpu_time_limit: Math.max(1, Math.ceil(input.limits.timeoutMs / 1000)),
          wall_time_limit: Math.max(1, Math.ceil(input.limits.timeoutMs / 1000) + 1),
          memory_limit: input.limits.memoryMb * 1024,
        })),
      }),
    });

    const createBody = await createResponse.text();
    if (!createResponse.ok) {
      return testCases.map(() => internalErrorSubmission(`Judge0 request failed with status ${createResponse.status}`, createBody));
    }

    const batch = JSON.parse(createBody) as Judge0BatchCreateResponseItem[];
    const tokens = batch.map((item) => typeof item?.token === "string" ? item.token : "");

    if (tokens.some((token) => !token)) {
      return batch.map((item) =>
        typeof item?.token === "string"
          ? queuedSubmission(item.token)
          : internalErrorSubmission("Judge0 rejected one or more submissions in the batch.", JSON.stringify(item)));
    }

    return this.pollSubmissionBatch(tokens);
  }

  private async pollSubmissionBatch(tokens: string[]): Promise<Judge0SubmissionResponse[]> {
    const deadline = Date.now() + Judge0CodeExecutionSupervisor.maxPollingWindowMs;

    while (Date.now() < deadline) {
      const response = await fetch(
        `${this.baseUrl}/submissions/batch?base64_encoded=false&tokens=${encodeURIComponent(tokens.join(","))}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            ...this.authHeaders(),
          },
        },
      );

      const body = await response.text();
      if (!response.ok) {
        return tokens.map(() => internalErrorSubmission(`Judge0 polling failed with status ${response.status}`, body));
      }

      const parsed = JSON.parse(body) as Judge0BatchGetResponse;
      const submissions = parsed.submissions ?? [];
      if (submissions.length !== tokens.length) {
        return tokens.map(() => internalErrorSubmission("Judge0 polling returned an unexpected submission count."));
      }

      const normalized = submissions.map((submission, index) =>
        submission ?? internalErrorSubmission("Judge0 polling returned an empty submission result.", tokens[index]));

      if (normalized.every((submission) => !isPendingStatus(submission.status?.id))) {
        return normalized;
      }

      await delay(Judge0CodeExecutionSupervisor.pollingIntervalMs);
    }

    return tokens.map(() => internalErrorSubmission("Judge0 polling timed out before all test cases completed."));
  }

  private authHeaders(): Record<string, string> {
    return this.apiKey ? { [this.apiKeyHeader]: this.apiKey } : {};
  }

  private toExecutionOutput(input: ExecuteSmartQuizCodeInput, results: DetailedExecutionResult[]): CodeExecutionOutput {
    const firstCompileError = results.find((result) => result.statusId === 6);
    const firstRuntimeError = results.find((result) => isRuntimeErrorStatus(result.statusId));
    const firstTimeout = results.find((result) => result.statusId === 5);
    const firstMemoryError = results.find((result) => result.statusId === 8);
    const firstError = firstCompileError ?? firstRuntimeError ?? firstTimeout ?? firstMemoryError;

    const visibleResults = results.filter((result) => result.testCase.visibility === "visible");
    const hiddenResults = results.filter((result) => result.testCase.visibility === "hidden");
    const visibleTestsPassed = visibleResults.filter((result) => result.passed).length;
    const hiddenTestsPassed = hiddenResults.filter((result) => result.passed).length;
    const allPassed = visibleTestsPassed === input.visibleTests.length && hiddenTestsPassed === input.hiddenTests.length;

    return codeExecutionOutputSchema.parse({
      executionStatus: toExecutionStatus(firstError?.statusId, allPassed),
      compileStatus: firstCompileError ? "failed" : "success",
      runtimeStatus: firstRuntimeError || firstTimeout || firstMemoryError ? "failed" : "completed",
      stdout: joinOutput(results, "actualOutput"),
      stderr: joinOutput(results, "stderr"),
      visibleTestsPassed,
      visibleTestsTotal: input.visibleTests.length,
      hiddenTestsPassed,
      hiddenTestsTotal: input.hiddenTests.length,
      message: buildExecutionMessage(firstError?.statusDescription, visibleTestsPassed, input.visibleTests.length, hiddenTestsPassed, input.hiddenTests.length),
      results: visibleResults.map((result) => ({
        name: result.testCase.name,
        passed: result.passed,
        input: result.testCase.stdin,
        expectedOutput: result.testCase.expectedOutput,
        actualOutput: result.actualOutput,
        stderr: result.stderr,
        status: result.statusDescription,
      })),
      hiddenSummary: {
        passed: hiddenTestsPassed,
        failed: Math.max(0, input.hiddenTests.length - hiddenTestsPassed),
        total: input.hiddenTests.length,
      },
    });
  }
}

function normalizeJudge0TestCase(
  testCase: Record<string, unknown>,
  visibility: "visible" | "hidden",
  index: number,
): NormalizedJudge0TestCase {
  return {
    name: stringifyTestValue(testCase.name ?? testCase.label ?? `Test ${index + 1}`),
    stdin: stringifyTestValue(testCase.stdin ?? testCase.input ?? ""),
    expectedOutput: stringifyTestValue(testCase.expected_output ?? testCase.expectedOutput ?? testCase.output ?? ""),
    visibility,
  };
}

function toDetailedExecutionResult(
  testCase: NormalizedJudge0TestCase,
  submission: Judge0SubmissionResponse,
): DetailedExecutionResult {
  const actualOutput = stringifyTestValue(submission.stdout ?? "");
  const stderr = stringifyTestValue(submission.stderr ?? submission.compile_output ?? submission.message ?? "");
  const statusDescription = submission.status?.description ?? "Completed";
  const statusId = submission.status?.id;

  return {
    testCase,
    actualOutput,
    stderr,
    statusId,
    statusDescription,
    passed: isSubmissionAccepted(statusId, actualOutput, testCase.expectedOutput),
  };
}

function stringifyTestValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return value == null ? "" : JSON.stringify(value);
}

function isPendingStatus(statusId: number | undefined): boolean {
  return statusId === 1 || statusId === 2 || statusId === undefined;
}

function queuedSubmission(token: string): Judge0SubmissionResponse {
  return {
    token,
    status: {
      id: 1,
      description: "In Queue",
    },
  };
}

function internalErrorSubmission(description: string, stderr = ""): Judge0SubmissionResponse {
  return {
    stderr,
    status: {
      id: 13,
      description,
    },
  };
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isRuntimeErrorStatus(statusId: number | undefined): boolean {
  return statusId !== undefined && statusId >= 7 && statusId <= 12 && statusId !== 8;
}

function isExecutionFailureStatus(statusId: number): boolean {
  return statusId === 5 || statusId === 6 || statusId === 8 || isRuntimeErrorStatus(statusId) || statusId === 13;
}

function isSubmissionAccepted(statusId: number | undefined, actualOutput: string, expectedOutput: string): boolean {
  if (statusId && isExecutionFailureStatus(statusId)) {
    return false;
  }

  if (!expectedOutput.trim()) {
    return true;
  }

  return normalizeOutput(actualOutput) === normalizeOutput(expectedOutput);
}

function toExecutionStatus(statusId: number | undefined, allPassed: boolean): CodeExecutionOutput["executionStatus"] {
  if (statusId === 6) {
    return "compileError";
  }

  if (statusId === 5) {
    return "timeout";
  }

  if (statusId === 8) {
    return "memoryLimitExceeded";
  }

  if (isRuntimeErrorStatus(statusId)) {
    return "runtimeError";
  }

  return allPassed ? "completed" : "completed";
}

function normalizeOutput(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function buildExecutionMessage(
  statusDescription: string | undefined,
  visibleTestsPassed: number,
  visibleTestsTotal: number,
  hiddenTestsPassed: number,
  hiddenTestsTotal: number,
): string {
  if (statusDescription) {
    return statusDescription;
  }

  const visibleSummary = `Passed ${visibleTestsPassed} of ${visibleTestsTotal} visible test${visibleTestsTotal === 1 ? "" : "s"}.`;
  if (hiddenTestsTotal === 0) {
    return visibleSummary;
  }

  return `${visibleSummary} Hidden tests passed: ${hiddenTestsPassed} of ${hiddenTestsTotal}.`;
}

function joinOutput(results: DetailedExecutionResult[], key: "actualOutput" | "stderr"): string {
  return results
    .map((result) => result[key])
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n")
    .slice(0, 4000);
}
