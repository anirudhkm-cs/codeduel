import { LANGUAGES } from "../languages.js";
import type { ExecutionResult, Executor, LanguageId, Limits, RunStatus } from "../types.js";

/**
 * Runs code on a Judge0 CE instance using the batch API:
 *   1. POST /submissions/batch           -> tokens
 *   2. GET  /submissions/batch?tokens=…  -> poll until none are queued/processing
 * Docs: https://ce.judge0.com
 */

interface Judge0Status {
  id: number;
  description: string;
}

export interface Judge0Submission {
  token: string;
  status: Judge0Status;
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  time: string | null;
  memory: number | null;
}

const BATCH_SIZE = 20;
const FIELDS = "token,status,stdout,stderr,compile_output,message,time,memory";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const unb64 = (s: string | null) => (s ? Buffer.from(s, "base64").toString("utf8") : "");

/** Judge0 status ids: https://ce.judge0.com/#statuses-and-languages-status-get */
export function mapJudge0Status(id: number): RunStatus | "pending" {
  if (id === 1 || id === 2) return "pending"; // In Queue, Processing
  if (id === 3 || id === 4) return "ok"; // Accepted / WA — we compare output ourselves
  if (id === 5) return "time_limit";
  if (id === 6) return "compile_error";
  if (id >= 7 && id <= 12) return "runtime_error"; // SIGSEGV, SIGXFSZ, SIGFPE, SIGABRT, NZEC, Other
  return "internal_error"; // 13 Internal Error, 14 Exec Format Error
}

export function toExecutionResult(s: Judge0Submission): ExecutionResult {
  const status = mapJudge0Status(s.status.id);
  return {
    status: status === "pending" ? "internal_error" : status,
    stdout: unb64(s.stdout),
    stderr: unb64(s.stderr) || unb64(s.message),
    compileOutput: unb64(s.compile_output) || undefined,
    timeMs: s.time ? Math.round(parseFloat(s.time) * 1000) : null,
    memoryKb: s.memory,
  };
}

export interface Judge0Options {
  baseUrl: string;
  authToken?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class Judge0Executor implements Executor {
  readonly name = "judge0";
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(private readonly opts: Judge0Options) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.pollIntervalMs = opts.pollIntervalMs ?? 500;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.opts.authToken) h["X-Auth-Token"] = this.opts.authToken;
    return h;
  }

  private async request<T>(pathAndQuery: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${pathAndQuery}`, { ...init, headers: this.headers() });
    if (!res.ok) {
      throw new Error(`Judge0 ${init?.method ?? "GET"} ${pathAndQuery} failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  async runBatch(
    language: LanguageId,
    source: string,
    inputs: string[],
    limits: Limits,
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
      results.push(...(await this.runChunk(language, source, inputs.slice(i, i + BATCH_SIZE), limits)));
    }
    return results;
  }

  private async runChunk(
    language: LanguageId,
    source: string,
    inputs: string[],
    limits: Limits,
  ): Promise<ExecutionResult[]> {
    const submissions = inputs.map((stdin) => ({
      language_id: LANGUAGES[language].judge0Id,
      source_code: b64(source),
      stdin: b64(stdin),
      cpu_time_limit: limits.timeLimitMs / 1000,
      memory_limit: limits.memoryLimitKb,
    }));

    const created = await this.request<Array<{ token?: string; error?: string }>>(
      "/submissions/batch?base64_encoded=true",
      { method: "POST", body: JSON.stringify({ submissions }) },
    );
    const tokens = created.map((c) => {
      if (!c.token) throw new Error(`Judge0 rejected submission: ${JSON.stringify(c)}`);
      return c.token;
    });

    const deadline = Date.now() + this.timeoutMs;
    while (true) {
      const { submissions: polled } = await this.request<{ submissions: Judge0Submission[] }>(
        `/submissions/batch?tokens=${tokens.join(",")}&base64_encoded=true&fields=${FIELDS}`,
      );
      if (polled.every((s) => mapJudge0Status(s.status.id) !== "pending")) {
        return polled.map(toExecutionResult);
      }
      if (Date.now() > deadline) throw new Error("Timed out waiting for Judge0");
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));
    }
  }
}
