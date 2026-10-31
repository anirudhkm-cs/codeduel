import { outputsMatch } from "./compare.js";
import type { ExecutionResult, Executor, LanguageId, Limits, TestCase, Verdict } from "./types.js";

export type JudgeMode = "run" | "submit";

export interface TestResult {
  ordinal: number;
  verdict: Verdict;
  timeMs: number | null;
  isSample: boolean;
  /** Only filled in for sample tests — hidden test data never leaves the server. */
  input?: string;
  expectedOutput?: string;
  actualOutput?: string;
  stderr?: string;
}

export interface JudgeResult {
  verdict: Verdict;
  passed: number;
  total: number;
  maxTimeMs: number | null;
  compileOutput?: string;
  tests: TestResult[];
}

const MAX_SHOWN_OUTPUT = 4_000;

function truncate(text: string): string {
  return text.length > MAX_SHOWN_OUTPUT ? text.slice(0, MAX_SHOWN_OUTPUT) + "\n…(truncated)" : text;
}

export function verdictFor(result: ExecutionResult, expected: string): Verdict {
  switch (result.status) {
    case "ok":
      return outputsMatch(result.stdout, expected) ? "accepted" : "wrong_answer";
    case "compile_error":
      return "compile_error";
    case "time_limit":
      return "time_limit_exceeded";
    case "memory_limit":
      return "memory_limit_exceeded";
    case "runtime_error":
      return "runtime_error";
    default:
      return "internal_error";
  }
}

/** Overall verdict = first failing test's verdict, or accepted if all pass. */
export function overallVerdict(verdicts: Verdict[]): Verdict {
  return verdicts.find((v) => v !== "accepted") ?? "accepted";
}

export async function judge(opts: {
  executor: Executor;
  language: LanguageId;
  source: string;
  tests: TestCase[];
  limits: Limits;
}): Promise<JudgeResult> {
  const { executor, language, source, tests, limits } = opts;
  if (tests.length === 0) throw new Error("Problem has no test cases");

  const results = await executor.runBatch(
    language,
    source,
    tests.map((t) => t.input),
    limits,
  );

  const compileFailure = results.find((r) => r.status === "compile_error");
  if (compileFailure) {
    return {
      verdict: "compile_error",
      passed: 0,
      total: tests.length,
      maxTimeMs: null,
      compileOutput: truncate(compileFailure.compileOutput ?? compileFailure.stderr),
      tests: tests.map((t) => ({
        ordinal: t.ordinal,
        verdict: "compile_error",
        timeMs: null,
        isSample: t.isSample,
      })),
    };
  }

  const testResults: TestResult[] = tests.map((test, i) => {
    const result = results[i];
    if (!result) {
      return { ordinal: test.ordinal, verdict: "internal_error", timeMs: null, isSample: test.isSample };
    }
    const base: TestResult = {
      ordinal: test.ordinal,
      verdict: verdictFor(result, test.expectedOutput),
      timeMs: result.timeMs,
      isSample: test.isSample,
    };
    if (!test.isSample) return base;
    return {
      ...base,
      input: test.input,
      expectedOutput: test.expectedOutput,
      actualOutput: truncate(result.stdout),
      stderr: result.stderr ? truncate(result.stderr) : undefined,
    };
  });

  const times = testResults.map((t) => t.timeMs).filter((t): t is number => t !== null);

  return {
    verdict: overallVerdict(testResults.map((t) => t.verdict)),
    passed: testResults.filter((t) => t.verdict === "accepted").length,
    total: testResults.length,
    maxTimeMs: times.length ? Math.max(...times) : null,
    tests: testResults,
  };
}
