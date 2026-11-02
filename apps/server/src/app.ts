import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import { z } from "zod";
import type { JudgeMode, JudgeResult } from "./judge/judge.js";
import { LANGUAGE_IDS, LANGUAGES } from "./judge/languages.js";
import type { LanguageId } from "./judge/types.js";
import type { ProblemRepository } from "./problems/repository.js";
import type { SubmissionQueue } from "./submissions/queue.js";
import type { Submission, SubmissionRepository, SubmissionStatus } from "./submissions/repository.js";
import type { SubmissionUpdates } from "./submissions/updates.js";

export interface AppDeps {
  problems: ProblemRepository;
  submissions: SubmissionRepository;
  queue: SubmissionQueue;
  updates: SubmissionUpdates;
  /** Which executor the workers use, for /api/health. */
  executorName: string;
  corsOrigin?: string;
}

/** What clients see of a submission. Never includes the source or internal errors. */
export interface SubmissionView {
  id: string;
  mode: JudgeMode;
  status: SubmissionStatus;
  result?: JudgeResult;
  error?: string;
}

export function toView(s: Submission): SubmissionView {
  return {
    id: s.id,
    mode: s.mode,
    status: s.status,
    ...(s.result ? { result: s.result } : {}),
    ...(s.status === "failed" ? { error: "The judge failed to run this submission. Please try again." } : {}),
  };
}

const isFinished = (status: SubmissionStatus) => status === "done" || status === "failed";

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
    res.json({ ok: true, executor: deps.executorName });
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
   * Queue a submission for judging. Returns 202 with its id right away;
   * follow progress via GET /api/submissions/:id or its /events stream.
   *   mode=run    -> sample tests only, full input/output shown
   *   mode=submit -> all tests, hidden test data never returned
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

      const saved = await deps.submissions.create({ problemId: problem.id, language, source, mode });
      try {
        await deps.queue.enqueue(saved.id);
      } catch (err) {
        console.error(`Could not enqueue submission ${saved.id}`, err);
        await deps.submissions.fail(saved.id, `enqueue failed: ${(err as Error).message}`);
        res.status(503).json({ error: "The judge is busy or offline. Please try again." });
        return;
      }

      res.status(202).json({ id: saved.id, mode, status: "queued" } satisfies SubmissionView);
    }),
  );

  app.get(
    "/api/submissions/:id",
    wrap(async (req, res) => {
      const submission = await deps.submissions.get(req.params.id!);
      if (!submission) {
        res.status(404).json({ error: "Submission not found" });
        return;
      }
      res.json(toView(submission));
    }),
  );

  /**
   * Server-Sent Events: sends the submission's current state, then a new
   * snapshot whenever it changes, and closes once it is done or failed.
   */
  app.get(
    "/api/submissions/:id/events",
    wrap(async (req, res) => {
      const id = req.params.id!;
      let closed = false;
      let lastSent = "";

      const send = async () => {
        const submission = await deps.submissions.get(id);
        if (closed || !submission) return;
        const data = JSON.stringify(toView(submission));
        if (data !== lastSent) {
          res.write(`data: ${data}\n\n`);
          lastSent = data;
        }
        if (isFinished(submission.status)) finish();
      };

      // Sends run one at a time, and only after the headers are written.
      let headersWritten!: () => void;
      let chain = new Promise<void>((resolve) => (headersWritten = resolve));
      const queueSend = () => {
        chain = chain.then(send).catch((err) => {
          console.error(`Submission stream ${id} failed`, err);
          finish();
        });
      };

      // Subscribe before the first read so no update can slip in between.
      const unsubscribe = deps.updates.subscribe((updatedId) => {
        if (updatedId === id) queueSend();
      });
      const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);
      const finish = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        res.end();
      };
      res.on("close", finish);

      let exists: boolean;
      try {
        exists = (await deps.submissions.get(id)) !== null;
      } catch (err) {
        finish();
        throw err;
      }
      if (!exists) {
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        res.status(404).json({ error: "Submission not found" });
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // stop nginx-style proxies from buffering the stream
      });
      queueSend();
      headersWritten();
    }),
  );

  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(500).json({ error: "Something went wrong while judging. Please try again." });
  };
  app.use(onError);

  return app;
}
