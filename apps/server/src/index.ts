import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";
import { createExecutor } from "./judge/executors/index.js";
import { PgProblemRepository } from "./problems/repository.js";
import { PgSubmissionRepository } from "./submissions/repository.js";

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);

const app = createApp({
  problems: new PgProblemRepository(pool),
  submissions: new PgSubmissionRepository(pool),
  executor: createExecutor(config),
  corsOrigin: config.CORS_ORIGIN,
});

const server = app.listen(config.PORT, () => {
  console.log(`CodeDuel API listening on http://localhost:${config.PORT} (executor: ${config.EXECUTOR})`);
});

function shutdown() {
  server.close(() => pool.end().then(() => process.exit(0)));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
