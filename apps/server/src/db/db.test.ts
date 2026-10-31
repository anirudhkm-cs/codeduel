/**
 * Integration test against a real Postgres. Runs when DATABASE_URL is set
 * (CI provides one); skipped otherwise.
 */
import { afterAll, describe, expect, it } from "vitest";
import { PgProblemRepository } from "../problems/repository.js";
import { PgSubmissionRepository } from "../submissions/repository.js";
import { migrate } from "./migrate.js";
import { createPool } from "./pool.js";
import { seed } from "./seed.js";
import { PROBLEMS } from "./seed/problems.js";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("database", () => {
  const pool = createPool(url!);
  afterAll(() => pool.end());

  it("migrates, seeds, and reads problems back", async () => {
    await migrate(pool);
    await migrate(pool); // idempotent
    await seed(pool);
    await seed(pool); // idempotent

    const repo = new PgProblemRepository(pool);
    const list = await repo.list();
    expect(list.length).toBeGreaterThanOrEqual(PROBLEMS.length);

    const p = await repo.getBySlug("a-plus-b");
    expect(p).toMatchObject({ title: "A + B", timeLimitMs: 2000 });
    const samples = await repo.getTests(p!.id, { samplesOnly: true });
    const all = await repo.getTests(p!.id, { samplesOnly: false });
    expect(samples).toHaveLength(2);
    expect(samples[0]).toEqual({ ordinal: 1, input: "1 2\n", expectedOutput: "3\n", isSample: true });
    expect(all.length).toBeGreaterThan(samples.length);

    const saved = await new PgSubmissionRepository(pool).create({
      problemId: p!.id,
      language: "python",
      source: "print(3)",
      mode: "run",
      verdict: "accepted",
      passed: 2,
      total: 2,
      maxTimeMs: 12,
    });
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
