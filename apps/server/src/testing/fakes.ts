/** In-memory stand-ins for Postgres, Redis and the sandbox, shared by tests. */
import type { JudgeResult } from "../judge/judge.js";
import type { Executor, TestCase } from "../judge/types.js";
import type { Problem, ProblemRepository } from "../problems/repository.js";
import type { SubmissionQueue } from "../submissions/queue.js";
import type { NewSubmission, Submission, SubmissionRepository } from "../submissions/repository.js";

export const problem: Problem = {
  id: 1,
  slug: "a-plus-b",
  title: "A + B",
  difficulty: "easy",
  statementMd: "Add.",
  timeLimitMs: 1000,
  memoryLimitKb: 256000,
};

export const tests: TestCase[] = [
  { ordinal: 1, input: "1 2\n", expectedOutput: "3\n", isSample: true },
  { ordinal: 2, input: "40 2\n", expectedOutput: "42\n", isSample: false },
];

export const problems: ProblemRepository = {
  list: async () => [problem],
  getBySlug: async (slug) => (slug === problem.slug ? problem : null),
  getById: async (id) => (id === problem.id ? problem : null),
  getTests: async (_id, { samplesOnly }) => (samplesOnly ? tests.filter((t) => t.isSample) : tests),
};

/** "Runs" the program by summing the two input numbers; source "wrong" prints 0, "crash" throws. */
export const executor: Executor = {
  name: "fake",
  runBatch: async (_l, source, inputs) => {
    if (source === "crash") throw new Error("sandbox unreachable");
    return inputs.map((input) => {
      const [a, b] = input.trim().split(" ").map(Number);
      const stdout = source === "wrong" ? "0" : String(a! + b!);
      return { status: "ok", stdout, stderr: "", timeMs: 5, memoryKb: null };
    });
  },
};

export class MemorySubmissionRepository implements SubmissionRepository {
  readonly rows = new Map<string, Submission>();
  private nextId = 1;

  async create(s: NewSubmission): Promise<{ id: string; createdAt: Date }> {
    const id = `00000000-0000-4000-8000-${String(this.nextId++).padStart(12, "0")}`;
    const createdAt = new Date();
    this.rows.set(id, { ...s, id, status: "queued", result: null, error: null, createdAt });
    return { id, createdAt };
  }

  async get(id: string): Promise<Submission | null> {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async markRunning(id: string): Promise<void> {
    this.update(id, { status: "running" });
  }

  async complete(id: string, result: JudgeResult): Promise<void> {
    this.update(id, { status: "done", result, error: null });
  }

  async fail(id: string, error: string): Promise<void> {
    this.update(id, { status: "failed", error });
  }

  private update(id: string, patch: Partial<Submission>) {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, ...patch });
  }
}

/** Records enqueued ids; tests decide when (and whether) they get processed. */
export class ManualQueue implements SubmissionQueue {
  readonly ids: string[] = [];
  failWith: Error | null = null;

  async enqueue(submissionId: string): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.ids.push(submissionId);
  }

  async close(): Promise<void> {}
}
