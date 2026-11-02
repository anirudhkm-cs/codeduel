// Mirrors the API's response shapes.

export type Difficulty = "easy" | "medium" | "hard";

export type Verdict =
  | "accepted"
  | "wrong_answer"
  | "time_limit_exceeded"
  | "memory_limit_exceeded"
  | "runtime_error"
  | "compile_error"
  | "internal_error";

export interface Language {
  id: string;
  label: string;
  monaco: string;
  starter: string;
}

export interface ProblemSummary {
  id: number;
  slug: string;
  title: string;
  difficulty: Difficulty;
}

export interface Problem extends ProblemSummary {
  statementMd: string;
  timeLimitMs: number;
  memoryLimitKb: number;
  samples: { input: string; output: string }[];
}

export interface TestResult {
  ordinal: number;
  verdict: Verdict;
  timeMs: number | null;
  isSample: boolean;
  input?: string;
  expectedOutput?: string;
  actualOutput?: string;
  stderr?: string;
}

export type SubmissionStatus = "queued" | "running" | "done" | "failed";

/** GET /api/submissions/:id and each event on its /events stream. */
export interface Submission {
  id: string;
  mode: "run" | "submit";
  status: SubmissionStatus;
  result?: JudgeResult;
  error?: string;
}

export interface JudgeResult {
  verdict: Verdict;
  passed: number;
  total: number;
  maxTimeMs: number | null;
  compileOutput?: string;
  tests: TestResult[];
}
