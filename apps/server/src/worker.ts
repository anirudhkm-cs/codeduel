import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";
import { createExecutor } from "./judge/executors/index.js";
import { PgProblemRepository } from "./problems/repository.js";
import { createSubmissionWorker } from "./submissions/queue.js";
import { PgSubmissionRepository } from "./submissions/repository.js";
import { RedisSubmissionUpdates } from "./submissions/updates.js";

// Judges queued submissions. Run as many of these processes as you like;
// BullMQ hands each job to exactly one of them.
const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
const updates = new RedisSubmissionUpdates(config.REDIS_URL);

const worker = createSubmissionWorker(
  config.REDIS_URL,
  {
    problems: new PgProblemRepository(pool),
    submissions: new PgSubmissionRepository(pool),
    executor: createExecutor(config),
    updates,
  },
  { concurrency: config.WORKER_CONCURRENCY },
);

worker.on("ready", () => {
  console.log(`Judge worker ready (executor: ${config.EXECUTOR}, concurrency: ${config.WORKER_CONCURRENCY})`);
});

async function shutdown() {
  // Lets running jobs finish; anything unfinished is picked up again as stalled.
  await worker.close();
  await Promise.all([updates.close(), pool.end()]);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
