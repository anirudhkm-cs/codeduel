import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { z } from "zod";
import { judge } from "./judge/judge.js";
import { LANGUAGE_IDS, LANGUAGES } from "./judge/languages.js";
import type { Executor, LanguageId } from "./judge/types.js";
import type { ProblemRepository } from "./problems/repository.js";
import type { SubmissionRepository } from "./submissions/repository.js";

export interface AppDeps {
  problems: ProblemRepository;
  submissions: SubmissionRepository;
  executor: Executor;
  corsOrigin?: string;
}

const MAX_SOURCE_BYTES = 64 * 1024;

const submissionSchema = z.object({
  problemSlug: z.string().min(1),
  language: z.enum(LANGUAGE_IDS as [LanguageId, ...LanguageId[]]),
  source: z
    .string()
    .min(1, "Source code is empty")
    .refine((s) => Buffer.byteLength(s) <= MAX_SOURCE_BYTES, "Source code is larger than 64 KB"),
  mode: z.enum(["run", "submit"]),
});

/** Wrap async handlers so rejected promises reach the error middleware. */
const wrap =
  (fn: express.RequestHandler): express.RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.use(cors({ origin: deps.corsOrigin ?? true }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, executor: deps.executor.name });
  });

  app.get("/api/languages", (_req, res) => {
    res.json(
      Object.values(LANGUAGES).map(({ id, label, monaco, starter }) => ({ id, label, monaco, starter })),
    );
  });

  app.get(
    "/api/problems",
    wrap(async (_req, res) => {
      res.json(await deps.problems.list());
    }),
  );

  app.get(
    "/api/problems/:slug",
    wrap(async (req, res) => {
      const problem = await deps.problems.getBySlug(req.params.slug!);
      if (!problem) {
        res.status(404).json({ error: "Problem not found" });
        return;
      }
      const samples = await deps.problems.getTests(problem.id, { samplesOnly: true });
      res.json({
        ...problem,
        samples: samples.map((s) => ({ input: s.input, output: s.expectedOutput })),
      });
    }),
  );

  /**
   * Judge a submission.
   *   mode=run    -> sample tests only, full input/output shown
   *   mode=submit -> all tests, hidden test data never returned
   *
   * Milestone 1 judges synchronously in the request. Milestone 2 moves this
   * onto a BullMQ queue so slow submissions don't tie up the API.
   */
  app.post(
    "/api/submissions",
    wrap(async (req, res) => {
      const parsed = submissionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
        return;
      }
      const { problemSlug, language, source, mode } = parsed.data;

      const problem = await deps.problems.getBySlug(problemSlug);
      if (!problem) {
        res.status(404).json({ error: "Problem not found" });
        return;
      }

      const tests = await deps.problems.getTests(problem.id, { samplesOnly: mode === "run" });
      const result = await judge({
        executor: deps.executor,
        language,
        source,
        tests,
        limits: { timeLimitMs: problem.timeLimitMs, memoryLimitKb: problem.memoryLimitKb },
      });

      const saved = await deps.submissions.create({
        problemId: problem.id,
        language,
        source,
        mode,
        verdict: result.verdict,
        passed: result.passed,
        total: result.total,
        maxTimeMs: result.maxTimeMs,
      });

      res.json({ id: saved.id, mode, ...result });
    }),
  );

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "Something went wrong while judging. Please try again." });
  };
  app.use(onError);

  return app;
}
