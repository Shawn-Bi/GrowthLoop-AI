# GrowthLoop AI — Test Report

This report records actual results only (PRD §10). Anything not run is marked as such.

**Last updated:** 2026-11-01, on branch `feature/grantready-demo`. This branch stacks the GrantReady seed data and the Claude-backed Content Agent on PR #19, with `main`, #8, #9 and #10 merged in. Node 24.15.0, Windows. S2 and S4 were re-run on the #19 and this branch's previews on 2026-11-01. S3 and S5 are from the 2026-10-23 runs.

## Summary

| Check | Status | Evidence |
|---|---|---|
| S0 toolchain | ✅ Pass | `npm ci`, `npx prisma -v` (7.10.1), `npm run typecheck`, `npm run build` (re-run 2026-10-29) |
| S1 Anthropic real API | ✅ Pass | `npm run smoke:anthropic` (re-run 2026-10-29 with the #14 prompt and required `content_change`) |
| S1b Content Agent real API | ✅ Pass | `npm run smoke:content`: all five test variables on 2026-11-01 |
| Two-cycle E2E on a preview | ✅ Pass | `npm run smoke:e2e`, real Claude on both agents, real Neon, seeded claims (2026-11-01) |
| S2 Neon persistence (local) | ✅ Pass | `npm run db:migrate`, `smoke:db:write` → new process → `smoke:db:read` → `smoke:db:cleanup` |
| S2 Vercel preview | ✅ Pass | `smoke:deploy:write` → redeploy → `smoke:deploy:read` → `smoke:deploy:cleanup` |
| S3 secrets and client boundary | ✅ Pass | Bundle scan, `.env.local` gitignored, smoke output scan |
| S4 Vercel runtime | ✅ Pass | `npm run smoke:deploy`, `smoke:deploy:write` against the preview |
| S5 access protection and daily cap | ✅ Pass (local) | Automated route tests, plus browser and HTTP checks against `next start` |
| S6 no-cost unit tests | ✅ Pass | `npm test`: 346/346 (2026-11-01), with mocked Anthropic and PGlite, including the two-cycle Content ↔ Analytics integration tests |

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

## S1b — Content Agent (real API)

- **Run on 2026-11-01** through `runContentAgent`, once for each of the five test variables, with the seeded GrantReady brief, ICP, claims and banned phrases.
- All five were schema-valid on the **first attempt**, with `stop_reason: end_turn`, so no repair turn was needed.
- Usage per run: about 1.9k input and 280–340 output tokens, 2.4–4.6 s.

## Two-cycle E2E (GL-10/GL-11)

- **Run on 2026-11-01** with `npm run smoke:e2e` against the `feature/grantready-demo` preview at `76e535a`, after `npm run db:seed` loaded registry `grantready-demo-v1` into Neon (4 `approved_demo_claim`, 3 `rejected_claim`). `npm run smoke:deploy` passed first: health 200, API without a code 401, page 307.
- **Cycle 1:**
  - `exp_001` was created (201).
  - Real Claude wrote the pair in 4.8 s (201). Only the hook differs. Each draft carries the hypothetical label and the three approved claims word for word.
  - Both drafts were approved (200 each).
  - `demo_fixture_v1` saved 14 metrics and quarantined 2 rows (201).
  - The KPIs match Michelle's expected values: 10.0% (8/80) and 15.0% (15/100) per visit, 8.0% (8/100) and 12.5% (15/120) per click.
  - Real Claude analysis took 11.2 s (201), with 0 review flags. It proposed changing `cta`.
- **Decision:** approved with outcome `variant_better` (200). The stored handoff is `schema_version: "1.1"`, with the Cycle 1 variant as the baseline.
- **Cycle 2:** `exp_002` has parent `exp_001` and two `pending_approval` drafts. Its control equals the Cycle 1 variant, and the pair differs only in `cta`. The trace returns `exp_001 → exp_002`.
- **Browser:** the `exp_001` and `exp_002` pages were checked on a local `next start` against Neon: drafts, KPI table, proposal, approved findings and the read-only registry all render.
- **Proposals vary between runs**, as in S1, so the demo script reads the proposal from the screen.

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
- **Re-run on 2026-10-29** against the `feature/cycle2-baseline-limit` preview (#17, commit `97afaa2`):
  - **Migration:** Neon was migrated first with `npm run db:migrate`. `prisma migrate status` reports 2 migrations and "Database schema is up to date".
  - **S4:** `/api/health` returned 200. `/api/experiments/*` without the access code returned the app's own 401, and `/experiments` returned 307.
  - **S2 write:** metrics returned 201. The real-Claude analysis returned 201 in 17.0 s, with 0 review flags. The decision with `outcome: "inconclusive"` returned 200 and created `exp_smoke_002`.
  - **Neon read-back:**
    - The proposal is `approved` with outcome `inconclusive`, and the audit event has the same outcome.
    - The stored handoff is `schema_version: "1.1"`, with baseline `cnt_smoke_control`, so the inconclusive result kept the control.
  - **S2 read:** `GET /api/experiments/exp_smoke_002` returned 200, and the trace returned 200. This was not after a redeploy; the 2026-10-23 run covers persistence across a redeploy.
  - **Cleanup:** `smoke:deploy:cleanup` removed the `exp_smoke_*` rows.
- **Re-run after the Cycle 2 generation fix (2026-10-29)** against the same preview at commit `fc9c552`:
  - **The fix:** Michelle found that approval skipped Cycle 2 generation when the baseline's Content DNA lacked `schema_version`, and left a child experiment with no drafts. Generation is now mandatory: an invalid baseline returns 409, and the approval rolls back. The smoke test now seeds valid Content DNA and a `clm_smoke_demo` claim.
  - **S4:** health returned 200, the API without the access code returned 401, and the page returned 307.
  - **S2 write:** metrics returned 201. The real-Claude analysis returned 201 in 11.9 s, with 0 review flags. The decision with `outcome: "inconclusive"` returned 200.
  - **S2 read:** `GET /api/experiments/exp_smoke_002` returned 200, with **both Cycle 2 drafts generated on the deployment** (control and variant, `pending_approval`). The trace returned 200.
  - **Cleanup:** the `exp_smoke_*` rows and the `clm_smoke_*` claim were removed.
  - **Not run on the preview:** the refused case (an invalid baseline gets 409 and nothing is committed). The integration tests cover it: `tests/integration/content-dna-validation.test.ts`.

- **Re-run on 2026-11-01** against the #19 preview at `02d375f`: S4 passed. The real-Claude analysis returned 201 in 14.2 s with 0 review flags, the decision returned 200, and `exp_smoke_002` had both Cycle 2 drafts. The smoke rows were removed. This run covered the normal path only; the refused cases are in `tests/integration/review-findings.test.ts`.

## S3 / S5 — Secrets and access

- `.next/static` contains none of `sk-ant`, `DEMO_ACCESS_CODE` or `DATABASE_URL`.
- `.env.local` is ignored by git.
- The session cookie is HttpOnly (not readable from page JS) and SameSite=Lax.
- Access codes are compared in constant time, and protection fails closed when no code is configured.
- The daily cap returns 429 at 30 successful generations per UTC day. This is tested on PGlite, including concurrency.

## Not yet covered

- **Independent verification of PR #19 and this branch.** Michelle's review covers commits up to #17.
- **Refusals on a deployment.** Banned content, invalid claims and model failures are covered by `tests/integration/*`, not by a live run.
- **A production deployment of this stack.** `main` has #3 and #4 only; the rest needs one approval to reach it.
