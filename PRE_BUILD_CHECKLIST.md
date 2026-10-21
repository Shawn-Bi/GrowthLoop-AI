# GrowthLoop AI — PRE_BUILD_CHECKLIST.md

**Status:** Proposed / unverified. Check boxes only after real verification. Never paste API keys into documents or GitHub issues.

## 1. Product and teamwork
- [ ] Both teammates sign off on PRD v1.1 and two-week must-haves.
- [ ] Confirm actual deadline, kickoff date, demo format and submission requirements.
- [ ] Michelle confirms ownership of GrantReady hypothetical brief, ICP, and claim approval; Shawn confirms GrowthLoop product/workflow lead.
- [ ] Confirm primary KPI: **qualified demo request** for hypothetical funnel, with precise event definition and denominators; simulated data is not real market validation.
- [ ] Approve 2-cycle test and fallback demo plan.
- [ ] Assign GitHub Issues and agree PR review/merge owner.

## 2. Accounts, access and budget
- [ ] Both have GitHub repo access; repo name and default branch confirmed.
- [ ] Anthropic API account active; available credit/payment and API access verified by a minimal **server-side** request.
- [ ] Confirm model IDs available in account; use Claude Opus for design review, Claude Sonnet for implementation and runtime agents unless reviewed otherwise.
- [ ] Agree hard/soft spending budget and API token/timeout/retry limits; record cost without exposing secrets.
- [ ] Confirm Node.js LTS, package manager, local dev machine and Git installed.
- [ ] Confirm hosting provider account and DB provider account; choose a region and secure credentials.

## 3. Proposed minimal stack
- [ ] Next.js App Router + TypeScript + Tailwind CSS.
- [ ] Anthropic SDK on server only; **never** expose `ANTHROPIC_API_KEY` in `NEXT_PUBLIC_*` variables.
- [ ] Prisma ORM with **managed PostgreSQL from day one** if cloud demo is required; local PostgreSQL or managed development database. This avoids SQLite-to-Postgres switch and ephemeral filesystem data loss.
- [ ] Vitest for deterministic math/schema tests; Playwright smoke test if time permits.
- [ ] Vercel for web deployment **only after** verifying function timeout, networking, secrets, and PostgreSQL connectivity; fallback is local live demo + screen recording.
- [ ] Environment variables (names only): `ANTHROPIC_API_KEY`, `DATABASE_URL`, `APP_BASE_URL`, `SESSION_SECRET` (if auth is implemented), `ANTHROPIC_MODEL` (configured Sonnet model ID). Do not copy old generic `LLM_API_KEY` conventions blindly.

## 4. Demo data and schemas
- [ ] GrantReady brief with `hypothetical/demo-only` banner and approved/rejected claims.
- [ ] One ICP and one conversion definition, approved by both.
- [ ] Two Cycle 1 posts and Content DNA schema: ICP, pain point, hook, value proposition, evidence, CTA, variable.
- [ ] Fixture records include campaign/content IDs, impressions, clicks, demo requests, qualified demo requests, source type `simulated`, validation status, and timestamps.
- [ ] Ensure denominators valid, sample sizes plausible, missing values represented explicitly, no impossible counts.
- [ ] Handoff JSON schema version, task ID, source/target agent, experiment ID, evidence, approval state, uncertainty and error fields.
- [ ] Experiment Memory persists after process restart; `Cycle 2` links to saved Cycle 1 experiment.

## 5. Engineering readiness smoke checks
- [ ] `npm install` succeeds; `npm run dev` starts; a health endpoint responds.
- [ ] Anthropic server-side call succeeds with actual account; redact logs.
- [ ] DB migration succeeds and read/write persists after restart.
- [ ] Draft generation produces schema-valid Content DNA from approved claims.
- [ ] Approval gate blocks unapproved next actions.
- [ ] Fixture import validates records; deterministic KPI test passes.
- [ ] Analytics Agent produces evidence-linked proposal and uncertainty.
- [ ] Second-cycle generation references approved persisted experiment after restart.
- [ ] API errors, timeouts and invalid model JSON produce safe, visible failures.
- [ ] Deployment URL or local fallback works from demo machine; runbook and README updated to reflect actual steps.

## 6. Demo rehearsal and submission
- [ ] Two-cycle demonstration repeatable using seeded dataset; no manual database edits mid-demo.
- [ ] Screenshots/recording prepared as fallback for internet/API outage.
- [ ] Final README includes verified setup commands, environment variable names and actual limitations.
- [ ] GitHub repo contains no secrets or real personal data; `.env*` excluded except `.env.example`.
- [ ] Results report lists actual tests run, passed/failed, costs, and limitations; no unverified performance claims.

## Stop/go rules
**Do not begin feature implementation until:** team signs off on PRD, approved demo claims exist, model API access is verified, persistent database plan is validated, owners/deadlines are agreed, and a 2-cycle pass/fail definition exists. Infrastructure smoke checks may be performed as preparation after permission.

**If cloud deployment blocks progress:** prioritize a reproducible local demo and recording; do not rewrite architecture at the end of the sprint.
