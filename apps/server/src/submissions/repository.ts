import type pg from "pg";
import type { JudgeMode } from "../judge/judge.js";
import type { LanguageId, Verdict } from "../judge/types.js";

export interface NewSubmission {
  problemId: number;
  language: LanguageId;
  source: string;
  mode: JudgeMode;
  verdict: Verdict;
  passed: number;
  total: number;
  maxTimeMs: number | null;
}

export interface SubmissionRepository {
  create(submission: NewSubmission): Promise<{ id: string; createdAt: Date }>;
}

export class PgSubmissionRepository implements SubmissionRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(s: NewSubmission): Promise<{ id: string; createdAt: Date }> {
    const { rows } = await this.pool.query(
      `INSERT INTO submissions (problem_id, language, source, mode, verdict, passed, total, max_time_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at AS "createdAt"`,
      [s.problemId, s.language, s.source, s.mode, s.verdict, s.passed, s.total, s.maxTimeMs],
    );
    return rows[0];
  }
}
