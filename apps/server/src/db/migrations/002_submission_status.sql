-- Milestone 2: submissions are judged asynchronously by a worker.
-- A row is created as 'queued', the worker moves it to 'running', then
-- 'done' (with a verdict) or 'failed' (the judge itself broke).
-- Rows from Milestone 1 were judged synchronously, so they start as 'done'.
ALTER TABLE submissions
  ADD COLUMN status TEXT NOT NULL DEFAULT 'done'
    CHECK (status IN ('queued', 'running', 'done', 'failed')),
  ADD COLUMN result JSONB, -- full JudgeResult; hidden test data is already stripped
  ADD COLUMN error TEXT,   -- internal reason for 'failed', never shown to users
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ALTER COLUMN verdict DROP NOT NULL,
  ALTER COLUMN passed DROP NOT NULL,
  ALTER COLUMN total DROP NOT NULL;

ALTER TABLE submissions ALTER COLUMN status SET DEFAULT 'queued';
