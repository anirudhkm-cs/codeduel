CREATE TABLE problems (
  id              SERIAL PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  difficulty      TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  statement_md    TEXT NOT NULL,
  time_limit_ms   INTEGER NOT NULL DEFAULT 2000,
  memory_limit_kb INTEGER NOT NULL DEFAULT 256000,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE test_cases (
  id              SERIAL PRIMARY KEY,
  problem_id      INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  ordinal         INTEGER NOT NULL,
  input           TEXT NOT NULL,
  expected_output TEXT NOT NULL,
  is_sample       BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (problem_id, ordinal)
);

CREATE TABLE submissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id  INTEGER NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  user_id     UUID, -- filled in once accounts exist (Milestone 4)
  match_id    UUID, -- filled in once duels exist (Milestone 3)
  language    TEXT NOT NULL,
  source      TEXT NOT NULL,
  mode        TEXT NOT NULL CHECK (mode IN ('run', 'submit')),
  verdict     TEXT NOT NULL,
  passed      INTEGER NOT NULL,
  total       INTEGER NOT NULL,
  max_time_ms INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX submissions_problem_idx ON submissions (problem_id, created_at DESC);
