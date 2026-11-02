# CodeDuel ⚔️

Real-time competitive coding duels: two players get the same problem and race to pass the hidden tests first.

> **Status:** Milestone 2 of 6. Solve problems in 4 languages against hidden tests in a sandbox. Submissions are judged by background workers through a job queue, with live status pushed to the browser. Multiplayer rooms come next.

<!-- TODO: add a demo GIF and the live URL here once deployed -->

## Architecture

```
 Browser (React + Monaco editor)
   │  REST /api/*  +  SSE /api/submissions/:id/events
   ▼
 API server (Node + Express + TypeScript)
   ├── PostgreSQL ── problems, test cases, submissions (+ status)
   └── Redis ─────── BullMQ "submissions" queue  ·  pub/sub status updates
                          │
                          ▼
                   Judge worker(s)  (separate processes, scale horizontally)
                     └── Executor ── Judge0 (sandboxed)  │  LocalExecutor (dev only)
```

The server is the referee. It holds the hidden tests, sends code to the sandbox, compares the output itself, and returns verdicts. Hidden test inputs and outputs never reach the client.

A submission's life:

1. `POST /api/submissions` saves it as `queued`, adds a job to the BullMQ queue, and returns `202` with its id. The API never runs code.
2. A worker picks up the job, marks it `running`, judges it, and saves the result as `done`. If the judge itself breaks (Judge0 down, worker crash), BullMQ retries up to 3 times with backoff, then the submission is marked `failed`.
3. After each change the worker publishes the submission id on Redis pub/sub. The API re-reads the row from Postgres and pushes it to the browser over Server-Sent Events. The database stays the single source of truth, so a missed message can't leave anyone with stale state.
4. The browser shows queued → running → done, and falls back to polling `GET /api/submissions/:id` if the stream drops.

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, TypeScript, Monaco editor, React Router |
| Backend | Node 22, Express, TypeScript, Zod validation |
| Queue | BullMQ on Redis 7, Server-Sent Events for live status |
| Database | PostgreSQL 16 (plain SQL migrations, `pg` driver) |
| Sandbox | [Judge0 CE](https://github.com/judge0/judge0) (self-hosted) |
| Testing / CI | Vitest, Supertest, GitHub Actions |

## Getting started

**Prerequisites:** Node 22+, Docker. For the dev-only local executor you also need `python3`, `g++` and a JDK.

```bash
# 1. Install dependencies, then commit package-lock.json (CI uses `npm ci`)
npm install
git add package-lock.json && git commit -m "Add lockfile"

# 2. Start Postgres and Redis
npm run infra:up

# 3. Configure, migrate, seed
cp apps/server/.env.example apps/server/.env
npm run db:migrate
npm run db:seed

# 4. Run the API (:4000), a judge worker, and the web app (:5173)
npm run dev
```

Open http://localhost:5173, pick a problem, then **Run samples** (Ctrl/⌘+Enter) or **Submit** (Ctrl/⌘+Shift+Enter).

### Executors: local vs Judge0

`EXECUTOR` in `apps/server/.env` picks where the worker runs code:

- **`local`** (default) runs code directly on your machine with a timeout and an output cap. It is **not a sandbox**: no filesystem, network or memory isolation. It's there so you can build features without Judge0, and the server refuses to start with it when `NODE_ENV=production`.
- **`judge0`** sends code to Judge0, which runs it in `isolate` sandboxes with CPU, memory, process and network limits. Use this before deploying.

### Running Judge0

```bash
npm run judge0:up       # starts Judge0 on http://localhost:2358
curl localhost:2358/languages | head   # sanity check
# then set EXECUTOR=judge0 in apps/server/.env
```

Judge0 1.13 needs **cgroup v1** on the host. Many modern Linux distros and Docker Desktop default to cgroup v2. If submissions come back as "Internal Error", that's usually why. On a Linux VPS, add `systemd.unified_cgroup_hierarchy=0` to the kernel boot parameters (GRUB) and reboot. Check the Judge0 docs/issues for your setup. Change the passwords in `infra/judge0/judge0.conf` before exposing it anywhere.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API + judge worker + web app with hot reload |
| `npm run dev:worker -w apps/server` | Just a judge worker (start more to judge in parallel) |
| `npm test` | Server test suite (Postgres/Redis integration tests run when `DATABASE_URL` / `REDIS_URL` are set) |
| `npm run typecheck` | TypeScript across both apps |
| `npm run build` | Production builds |
| `npm run db:migrate` / `db:seed` | Apply migrations / upsert seed problems |
| `npm run infra:up` / `judge0:up` | Docker services |

## Project structure

```
apps/
  server/src/
    app.ts                  Express routes + SSE stream (createApp takes deps, so tests inject fakes)
    index.ts                API entry point
    worker.ts               Judge worker entry point
    config.ts               Env validation (Zod)
    submissions/
      repository.ts         Postgres: queued → running → done / failed
      queue.ts              BullMQ queue + worker (retries, jobId = submission id)
      process.ts            One job: load, judge, save, publish
      updates.ts            Redis pub/sub "submission changed" notifications
    judge/
      judge.ts              Runs tests, computes verdicts, strips hidden data
      compare.ts            Output normalization (trailing whitespace, CRLF)
      languages.ts          Python, JS, C++, Java: Judge0 ids + starter code
      executors/
        judge0.ts           Judge0 batch API client (create → poll → decode)
        local.ts            Dev-only unsandboxed runner
    problems/               Repository (Postgres implementation)
    testing/fakes.ts        In-memory repos, queue and executor for tests
    db/
      migrations/*.sql      Schema
      migrate.ts            Minimal migration runner
      seed/problems.ts      10 problems; expected outputs computed by reference solutions
  web/src/
    pages/ProblemList.tsx
    pages/ProblemPage.tsx   Statement + Monaco editor + run/submit
    components/ResultPanel.tsx
infra/judge0/               Judge0 docker-compose + config
```

## API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `{ ok, executor }` |
| GET | `/api/languages` | Languages with starter code |
| GET | `/api/problems` | Problem list |
| GET | `/api/problems/:slug` | Statement, limits, sample tests |
| POST | `/api/submissions` | `{ problemSlug, language, source, mode: "run" \| "submit" }` → `202 { id, mode, status: "queued" }` |
| GET | `/api/submissions/:id` | `{ id, mode, status, result?, error? }` |
| GET | `/api/submissions/:id/events` | Server-Sent Events: the same object on every change, closes once `done` or `failed` |

`status` is `queued`, `running`, `done` or `failed`. Once `done`, `result` holds the verdict, passed/total and per-test results. `run` judges only the sample tests and returns their full input and output. `submit` judges every test, and hidden tests return only a verdict and time. Source code and internal error details are never returned.

## Adding a problem

Add an entry to `apps/server/src/db/seed/problems.ts` with a statement, a list of inputs, and a `solve()` reference solution in TypeScript. Expected outputs are generated from `solve()`, so they can't contain typos. Then run `npm run db:seed`.

## Roadmap

- [x] **M0: Setup.** Monorepo, Docker Compose, CI
- [x] **M1: Single-player judge.** Problems, Monaco editor, Judge0 integration, verdicts
- [x] **M2: Async execution queue.** BullMQ workers on Redis, status pushed to the client (queued → running → done)
- [ ] **M3: Multiplayer rooms.** Socket.IO rooms with invite codes, ready-up, server-synced countdown, live opponent progress, win/timeout/forfeit, reconnect grace period
- [ ] **M4: Accounts.** Guest + GitHub OAuth, match history, ELO, leaderboard
- [ ] **M5: Matchmaking.** Rating-based queue with an expanding search window
- [ ] **M6: Deploy.** Vercel (web), Fly.io/Railway (API), VPS for Judge0, rate limiting

## Security notes

- User code never runs in the API process, only in separate judge workers. In production the workers run it only in Judge0's sandbox: no network, CPU and memory caps, process limits.
- Request bodies are validated with Zod, and source code is capped at 64 KB.
- Hidden test data is stripped server-side (covered by tests).
- Still to do: per-user rate limiting (M6) and authentication (M4).
