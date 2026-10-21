# GrowthLoop AI — Five-Day Pre-Build Checklist / GO–NO-GO

**Version:** 2.0 · 2026-10-21 · **Status:** Checklist only; unchecked items are not verified.  
**Target:** D1 Wed Oct 21, 2026; five working days end Tue Oct 27. **Never put keys, passwords or full connection strings in this document, issues or screenshots.**

## A. Joint sign-off (D1 morning)
- [ ] Both acknowledge five-working-day P0 scope, deferrals, and **Cycle 2 ending at draft generation**.
- [ ] Both approve proposed division: Shawn engineering/integration; Michelle GrantReady brief, claims, fixture, independent KPI expectations, content review/demo.
- [ ] Confirm one ICP, LinkedIn organic only, one seeded hypothetical customer.
- [ ] Verify the **fixed primary KPI** `qualified_demo_requests / landing_page_visits`; secondary `qualified_demo_requests / link_clicks`; missing/zero denominator = `not_calculable`.
- [ ] Confirm the fixed simulated JSON fixture (no real marketing lift claims), pre-authored outcomes and provenance label.
- [ ] Confirm implementation of assigned reviewer responsibilities (Michelle content; Shawn experiment), recognizing shared demo access code is not identity proof.
- [ ] Confirm **official** course submission deadline, required format, repo and demo requirements. Internal target Oct 27 is not assumed to be official deadline.
- [ ] Configure the fixed $50 Anthropic spend limit, PostgreSQL-backed quota of 30 successful agent-generation calls per UTC day, and server-validated demo access code; record API key owner and Neon/Vercel account owner.
- [ ] Create `docs/decisions.md` with actual approvals and dates; merge docs PR. No forged signatures.

## B. Required GrantReady inputs (Michelle; D1)
- [ ] `data/seed/brief.json`: product capabilities, demo-only positioning and disclaimers.
- [ ] `data/seed/icp.json`: one persona and geography.
- [ ] `data/seed/claims.json`: `registry_version`, each `claim_id`, `text`, `status`, `source_or_evidence`, `reviewer`, `reviewed_at`, `demo_only`; at least one rejected claim.
- [ ] `data/seed/banned_phrases.json`: unverified guarantees/claims.
- [ ] `data/fixtures/demo_fixture_v1.json`: `dataset_id`, `experiment_id`, `variant_role`, `source=simulated`, `impressions`, `link_clicks`, `landing_page_visits`, `demo_requests`, `qualified_demo_requests`; two invalid-row examples with expected rejection reasons.
- [ ] `data/fixtures/expected.json`: independent hand-calculated expected primary/secondary KPI per role and zero-denominator case.
- [ ] 6–8 labeled good/bad draft examples for claims validation.
- [ ] All seed/fixture JSON passes Zod validation before GL-07 and GL-08 respectively.

## C. Stack and environment decisions (Shawn; D1)
- [ ] GitHub repo access works through `gh auth status`; can create Issues **after joint approval**; no assumption that ChatGPT GitHub write access exists.
- [ ] Local repository cloned, branch/PR workflow agreed, 4 Markdown files uploaded and linked correctly.
- [ ] Node **24.x** installed; package versions pinned exactly and lockfile committed. Proposed as of Oct 21: Next 16.4.2; React 19.3.1; TS 5.9.3; Prisma/client/adapter-pg 7.10.1; Anthropic SDK 0.137.0; Zod 4.6.7; Tailwind 4.3.3; Vitest 5.0.5. Verify package availability before installing.
- [ ] One Next.js + TypeScript app; **no Python, FastAPI, SQLite, or monorepo**.
- [ ] Anthropic Console: key created, candidate model ID actually accessible, spend limit set. Never log or screenshot key.
- [ ] Neon PostgreSQL project/branch ready; runtime pooled `DATABASE_URL`, migrations/direct `DATABASE_URL_UNPOOLED`; confirm adapter-pg works, switch adapter only if smoke evidence requires.
- [ ] Vercel project linked; verify Node 24, runtime limits/Fluid compute and terms of plan; use preview first.
- [ ] `.env.example` includes only variable names: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `DEMO_ACCESS_CODE`.
- [ ] `.env.local` ignored; Prisma 7 CLI explicitly loads intended local environment; `prisma.config.ts` and explicit generator output configured.
- [ ] `CLAUDE.md` documents exact package pins, server-only Anthropic, Zod contract source, no LLM tools, controller-assigned IDs, KPI math, no unsupported SDK parameters, and issue-scoped changes.

## D. S0–S6 foundation smoke tests (record actual commands/results)
**S0 — Toolchain**
- [ ] `npm ci`, `npx prisma -v` (7.10.1, not an 8 RC), `npx tsc --noEmit`, `npm run build` pass after scaffold exists.

**S1 — Anthropic server-only real API**
- [ ] Script prints only `ANTHROPIC_API_KEY present: true` (never secret or length).
- [ ] `client.models.retrieve(process.env.ANTHROPIC_MODEL)` succeeds for account/model.
- [ ] Structured JSON parse smoke succeeds with installed SDK; verify actual `stop_reason` and parsed output. Candidate SDK 0.137.0 supports `messages.parse`, `output_config` and `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod`; check installed types and real server response. **Do not pass unsupported `thinking: disabled`, `budget_tokens`, forced `tool_choice` or legacy `output_format`**.
- [ ] **S1b:** nested Content DNA schema also accepted by real structured-output API.
- [ ] Errors report only safe error class/status; record usage and latency without secret values.

**S2 — Neon/PostgreSQL persistence**
- [ ] Prisma 7 uses driver adapter and explicit `prisma.config.ts`/output; migrations use direct connection.
- [ ] Write smoke row through pooled runtime URL, stop/restart app (and DB service if locally hosted), read same row, then clean up.
- [ ] On Vercel preview: write → redeploy → read same row. If preview unavailable, mark blocked and retry by D4; **local DB persistence is a hard prerequisite**.

**S3 — Secrets and client boundary**
- [ ] `lib/anthropic.ts` starts with `import "server-only"` and is never imported into client components.
- [ ] Search repo and `.next/static` for `sk-ant` yields no actual secrets; `.env*` excluded except `.env.example`.
- [ ] No `NEXT_PUBLIC_ANTHROPIC*`; error logs do not expose secrets or full DB URL.

**S4 — Vercel runtime**
- [ ] Preview deployed, Node 24 configured, compute/function duration confirmed, one protected real Anthropic route returns within chosen time budget.
- [ ] If hosting is blocked, explicitly mark S4 **BLOCKED** and use local path; do not claim preview success.

**S5 — Demo access protection and daily cap**
- [ ] No access code → 401 for generation/mutation endpoints; correct code → authorized response. Consider platform deployment protection in addition.
- [ ] Generation limit persists server-side, is tested, and rejects beyond cap. Do not rely on browser-only checks.

**S6 — No-cost unit tests**
- [ ] `npm test` uses mocked agent calls and does not make real network requests.
- [ ] Test harness supports deterministic KPI, approval state machine, schema and idempotency tests.

## E. Data/agent contract gates
- [ ] All entity IDs allocated by controller; LLMs receive **no direct tools or DB credentials**.
- [ ] Handoff schema v1.0 includes `task_id`, `correlation_id`, `idempotency_key`, `parent_experiment_id`, `approval_state`, `metric_ids`, `schema_version`; invalid version/missing task ID rejected.
- [ ] Controller calculates primary KPI with exact denominator, stores `metric_id`, and returns `not_calculable` on zero/missing denominator.
- [ ] Agent output validation blocks unapproved claim IDs and flags banned phrases; human review required.
- [ ] Experiment/content state machine has conditional updates, 409 invalid transition, unique `(experimentId, variantRole)` constraint.
- [ ] Simulated fixture matched by `experiment_id + variant_role`, quarantines invalid rows, labels all results `Simulated, pre-authored outcomes`.
- [ ] Agent refusals, truncated outputs, invalid JSON and timeouts produce visible errors; at most one schema repair retry.

## F. Five-day checkpoints and fallback
- [ ] **D1:** GL-01 decisions, GL-02/03 seed, GL-04/05 scaffold/contracts; S1 + local S2 **must pass**. S0–S6 preview results recorded if available.
- [ ] **D2:** exactly two Cycle 1 drafts, valid Content DNA, approved claims and human content approval.
- [ ] **D3:** Cycle 1 with validated fixture, exact KPI, Analytics proposal, human approval, persisted `exp_002`.
- [ ] **D4:** restart/redeploy persistence verified; Cycle 2 linked to Cycle 1; trace; E2E results; **freeze new features**.
- [ ] **D5:** fix critical bugs, actual `docs/test-report.md`, two rehearsals, fallback recording, updated README, joint final acceptance.
- [ ] If D3 Cycle 1 blocked: remove visual polish/trace UI (JSON endpoint okay), reduce nonessential tests; never skip approvals, actual LLM calls, schema validation or persistence.
- [ ] If Vercel remains blocked D4: documented local demo and backup recording; do not claim online deployment.

## G. Final two-cycle PASS evidence (D4–D5)
- [ ] Real Anthropic calls generate two Cycle 1 drafts; source claims valid; human gate enforced.
- [ ] Invalid fixture rows rejected; Michelle's independent expected KPI equals calculated results; zero denominator handled.
- [ ] Analytics cites stored metrics, expresses uncertainty, proposes one variable and stop rule; no invented causal proof.
- [ ] Approved `exp_002` saved and read after true restart/redeploy.
- [ ] Cycle 2 drafts cite `exp_002`, `parent_experiment_id=exp_001`, and prior findings; repeat click does not duplicate drafts.
- [ ] API E2E, refusal/invalid JSON/timeout cases actually executed and logged with PASS/FAIL/BLOCKED; no fictitious test results.
- [ ] No API keys in repo/client bundle; access code and cap tested; hypothetical/simulated labels visible.
- [ ] README updated with **verified** commands; demo rehearsed twice; official submission requirements checked.

## H. GO / NO-GO record
**Planning approval:** GO only after both approve A and necessary GrantReady claims in B.  
**Feature coding:** NO-GO if **S1 (real Anthropic)** or **local S2 (persistent PostgreSQL)** fails; fix before building features. A failed preview S4 can use documented local fallback temporarily.  
**Final submission:** PASS only with actual two-cycle evidence or an honest documented limitation.

| Gate | Actual result (PASS/FAIL/BLOCKED) | Evidence path / reviewer / date |
|---|---|---|
| Joint approval | PENDING | `docs/decisions.md` |
| S0–S6 | NOT RUN | `docs/smoke-report.md` |
| Cycle 1 | NOT RUN | `docs/test-report.md` |
| Cycle 2 / restart | NOT RUN | `docs/test-report.md` |
| Deployment | NOT RUN | `docs/test-report.md` |
| Final sign-off | PENDING | `docs/decisions.md` |


## Fixed operating policy (Shawn decision, 2026-10-21)
- **Primary KPI:** `qualified_demo_requests / landing_page_visits`; **secondary:** `qualified_demo_requests / link_clicks`. Show numerator and denominator. Zero/missing/invalid denominator returns `not_calculable`, never 0. A qualified request is a synthetic fixture count, not inferred by an LLM.
- **Approval responsibility:** Michelle reviews GrantReady claims and content drafts; Shawn approves Analytics Agent experiment proposals and technical release. Both can review final demo. The shared access code does **not** authenticate individual identities; `reviewer` is a selected/recorded demo role, not a verified identity. Never claim enterprise-grade RBAC.
- **Access control:** Protect all private pages and generation/mutation endpoints with a server-validated `DEMO_ACCESS_CODE` delivered outside the public repository. Use a secure server-side session/cookie after code entry (HttpOnly, Secure in production, SameSite=Lax) or a server-validated authorization header for test scripts. Do not rely on UI-only gating. Keep `/api/health` free of sensitive data. Reject unauthenticated requests with 401.
- **Abuse/cost controls:** Maximum **30 successful agent-generation calls per UTC day** across the deployment, enforced atomically in PostgreSQL (not in-memory). Also reject when quota is exhausted (429), configure a **$50 Anthropic workspace spend limit**, and retain SDK timeout/retry safeguards. The spend cap is a backstop, not a substitute for server authorization.
- **Human approvals:** All claims must be approved before use; every content draft and experiment proposal requires an explicit approval action, recorded with role, timestamp, decision, and relevant record ID. Rejected/unapproved records cannot advance.
- **Open external dependencies:** Michelle must confirm the actual GrantReady brief/claims and accept her proposed tasks; the official course deadline/format must be verified. These remain real-world confirmations, not architecture choices.
