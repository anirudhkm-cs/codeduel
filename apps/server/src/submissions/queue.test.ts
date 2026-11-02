/**
 * Integration test against a real Redis: BullMQ queue + worker + pub/sub.
 * Runs when REDIS_URL is set (CI provides one); skipped otherwise.
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { executor, MemorySubmissionRepository, problems } from "../testing/fakes.js";
import { BullSubmissionQueue, createSubmissionWorker } from "./queue.js";
import { RedisSubmissionUpdates } from "./updates.js";

const url = process.env.REDIS_URL;

describe.skipIf(!url)("BullMQ submission queue", () => {
  // A unique queue name, so a locally running dev worker can't steal these jobs
  const queueName = `test-submissions-${randomUUID()}`;
  const submissions = new MemorySubmissionRepository();
  const updates = new RedisSubmissionUpdates(url!);
  const queue = new BullSubmissionQueue(url!, queueName);
  const worker = createSubmissionWorker(
    url!,
    { problems, submissions, executor, updates },
    { concurrency: 2, queueName },
  );

  afterAll(async () => {
    await worker.close();
    await queue.close();
    await updates.close();
  });

  it("judges a queued submission and publishes its progress", async () => {
    await updates.ready();
    const { id } = await submissions.create({ problemId: 1, language: "python", source: "ok", mode: "submit" });

    // Updates carry only the id. By the time one arrives the row may have moved on,
    // which is why listeners re-read it, so just wait until a read shows 'done'.
    const finished = new Promise<void>((resolve) => {
      updates.subscribe((updated) => {
        if (updated === id && submissions.rows.get(id)!.status === "done") resolve();
      });
    });

    await queue.enqueue(id);
    await queue.enqueue(id); // duplicate enqueue is a no-op
    await finished;

    expect(submissions.rows.get(id)?.result).toMatchObject({ verdict: "accepted", passed: 2, total: 2 });
  });
});
