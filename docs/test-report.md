# GrowthLoop AI — Test Report

This report records actual results only (PRD §10). Anything not run is marked as such.

**Last updated:** 2026-10-23, on branch `feature/gl-06-controller-api` (PR stack #3–#7), Node 24.15.0, Windows.

## Summary

| Check | Status | Evidence |
|---|---|---|
| S0 toolchain | ✅ Pass | `npm ci`, `npx prisma -v` (7.10.1), `npm run typecheck`, `npm run build` |
| S1 Anthropic real API | ✅ Pass | `npm run smoke:anthropic` |
| S1b Content DNA schema | ⏳ Not run | Waits for the Content Agent (GL-07) |
| S2 Neon persistence (local) | ✅ Pass | `npm run db:migrate`, `smoke:db:write` → new process → `smoke:db:read` → `smoke:db:cleanup` |
| S2 Vercel preview | ⏳ In progress | Write passed; read-back after a redeploy pending |
| S3 secrets and client boundary | ✅ Pass | Bundle scan, `.env.local` gitignored, smoke output scan |
| S4 Vercel runtime | ✅ Pass | `npm run smoke:deploy`, `smoke:deploy:write` against the preview |
| S5 access protection and daily cap | ✅ Pass (local) | Automated route tests, plus browser and HTTP checks against `next start` |
| S6 no-cost unit tests | ✅ Pass | `npm test`: 129/129, with mocked Anthropic and PGlite |

## S1 — Anthropic (real API)

- **Credentials:** `ANTHROPIC_API_KEY present: true`. No key, key length or other secret is printed. The captured output contains no `sk-ant` string.
- **Model:** `models.retrieve(ANTHROPIC_MODEL)` returned `claude-sonnet-5-5`, so the model is available for this account.
- **Real analysis call** through `runAnalyticsAgent`, using structured output via `output_config.format`, `effort: "medium"`, and no `thinking`, `tool_choice` or `output_format`:
  - `stop_reason: end_turn`; the output was schema-valid on the **first attempt**, so no repair turn was needed.
  - Usage per run: about 3.1k input and 1.4k output tokens, about 10 s, roughly $0.02.
  - The proposal was `needs_human_approval` with 0 errors.
- **Finding and fix:** the first runs flagged 2 false positives. The model's own disclaimers ("not caused by the posts", "no statistical significance") were treated as causal wording. `reviewAnalysis` now ignores negated matches within the same clause. The re-run shows **0 review flags**, and new unit tests cover both negated and non-negated wording.
- **Proposals vary between runs:** the same data produced `hook` in one run and `value_proposition` in another. The human approver decides.

## S2 — Neon PostgreSQL

- **Migration:** `npm run db:migrate` applied `20261023000000_init` over the direct (unpooled) connection.
  - `prisma migrate status` reports "Database schema is up to date".
  - `prisma migrate diff --from-config-datasource --to-schema` reports no difference.
- **Persistence across a restart:** the marker `624674` was written through the pooled `DATABASE_URL` in one process, then read back with the same value in a **new process**. The cleanup step then removed the row.
- **App runtime** (`next start` reading `.env.local`):
  - `GET /api/health` returned 200;
  - a protected API without credentials returned 401;
  - the same API with the bearer access code reached Neon (404 for an unknown experiment);
  - an unauthenticated page returned 307 to `/access`.
- **Not run yet:** Vercel preview write → redeploy → read (S2) and the S4 runtime checks.

## S4 / S2 — Vercel preview

- **Setup:** Vercel project `growth-loop-ai`, imported from GitHub. Each branch gets a preview at its branch URL; this run used `feature/gl-06-controller-api`, commit `6953c9a`, which built in about 1 minute. All five variables are set on Vercel, and Node 24 comes from `engines`.
- **Two layers of protection, both active:**
  - Without the automation bypass header, Vercel Authentication answers with a 302 to its login page.
  - With the bypass header but without the app's access code, `/api/experiments/*` returns the app's own JSON 401, and `/experiments` returns 307 to `/access`.
- **S4 runtime:**
  - `GET /api/health` returned 200 in about 0.3 s.
  - The protected real Anthropic route, `POST /api/experiments/exp_smoke_001/analysis`, returned 201 in **11.8 s**, within the 120 s budget (`maxDuration`), with 0 review flags.
  - The fixture route returned 201 in about 1 s, which shows `data/fixtures` is traced into the function bundle.
- **S2 write through the deployment:** seeding `exp_smoke_001`, loading metrics, analysing and approving created `exp_smoke_002` and its handoff in Neon through the deployed app.
- **S2 read after a redeploy:** pending.

## S3 / S5 — Secrets and access

- `.next/static` contains none of `sk-ant`, `DEMO_ACCESS_CODE` or `DATABASE_URL`.
- `.env.local` is ignored by git.
- The session cookie is HttpOnly (not readable from page JS) and SameSite=Lax.
- Access codes are compared in constant time, and protection fails closed when no code is configured.
- The daily cap returns 429 at 30 successful generations per UTC day. This is tested on PGlite, including concurrency.

## Not yet covered

- The two-cycle E2E with real Content Agent drafts (GL-10/GL-11).
- KPI exact match against Michelle's `expected.json` (GL-03/GL-08).
- Any deployed environment.
