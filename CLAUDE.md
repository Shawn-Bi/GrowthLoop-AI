# CLAUDE.md — GrowthLoop AI

GrowthLoop AI is a human-supervised, two-agent marketing experiment demo. A **Content Agent** drafts LinkedIn posts, and an **Analytics & Experiment Agent** analyses *simulated* metrics and proposes the next one-variable test. A deterministic TypeScript **controller** owns IDs, math, approvals, persistence, and every model call. PRD.md is the spec; TEAM_TASKS.md has the GL-01…GL-12 issues and the ownership split (Michelle owns the Content Agent, Shawn owns Analytics, persistence and the controller).

## Commands

```bash
npm ci                 # also runs prisma generate (postinstall)
npm test               # Vitest; no network, Anthropic mocked, Postgres via PGlite
npm run lint
npm run typecheck      # next typegen && tsc --noEmit (plain tsc fails on a fresh clone)
npm run build
npm run db:migrate     # prisma migrate deploy on Neon (DATABASE_URL_UNPOOLED)
```

Real-network checks live in `smoke/` and cost money or quota. Run them only when asked:
- `smoke:anthropic` (S1)
- `smoke:db:*` (S2)
- `smoke:deploy*` (S4, S2 preview; needs `PREVIEW_URL`)

Record actual results in `docs/test-report.md`.

## Stack (pinned, see package.json)

- **App:** Next 16.4.2 App Router, React 19.3.1, TypeScript 5.9.3, Tailwind 4.3.3, Node 24.x.
- **Data and agents:** Zod 4.6.7, Prisma 7.10.1 with `@prisma/adapter-pg` on Neon, `@anthropic-ai/sdk` 0.137.0.
- **Tests:** Vitest 5.0.5, plus PGlite for tests only.

Exact versions only: `.npmrc` sets `save-exact`. Don't upgrade or add a dependency unless the task asks for it. Never install `latest` blindly.

No Python, FastAPI, SQLite, monorepo, or generic agent framework (that includes Vercel's eve agents and AI Gateway).

## Layout

| Path | Purpose |
|---|---|
| `app/api/**/route.ts` | Thin route handlers |
| `app/experiments`, `app/access` | UI pages |
| `proxy.ts` | Access guard (Next 16 renamed `middleware` to `proxy`) |
| `lib/controller/` | Workflow, state transitions, handoffs, IDs, errors, HTTP helpers |
| `lib/agents/analytics/` | Prompt, Anthropic adapter, evidence review |
| `lib/content-agent/` | Content Agent prototype; planned move to `lib/agents/content/` |
| `lib/kpi/` | Fixture ingestion and deterministic KPI math |
| `lib/persistence/` | Prisma repositories: metrics, proposals, experiments, quota |
| `lib/auth/` | Demo access code, session cookie, page guard |
| `lib/db.ts`, `lib/anthropic.ts` | Server-only clients |
| `schemas/` | Zod contracts, the source of truth |
| `prisma/` | Schema and committed migrations; the client is generated to `generated/prisma/` (gitignored) |
| `data/fixtures/` | Pre-authored simulated metrics (GL-03) |
| `tests/`, `smoke/` | Unit/integration tests and real-network checks |

## Rules that must not be broken

**Agents and the Anthropic API**
- Call Claude only from the server, through `lib/anthropic.ts` (`import "server-only"`). Read the model from `ANTHROPIC_MODEL`; never hardcode a model ID.
- For structured output, use `messages.create` with `output_config: { format: zodOutputFormat(schema) }`, then validate with the Zod contract yourself. `messages.parse` throws away usage on a validation failure.
- Never send `thinking: { type: "disabled" }`, `budget_tokens`, a forced `tool_choice`, or the legacy `output_format`.
- Allow at most **one** append-only schema-repair turn.
- On `refusal`, `max_tokens` or any other early stop, or on an API error, fail visibly and record an `AgentRun`. Never invent a result.
- LLMs get **no tools and no database access**. Agents return JSON, and the controller validates it and writes it.
- Every agent call reserves a daily generation slot first (`reserveGenerationSlot`, 30 per UTC day, atomic in Postgres) and releases it if the call fails.

**Data, math and claims**
- `schemas/*.ts` define every contract: metrics, analytics output, proposals, audit events, and handoff **v1.0**. Change a contract only with both partners' review.
- The controller assigns every ID (`exp_001`, `cnt_001`, `prop_…`, `met_…`). Never let a model choose one.
- KPI math stays in `lib/kpi` as pure functions:
  - primary KPI = `qualified_demo_requests / landing_page_visits`;
  - secondary KPI = `qualified_demo_requests / link_clicks`;
  - a zero, missing or invalid denominator is `not_calculable`, never 0;
  - a missing value is invalid, never 0.
- Agents never do arithmetic. Findings must cite stored `metric_id`s. Citing an unknown ID makes the proposal an error.
- Content may use only `approved_demo_claim` or `verified_claim` IDs.
- Show `Hypothetical product — demonstration only` and `Simulated, pre-authored outcomes` wherever drafts or outcomes appear.

**Approvals and state**
- Every draft and every proposal needs an explicit human decision. Record it with role, timestamp and record ID as an `AuditEvent`.
- Change status only with a conditional update (`WHERE status = …`):
  - wrong role → 403;
  - illegal or repeated transition → 409;
  - unique constraints stop duplicate drafts, child experiments and handoffs.
- Nothing advances to the next cycle without an approved proposal (`buildNextCycleHandoff`).

**Access, secrets and Next 16**
- Every API route wraps its handler in `handleRoute` (access check plus error mapping). Every page calls `requirePageAccess()` inside its `<Suspense>` boundary. Don't rely on `proxy.ts` alone.
- `cacheComponents` is on, so put any read of cookies, params or the database in a component behind `<Suspense>`. Route handler `params` are Promises.
- This Next version differs from older training data. Read `node_modules/next/dist/docs/` before using a Next API.
- Secrets live only in `.env.local` (gitignored, `KEY=value` format) and in Vercel env vars. Never use `NEXT_PUBLIC_ANTHROPIC*`. Log error classes, never messages that could contain secrets.

**Prisma 7**
- Configuration lives in `prisma.config.ts`. Import the client from `@/generated/prisma/client`.
- Schema changes need a committed migration in `prisma/migrations/<timestamp>_<name>/migration.sql`. Generate it against the current database with `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, then apply it with `npm run db:migrate`.

## Testing

- Write deterministic code test-first. `npm test` must never touch the network: mock the Anthropic client (see `tests/analytics/run.test.ts`).
- For persistence and route tests, use `setupTestDb()` from `tests/persistence/db.ts`. It starts one migrated PGlite per file and truncates the tables before each test.
- Route handlers can be tested directly; mock `@/lib/db`, `@/lib/anthropic` or `@/lib/kpi/fixture-file` (see `tests/api/routes.test.ts`).
- Before calling work done, run `npm test`, `npm run lint`, `npm run typecheck` and `npm run build`, and report the actual output.

## Workflow

- One GL issue per branch and PR. Feature branches only: `main` is protected and needs the other partner's approval.
- PR #3 through #7 are stacked. Merge them in order, then retarget the next PR to `main`.
- Don't edit the same files as the other partner at the same time; coordinate on `package.json` and `package-lock.json` in particular.
- Each PR includes test results, known limitations and anything not run. Never claim a test or a deployment passed without evidence.
