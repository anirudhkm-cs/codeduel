import { Queue, Worker } from "bullmq";
import { processSubmission, type ProcessDeps } from "./process.js";

/** Hands a submission to whatever judges it. */
export interface SubmissionQueue {
  enqueue(submissionId: string): Promise<void>;
  close(): Promise<void>;
}

export const QUEUE_NAME = "submissions";

interface JudgeJob {
  submissionId: string;
}

// BullMQ requires maxRetriesPerRequest: null for its blocking connections.
const connection = (url: string) => ({ url, maxRetriesPerRequest: null });

export class BullSubmissionQueue implements SubmissionQueue {
  private readonly queue: Queue<JudgeJob>;

  constructor(redisUrl: string, queueName = QUEUE_NAME) {
    this.queue = new Queue<JudgeJob>(queueName, {
      // Fail fast when Redis is down instead of hanging the HTTP request.
      connection: { url: redisUrl, enableOfflineQueue: false },
      defaultJobOptions: {
        // Retries cover the judge breaking (Judge0 unreachable, worker crash),
        // not wrong answers: those are normal 'done' results.
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }

  async enqueue(submissionId: string): Promise<void> {
    // jobId = submissionId, so enqueuing the same submission twice is a no-op.
    await this.queue.add("judge", { submissionId }, { jobId: submissionId });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

export function createSubmissionWorker(
  redisUrl: string,
  deps: ProcessDeps,
  { concurrency, queueName = QUEUE_NAME }: { concurrency: number; queueName?: string },
): Worker<JudgeJob> {
  const worker = new Worker<JudgeJob>(
    queueName,
    (job) =>
      processSubmission(deps, job.data.submissionId, {
        finalAttempt: job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
      }),
    { connection: connection(redisUrl), concurrency },
  );
  worker.on("failed", (job, err) => {
    console.error(`Judging ${job?.data.submissionId} failed (attempt ${job?.attemptsMade}):`, err.message);
  });
  return worker;
}
