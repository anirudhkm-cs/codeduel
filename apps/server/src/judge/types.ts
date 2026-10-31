export type LanguageId = "python" | "javascript" | "cpp" | "java";

export interface Limits {
  timeLimitMs: number;
  memoryLimitKb: number;
}

/** What happened when the program ran on one input — before comparing output. */
export type RunStatus =
  | "ok"
  | "compile_error"
  | "runtime_error"
  | "time_limit"
  | "memory_limit"
  | "internal_error";

export interface ExecutionResult {
  status: RunStatus;
  stdout: string;
  stderr: string;
  compileOutput?: string;
  timeMs: number | null;
  memoryKb: number | null;
}

/**
 * A sandbox that can run one program against many inputs.
 * Implementations: LocalExecutor (dev only) and Judge0Executor.
 */
export interface Executor {
  readonly name: string;
  runBatch(
    language: LanguageId,
    source: string,
    inputs: string[],
    limits: Limits,
  ): Promise<ExecutionResult[]>;
}

/** Verdict for a single test after comparing output. */
export type Verdict =
  | "accepted"
  | "wrong_answer"
  | "time_limit_exceeded"
  | "memory_limit_exceeded"
  | "runtime_error"
  | "compile_error"
  | "internal_error";

export interface TestCase {
  ordinal: number;
  input: string;
  expectedOutput: string;
  isSample: boolean;
}
