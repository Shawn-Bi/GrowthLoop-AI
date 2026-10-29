# GrowthLoop AI — Test Report

This report records actual results only (PRD §10). Anything not run is marked as such.

**Last updated:** 2026-10-29, on branch `feature/cycle2-baseline-limit`. This branch stacks the integrated Content loop (#14), handoff v1.1 (#16) and the outcome/cycle-limit rules on top of #3–#12. Node 24.15.0, Windows. Sections S2–S5 are from the 2026-10-23 runs and weren't repeated.

## Summary

| Check | Status | Evidence |
|---|---|---|
| S0 toolchain | ✅ Pass | `npm ci`, `npx prisma -v` (7.10.1), `npm run typecheck`, `npm run build` (re-run 2026-10-29) |
| S1 Anthropic real API | ✅ Pass | `npm run smoke:anthropic` (re-run 2026-10-29 with the #14 prompt and required `content_change`) |
| S1b Content DNA schema | ⏳ Not run | Waits for the Content Agent (GL-07) |
| S2 Neon persistence (local) | ✅ Pass | `npm run db:migrate`, `smoke:db:write` → new process → `smoke:db:read` → `smoke:db:cleanup` |
| S2 Vercel preview | ✅ Pass | `smoke:deploy:write` → redeploy → `smoke:deploy:read` → `smoke:deploy:cleanup` |
| S3 secrets and client boundary | ✅ Pass | Bundle scan, `.env.local` gitignored, smoke output scan |
| S4 Vercel runtime | ✅ Pass | `npm run smoke:deploy`, `smoke:deploy:write` against the preview |
| S5 access protection and daily cap | ✅ Pass (local) | Automated route tests, plus browser and HTTP checks against `next start` |
| S6 no-cost unit tests | ✅ Pass | `npm test`: 225/225 (2026-10-29), with mocked Anthropic and PGlite, including the two-cycle Content ↔ Analytics integration tests |

## S1 — Anthropic (real API)

- **Credentials:** `ANTHROPIC_API_KEY present: true`. No key, key length or other secret is printed. The captured output contains no `sk-ant` string.
- **Model:** `models.retrieve(ANTHROPIC_MODEL)` returned `claude-sonnet-5-5`, so the model is available for this account.
- **Real analysis call** through `runAnalyticsAgent`, using structured output via `output_config.format`, `effort: "medium"`, and no `thinking`, `tool_choice` or `output_format`:
  - `stop_reason: end_turn`; the output was schema-valid on the **first attempt**, so no repair turn was needed.
  - Usage per run: about 3.1k input and 1.4k output tokens, about 10 s, roughly $0.02.
  - The proposal was `needs_human_approval` with 0 errors.
- **Finding and fix:** the first runs flagged 2 false positives. The model's own disclaimers ("not caused by the posts", "no statistical significance") were treated as causal wording. `reviewAnalysis` now ignores negated matches within the same clause. The re-run shows **0 review flags**, and new unit tests cover both negated and non-negated wording.
- **Proposals vary between runs:** the same data produced `hook` in one run and `value_proposition` in another. The human approver decides.
- **Re-run on 2026-10-29:** #14 added the `content_change` instruction to the prompt, and #16 made `content_change` required in the output schema.
  - The output was schema-valid on the **first attempt**, with `stop_reason: end_turn`.
  - Usage: 3,366 input and 2,080 output tokens, 18.2 s.
  - The proposal was `needs_human_approval` with 0 review flags and 0 errors, and its primary test variable was `hook`.

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
- **Vercel preview** write → redeploy → read (S2) and the S4 runtime checks: see the next section.

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
- **S2 read after a redeploy:** pushing `3ff27e1` produced a new deployment, `BCdwk…`; the write had run on `BARus…`. The redeployed app returned `exp_smoke_002`, its parent link and its handoff (200), and the trace `exp_smoke_001 → exp_smoke_002`.
- **Cleanup:** `smoke:deploy:cleanup` removed the `exp_smoke_*` rows, and the preview now returns 404 for them. The run used one of the day's 30 generation slots.

## S3 / S5 — Secrets and access

- `.next/static` contains none of `sk-ant`, `DEMO_ACCESS_CODE` or `DATABASE_URL`.
- `.env.local` is ignored by git.
- The session cookie is HttpOnly (not readable from page JS) and SameSite=Lax.
- Access codes are compared in constant time, and protection fails closed when no code is configured.
- The daily cap returns 429 at 30 successful generations per UTC day. This is tested on PGlite, including concurrency.

## Not yet covered

- **Two-cycle E2E with real Content Agent drafts and real Claude, on the Vercel preview (GL-10/GL-11).** The same flow passes in `tests/integration/*` over the production API handlers with PGlite, but there the Anthropic transport is stubbed.
- **KPI exact match against Michelle's `expected.json` (GL-03/GL-08).** Her #15 test passed 38/38 against the #4 KPI code in a local check on 2026-10-29. It's recorded here once #15 is merged into #4.
- **A production deployment of this stack.** `main` has #3 only; the rest reaches it as #4–#12 merge.
- **Neon migration `20261029000000_proposal_outcome`.** It has to be applied with `npm run db:migrate` before a preview of this branch can decide proposals.
