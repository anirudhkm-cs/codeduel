import { judge } from "../judge/judge.js";
import type { Executor } from "../judge/types.js";
import type { ProblemRepository } from "../problems/repository.js";
import type { SubmissionRepository } from "./repository.js";
import type { SubmissionUpdates } from "./updates.js";

export interface ProcessDeps {
  problems: ProblemRepository;
  submissions: SubmissionRepository;
  executor: Executor;
  updates: SubmissionUpdates;
}

/**
 * Judge one queued submission: queued → running → done.
 *
 * Throws if judging breaks (e.g. Judge0 is down) so the queue can retry.
 * On the final attempt the submission is marked 'failed' first, so clients
 * aren't left waiting on a job that will never finish.
 */
export async function processSubmission(
  deps: ProcessDeps,
  submissionId: string,
  { finalAttempt }: { finalAttempt: boolean },
): Promise<void> {
  const { problems, submissions, executor, updates } = deps;

  const submission = await submissions.get(submissionId);
  // Already finished: a duplicate or redelivered job. Nothing to do.
  if (!submission || submission.status === "done" || submission.status === "failed") return;

  try {
    await submissions.markRunning(submissionId);
    await updates.publish(submissionId);

    const problem = await problems.getById(submission.problemId);
    if (!problem) throw new Error(`Problem ${submission.problemId} no longer exists`);
    const tests = await problems.getTests(problem.id, { samplesOnly: submission.mode === "run" });

    const result = await judge({
      executor,
      language: submission.language,
      source: submission.source,
      tests,
      limits: { timeLimitMs: problem.timeLimitMs, memoryLimitKb: problem.memoryLimitKb },
    });

    await submissions.complete(submissionId, result);
    await updates.publish(submissionId);
  } catch (err) {
    if (finalAttempt) {
      await submissions.fail(submissionId, (err as Error).message ?? String(err));
      await updates.publish(submissionId);
    }
    throw err;
  }
}
