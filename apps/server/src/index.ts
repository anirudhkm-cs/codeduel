import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";
import { PgProblemRepository } from "./problems/repository.js";
import { BullSubmissionQueue } from "./submissions/queue.js";
import { PgSubmissionRepository } from "./submissions/repository.js";
import { RedisSubmissionUpdates } from "./submissions/updates.js";

// The API only queues submissions; `npm run worker` judges them (see worker.ts).
const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
const queue = new BullSubmissionQueue(config.REDIS_URL);
const updates = new RedisSubmissionUpdates(config.REDIS_URL);

const app = createApp({
  problems: new PgProblemRepository(pool),
  submissions: new PgSubmissionRepository(pool),
  queue,
  updates,
  executorName: config.EXECUTOR,
  corsOrigin: config.CORS_ORIGIN,
});

const server = app.listen(config.PORT, () => {
  console.log(`CodeDuel API listening on http://localhost:${config.PORT} (executor: ${config.EXECUTOR})`);
});

function shutdown() {
  // Open SSE streams would otherwise keep server.close() waiting forever.
  server.closeAllConnections();
  server.close(() =>
    Promise.all([queue.close(), updates.close(), pool.end()]).then(() => process.exit(0)),
  );
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
