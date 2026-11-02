import type pg from "pg";
import type { JudgeMode, JudgeResult } from "../judge/judge.js";
import type { LanguageId } from "../judge/types.js";

export type SubmissionStatus = "queued" | "running" | "done" | "failed";

export interface NewSubmission {
  problemId: number;
  language: LanguageId;
  source: string;
  mode: JudgeMode;
}

export interface Submission extends NewSubmission {
  id: string;
  status: SubmissionStatus;
  /** Set once status is 'done'. */
  result: JudgeResult | null;
  /** Internal reason for 'failed'. Log it, don't show it. */
  error: string | null;
  createdAt: Date;
}

export interface SubmissionRepository {
  /** Inserts a new submission in the 'queued' state. */
  create(submission: NewSubmission): Promise<{ id: string; createdAt: Date }>;
  get(id: string): Promise<Submission | null>;
  markRunning(id: string): Promise<void>;
  complete(id: string, result: JudgeResult): Promise<void>;
  fail(id: string, error: string): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PgSubmissionRepository implements SubmissionRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(s: NewSubmission): Promise<{ id: string; createdAt: Date }> {
    const { rows } = await this.pool.query(
      `INSERT INTO submissions (problem_id, language, source, mode, status)
       VALUES ($1, $2, $3, $4, 'queued')
       RETURNING id, created_at AS "createdAt"`,
      [s.problemId, s.language, s.source, s.mode],
    );
    return rows[0];
  }

  async get(id: string): Promise<Submission | null> {
    // Postgres rejects malformed UUIDs with an error; treat them as "not found".
    if (!UUID.test(id)) return null;
    const { rows } = await this.pool.query(
      `SELECT id, problem_id AS "problemId", language, source, mode, status, result, error,
              created_at AS "createdAt"
       FROM submissions WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async markRunning(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE submissions SET status = 'running', updated_at = now() WHERE id = $1`,
      [id],
    );
  }

  async complete(id: string, r: JudgeResult): Promise<void> {
    await this.pool.query(
      `UPDATE submissions
       SET status = 'done', verdict = $2, passed = $3, total = $4, max_time_ms = $5,
           result = $6, error = NULL, updated_at = now()
       WHERE id = $1`,
      [id, r.verdict, r.passed, r.total, r.maxTimeMs, JSON.stringify(r)],
    );
  }

  async fail(id: string, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE submissions SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
      [id, error],
    );
  }
}
