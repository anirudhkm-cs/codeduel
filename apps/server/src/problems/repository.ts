import type pg from "pg";
import type { TestCase } from "../judge/types.js";

export type Difficulty = "easy" | "medium" | "hard";

export interface ProblemSummary {
  id: number;
  slug: string;
  title: string;
  difficulty: Difficulty;
}

export interface Problem extends ProblemSummary {
  statementMd: string;
  timeLimitMs: number;
  memoryLimitKb: number;
}

export interface ProblemRepository {
  list(): Promise<ProblemSummary[]>;
  getBySlug(slug: string): Promise<Problem | null>;
  getTests(problemId: number, opts: { samplesOnly: boolean }): Promise<TestCase[]>;
}

export class PgProblemRepository implements ProblemRepository {
  constructor(private readonly pool: pg.Pool) {}

  async list(): Promise<ProblemSummary[]> {
    const { rows } = await this.pool.query(
      `SELECT id, slug, title, difficulty FROM problems
       ORDER BY CASE difficulty WHEN 'easy' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, id`,
    );
    return rows;
  }

  async getBySlug(slug: string): Promise<Problem | null> {
    const { rows } = await this.pool.query(
      `SELECT id, slug, title, difficulty,
              statement_md AS "statementMd",
              time_limit_ms AS "timeLimitMs",
              memory_limit_kb AS "memoryLimitKb"
       FROM problems WHERE slug = $1`,
      [slug],
    );
    return rows[0] ?? null;
  }

  async getTests(problemId: number, { samplesOnly }: { samplesOnly: boolean }): Promise<TestCase[]> {
    const { rows } = await this.pool.query(
      `SELECT ordinal, input, expected_output AS "expectedOutput", is_sample AS "isSample"
       FROM test_cases
       WHERE problem_id = $1 AND ($2::boolean = false OR is_sample)
       ORDER BY ordinal`,
      [problemId, samplesOnly],
    );
    return rows;
  }
}
