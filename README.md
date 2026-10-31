# CodeDuel ⚔️

Real-time competitive coding duels: two players get the same problem and race to pass the hidden tests first.

> **Status:** Milestone 1 of 6. The single-player judge is done: solve problems in 4 languages against hidden tests in a sandbox. Multiplayer rooms come next.

<!-- TODO: add a demo GIF and the live URL here once deployed -->

## Architecture

```
 Browser (React + Monaco editor)
   │  REST /api/*
   ▼
 API server (Node + Express + TypeScript)
   ├── PostgreSQL ── problems, test cases, submissions
   └── Executor ──── Judge0 (sandboxed)  │  LocalExecutor (dev only)
```

The server is the referee. It holds the hidden tests, sends code to the sandbox, compares the output itself, and returns verdicts. Hidden test inputs and outputs never reach the client.

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, TypeScript, Monaco editor, React Router |
| Backend | Node 22, Express, TypeScript, Zod validation |
| Database | PostgreSQL 16 (plain SQL migrations, `pg` driver) |
| Sandbox | [Judge0 CE](https://github.com/judge0/judge0) (self-hosted) |
| Testing / CI | Vitest, Supertest, GitHub Actions |

## Getting started

**Prerequisites:** Node 22+, Docker. For the dev-only local executor you also need `python3`, `g++` and a JDK.

```bash
# 1. Install dependencies, then commit package-lock.json (CI uses `npm ci`)
npm install
git add package-lock.json && git commit -m "Add lockfile"

# 2. Start Postgres (+ Redis for later milestones)
npm run infra:up

# 3. Configure, migrate, seed
cp apps/server/.env.example apps/server/.env
npm run db:migrate
npm run db:seed

# 4. Run the API (:4000) and web app (:5173)
npm run dev
```

Open http://localhost:5173, pick a problem, then **Run samples** (Ctrl/⌘+Enter) or **Submit** (Ctrl/⌘+Shift+Enter).

### Executors: local vs Judge0

`EXECUTOR` in `apps/server/.env` picks where code runs:

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
| `npm run dev` | API + web app with hot reload |
| `npm test` | Server test suite (DB tests run when `DATABASE_URL` is set) |
| `npm run typecheck` | TypeScript across both apps |
| `npm run build` | Production builds |
| `npm run db:migrate` / `db:seed` | Apply migrations / upsert seed problems |
| `npm run infra:up` / `judge0:up` | Docker services |

## Project structure

```
apps/
  server/src/
    app.ts                  Express routes (createApp takes deps, so tests inject fakes)
    config.ts               Env validation (Zod)
    judge/
      judge.ts              Runs tests, computes verdicts, strips hidden data
      compare.ts            Output normalization (trailing whitespace, CRLF)
      languages.ts          Python, JS, C++, Java: Judge0 ids + starter code
      executors/
        judge0.ts           Judge0 batch API client (create → poll → decode)
        local.ts            Dev-only unsandboxed runner
    problems/, submissions/ Repositories (Postgres implementations)
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
| POST | `/api/submissions` | `{ problemSlug, language, source, mode: "run" \| "submit" }` → verdict, passed/total, per-test results |

`run` judges only the sample tests and returns their full input and output. `submit` judges every test, and hidden tests return only a verdict and time.

## Adding a problem

Add an entry to `apps/server/src/db/seed/problems.ts` with a statement, a list of inputs, and a `solve()` reference solution in TypeScript. Expected outputs are generated from `solve()`, so they can't contain typos. Then run `npm run db:seed`.

## Roadmap

- [x] **M0: Setup.** Monorepo, Docker Compose, CI
- [x] **M1: Single-player judge.** Problems, Monaco editor, Judge0 integration, verdicts
- [ ] **M2: Async execution queue.** BullMQ workers on Redis, status pushed to the client (queued → running → done)
- [ ] **M3: Multiplayer rooms.** Socket.IO rooms with invite codes, ready-up, server-synced countdown, live opponent progress, win/timeout/forfeit, reconnect grace period
- [ ] **M4: Accounts.** Guest + GitHub OAuth, match history, ELO, leaderboard
- [ ] **M5: Matchmaking.** Rating-based queue with an expanding search window
- [ ] **M6: Deploy.** Vercel (web), Fly.io/Railway (API), VPS for Judge0, rate limiting

## Security notes

- User code never runs in the API process. In production it runs only in Judge0's sandbox: no network, CPU and memory caps, process limits.
- Request bodies are validated with Zod, and source code is capped at 64 KB.
- Hidden test data is stripped server-side (covered by tests).
- Still to do: per-user rate limiting (M6) and authentication (M4).
