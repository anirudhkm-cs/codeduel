import { describe, expect, it } from "vitest";
import { judge, overallVerdict } from "./judge.js";
import type { ExecutionResult, Executor, TestCase } from "./types.js";

const limits = { timeLimitMs: 1000, memoryLimitKb: 256000 };

/** Executor that returns canned results, one per input. */
function fakeExecutor(results: Partial<ExecutionResult>[]): Executor {
  return {
    name: "fake",
    runBatch: async (_l, _s, inputs) =>
      inputs.map((_, i) => ({
        status: "ok",
        stdout: "",
        stderr: "",
        timeMs: 10,
        memoryKb: null,
        ...results[i],
      })),
  };
}

const tests: TestCase[] = [
  { ordinal: 1, input: "1 2", expectedOutput: "3\n", isSample: true },
  { ordinal: 2, input: "5 5", expectedOutput: "10\n", isSample: false },
  { ordinal: 3, input: "0 0", expectedOutput: "0\n", isSample: false },
];

describe("judge", () => {
  it("accepts when every output matches", async () => {
    const r = await judge({
      executor: fakeExecutor([{ stdout: "3" }, { stdout: "10\n" }, { stdout: "0", timeMs: 50 }]),
      language: "python",
      source: "",
      tests,
      limits,
    });
    expect(r.verdict).toBe("accepted");
    expect(r.passed).toBe(3);
    expect(r.maxTimeMs).toBe(50);
  });

  it("reports the first failing verdict", async () => {
    const r = await judge({
      executor: fakeExecutor([{ stdout: "3" }, { stdout: "11" }, { status: "time_limit" }]),
      language: "python",
      source: "",
      tests,
      limits,
    });
    expect(r.verdict).toBe("wrong_answer");
    expect(r.passed).toBe(1);
    expect(r.tests.map((t) => t.verdict)).toEqual(["accepted", "wrong_answer", "time_limit_exceeded"]);
  });

  it("never leaks hidden test data", async () => {
    const r = await judge({
      executor: fakeExecutor([{ stdout: "3" }, { stdout: "nope", stderr: "boom" }, { stdout: "0" }]),
      language: "python",
      source: "",
      tests,
      limits,
    });
    expect(r.tests[0]).toMatchObject({ input: "1 2", expectedOutput: "3\n", actualOutput: "3" });
    for (const hidden of r.tests.slice(1)) {
      expect(hidden.input).toBeUndefined();
      expect(hidden.expectedOutput).toBeUndefined();
      expect(hidden.actualOutput).toBeUndefined();
      expect(hidden.stderr).toBeUndefined();
    }
  });

  it("collapses to a single compile error", async () => {
    const r = await judge({
      executor: fakeExecutor(tests.map(() => ({ status: "compile_error" as const, compileOutput: "error: ;" }))),
      language: "cpp",
      source: "",
      tests,
      limits,
    });
    expect(r.verdict).toBe("compile_error");
    expect(r.compileOutput).toBe("error: ;");
    expect(r.passed).toBe(0);
  });
});

describe("overallVerdict", () => {
  it("is accepted only when all are accepted", () => {
    expect(overallVerdict(["accepted", "accepted"])).toBe("accepted");
    expect(overallVerdict(["accepted", "runtime_error", "wrong_answer"])).toBe("runtime_error");
  });
});
