/**
 * Upserts the seed problems (by slug) and replaces their test cases.
 * Safe to run repeatedly.
 */
import { fileURLToPath } from "node:url";
import type pg from "pg";
import { loadConfig } from "../config.js";
import { createPool } from "./pool.js";
import { PROBLEMS } from "./seed/problems.js";

export async function seed(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const p of PROBLEMS) {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO problems (slug, title, difficulty, statement_md, time_limit_ms)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (slug) DO UPDATE SET
           title = EXCLUDED.title, difficulty = EXCLUDED.difficulty,
           statement_md = EXCLUDED.statement_md, time_limit_ms = EXCLUDED.time_limit_ms
         RETURNING id`,
        [p.slug, p.title, p.difficulty, p.statementMd, p.timeLimitMs ?? 2000],
      );
      const problemId = rows[0]!.id;
      await client.query("DELETE FROM test_cases WHERE problem_id = $1", [problemId]);
      for (const [i, input] of p.inputs.entries()) {
        await client.query(
          `INSERT INTO test_cases (problem_id, ordinal, input, expected_output, is_sample)
           VALUES ($1, $2, $3, $4, $5)`,
          [problemId, i + 1, input, p.solve(input) + "\n", i < p.samples],
        );
      }
      console.log(`  ✓ ${p.slug} (${p.inputs.length} tests, ${p.samples} sample)`);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pool = createPool(loadConfig().DATABASE_URL);
  console.log("Seeding problems…");
  seed(pool)
    .then(() => console.log("Done."))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
