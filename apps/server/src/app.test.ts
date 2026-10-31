import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { Executor, TestCase } from "./judge/types.js";
import type { Problem, ProblemRepository } from "./problems/repository.js";
import type { NewSubmission, SubmissionRepository } from "./submissions/repository.js";

const problem: Problem = {
  id: 1,
  slug: "a-plus-b",
  title: "A + B",
  difficulty: "easy",
  statementMd: "Add.",
  timeLimitMs: 1000,
  memoryLimitKb: 256000,
};
const tests: TestCase[] = [
  { ordinal: 1, input: "1 2\n", expectedOutput: "3\n", isSample: true },
  { ordinal: 2, input: "40 2\n", expectedOutput: "42\n", isSample: false },
];

const problems: ProblemRepository = {
  list: async () => [problem],
  getBySlug: async (slug) => (slug === problem.slug ? problem : null),
  getTests: async (_id, { samplesOnly }) => (samplesOnly ? tests.filter((t) => t.isSample) : tests),
};

function setup() {
  const saved: NewSubmission[] = [];
  const submissions: SubmissionRepository = {
    create: async (s) => {
      saved.push(s);
      return { id: "sub-1", createdAt: new Date() };
    },
  };
  // "Runs" the program by summing the two numbers in the input — i.e. a correct solution.
  const executor: Executor = {
    name: "fake",
    runBatch: async (_l, source, inputs) =>
      inputs.map((input) => {
        const [a, b] = input.trim().split(" ").map(Number);
        const stdout = source === "wrong" ? "0" : String(a! + b!);
        return { status: "ok", stdout, stderr: "", timeMs: 5, memoryKb: null };
      }),
  };
  return { app: createApp({ problems, submissions, executor }), saved };
}

describe("API", () => {
  it("lists problems", async () => {
    const res = await request(setup().app).get("/api/problems");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({ slug: "a-plus-b" })]);
  });

  it("returns a problem with samples only", async () => {
    const res = await request(setup().app).get("/api/problems/a-plus-b");
    expect(res.status).toBe(200);
    expect(res.body.samples).toEqual([{ input: "1 2\n", output: "3\n" }]);
  });

  it("404s on an unknown problem", async () => {
    const res = await request(setup().app).get("/api/problems/nope");
    expect(res.status).toBe(404);
  });

  it("run mode judges samples only", async () => {
    const { app, saved } = setup();
    const res = await request(app)
      .post("/api/submissions")
      .send({ problemSlug: "a-plus-b", language: "python", source: "ok", mode: "run" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ verdict: "accepted", passed: 1, total: 1, mode: "run" });
    expect(saved[0]).toMatchObject({ mode: "run", verdict: "accepted" });
  });

  it("submit mode judges all tests and hides hidden data", async () => {
    const res = await request(setup().app)
      .post("/api/submissions")
      .send({ problemSlug: "a-plus-b", language: "cpp", source: "wrong", mode: "submit" });
    expect(res.body).toMatchObject({ verdict: "wrong_answer", passed: 0, total: 2 });
    expect(res.body.tests[1]).toEqual({ ordinal: 2, verdict: "wrong_answer", timeMs: 5, isSample: false });
  });

  it("validates the request body", async () => {
    const res = await request(setup().app)
      .post("/api/submissions")
      .send({ problemSlug: "a-plus-b", language: "cobol", source: "x", mode: "submit" });
    expect(res.status).toBe(400);
  });
});
