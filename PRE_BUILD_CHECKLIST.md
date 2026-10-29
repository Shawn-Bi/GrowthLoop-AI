# GrowthLoop AI — Five-Day Pre-Build Checklist / GO–NO-GO

**Version:** 2.0 · 2026-10-21 · **Status:** Checklist only; unchecked items are not verified.  
**Target:** D1 Wed Oct 21, 2026; five working days end Tue Oct 27. **Never put keys, passwords or full connection strings in this document, issues or screenshots.**

**How to read the notes (updated 2026-10-29):** a ticked box means evidence exists of the kind its note names, and only that kind:
- **Smoke result (date, commit):** a historical run. Re-run it before relying on it.
- **Implemented on branch #N:** code and automated tests on that PR branch, not merged into `main` and not independently verified.
- **Verified by Michelle:** Michelle's own verification, at the commit cited.
- **Limitation:** an accepted MVP limitation.

Agreement on a requirement is not approval of its implementation or final sign-off. Open findings from Michelle's verification are tracked in `docs/decisions.md` §8.

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
- [x] GitHub repo access works through `gh auth status`; can create Issues **after joint approval**; no assumption that ChatGPT GitHub write access exists. — verified 2026-10-23: PRs #3–#9 opened with `gh`.
- [x] Local repository cloned, branch/PR workflow agreed, 4 Markdown files uploaded and linked correctly. — feature branches and stacked PRs in use.
- [x] Node **24.x** installed; package versions pinned exactly and lockfile committed. Proposed as of Oct 21: Next 16.4.2; React 19.3.1; TS 5.9.3; Prisma/client/adapter-pg 7.10.1; Anthropic SDK 0.137.0; Zod 4.6.7; Tailwind 4.3.3; Vitest 5.0.5. Verify package availability before installing. — PR #3; installed versions match the targets.
- [x] One Next.js + TypeScript app; **no Python, FastAPI, SQLite, or monorepo**.
- [x] Anthropic Console: key created, candidate model ID actually accessible, spend limit set. Never log or screenshot key. — key and `claude-sonnet-5-5` verified in S1 on 2026-10-23; spend limit not applicable (school-provided key), the daily cap is the cost control.
- [x] Neon PostgreSQL project/branch ready; runtime pooled `DATABASE_URL`, migrations/direct `DATABASE_URL_UNPOOLED`; confirm adapter-pg works, switch adapter only if smoke evidence requires. — S2 on 2026-10-23.
- [ ] Vercel project linked; verify Node 24, runtime limits/Fluid compute and terms of plan; use preview first. — project `growth-loop-ai` linked and previews used; Node 24 via `engines`; `maxDuration` 120 s accepted by the build; Fluid compute and plan terms not checked.
- [x] `.env.example` includes only variable names: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `DEMO_ACCESS_CODE`. — also lists the two smoke-only names.
- [x] `.env.local` ignored; Prisma 7 CLI explicitly loads intended local environment; `prisma.config.ts` and explicit generator output configured.
- [x] `CLAUDE.md` documents exact package pins, server-only Anthropic, Zod contract source, no LLM tools, controller-assigned IDs, KPI math, no unsupported SDK parameters, and issue-scoped changes. — PR #8.

## D. S0–S6 foundation smoke tests (record actual commands/results)
**S0 — Toolchain**
- [x] `npm ci`, `npx prisma -v` (7.10.1, not an 8 RC), `npx tsc --noEmit`, `npm run build` pass after scaffold exists. — 2026-10-23; use `npm run typecheck` (`next typegen && tsc --noEmit`), as bare `tsc` needs generated route types.

**S1 — Anthropic server-only real API**
- [x] Script prints only `ANTHROPIC_API_KEY present: true` (never secret or length). — `npm run smoke:anthropic`, 2026-10-23.
- [x] `client.models.retrieve(process.env.ANTHROPIC_MODEL)` succeeds for account/model. — `claude-sonnet-5-5`.
- [x] Structured JSON parse smoke succeeds with installed SDK; verify actual `stop_reason` and parsed output. Candidate SDK 0.137.0 supports `messages.parse`, `output_config` and `zodOutputFormat` from `@anthropic-ai/sdk/helpers/zod`; check installed types and real server response. **Do not pass unsupported `thinking: disabled`, `budget_tokens`, forced `tool_choice` or legacy `output_format`**. — via `messages.create` + `zodOutputFormat` and our Zod parse (`parse` loses usage on failure); `stop_reason: end_turn`, schema-valid on the first attempt.
- [ ] **S1b:** nested Content DNA schema also accepted by real structured-output API. — not run. The Content Agent integrated in this repo builds drafts from templates and doesn't call Claude (`docs/decisions.md` 2.7, open). Content DNA is validated with Zod when a draft is saved, approved and marked ready (implemented on branch #12/#14).
- [x] Errors report only safe error class/status; record usage and latency without secret values.

**S2 — Neon/PostgreSQL persistence**
- [x] Prisma 7 uses driver adapter and explicit `prisma.config.ts`/output; migrations use direct connection.
- [x] Write smoke row through pooled runtime URL, stop/restart app (and DB service if locally hosted), read same row, then clean up. — `smoke:db:write` → new process → `smoke:db:read` → cleanup, 2026-10-23.
- [x] On Vercel preview: write → redeploy → read same row. If preview unavailable, mark blocked and retry by D4; **local DB persistence is a hard prerequisite**. — written on deployment `BARus…`, read back on redeploy `BCdwk…`, 2026-10-23.

**S3 — Secrets and client boundary**
- [x] `lib/anthropic.ts` starts with `import "server-only"` and is never imported into client components. — no client component imports server modules.
- [x] Search repo and `.next/static` for `sk-ant` yields no actual secrets; `.env*` excluded except `.env.example`.
- [x] No `NEXT_PUBLIC_ANTHROPIC*`; error logs do not expose secrets or full DB URL. — routes log error class and path only.

**S4 — Vercel runtime**
- [x] Preview deployed, Node 24 configured, compute/function duration confirmed, one protected real Anthropic route returns within chosen time budget. — smoke results: protected analysis route returned in 11.8 s (< 120 s) on 2026-10-23, and in 17.0 s and 11.9 s on the #17 preview on 2026-10-29.
- [ ] If hosting is blocked, explicitly mark S4 **BLOCKED** and use local path; do not claim preview success. — N/A, the preview works.

**S5 — Demo access protection and daily cap**
- [x] No access code → 401 for generation/mutation endpoints; correct code → authorized response. Consider platform deployment protection in addition. — plus Vercel Authentication on previews; sign-in attempts limited (PR #9).
- [x] Generation limit persists server-side, is tested, and rejects beyond cap. Do not rely on browser-only checks. — 30 per UTC day, atomic in Postgres, 429.

**S6 — No-cost unit tests**
- [x] `npm test` uses mocked agent calls and does not make real network requests.
- [x] Test harness supports deterministic KPI, approval state machine, schema and idempotency tests. — Vitest plus PGlite.

## E. Data/agent contract gates
- [x] All entity IDs allocated by controller; LLMs receive **no direct tools or DB credentials**.
- [x] Handoff schema includes `task_id`, `correlation_id`, `idempotency_key`, `parent_experiment_id`, `approval_state`, `metric_ids`, `schema_version`; invalid version/missing task ID rejected. — v1.0 in PR #5. It is now **v1.1** (agreed on #13, implemented on branch #16): `content_change` is required from Cycle 2, and v1.0 is rejected. Michelle's #16 verification passed this.
- [x] Controller calculates primary KPI with exact denominator, stores `metric_id`, and returns `not_calculable` on zero/missing denominator. — PR #4; **verified by Michelle** on #4 at `5270d79` with the GL-03 fixture.
- [ ] Agent output validation blocks unapproved claim IDs and flags banned phrases; human review required. — implemented on branch #12/#14: unknown, rejected and unapproved claims are blocked at generation, approve and `mark_ready`. **Banned phrases are not implemented** (`docs/decisions.md` 2.6). Not yet verified by Michelle.
- [ ] Experiment/content state machine has conditional updates, 409 invalid transition, unique `(experimentId, variantRole)` constraint. — implemented on branch: proposals in #6/#7, drafts in #12. The unique constraint exists. Michelle's supplemental findings on #6, #7 and #12 are open (`docs/decisions.md` §8).
- [x] Simulated fixture matched by `experiment_id + variant_role`, quarantines invalid rows, labels all results `Simulated, pre-authored outcomes`.
- [ ] Agent refusals, truncated outputs, invalid JSON and timeouts produce visible errors; at most one schema repair retry. — implemented and tested for the Analytics Agent (#5). Doesn't apply to the template-based Content Agent unless a model call is added (2.7).

## F. Five-day checkpoints and fallback
This is the original plan, and its dates have passed. Current status is in §H and `docs/decisions.md`.
- [ ] **D1:** GL-01 decisions, GL-02/03 seed, GL-04/05 scaffold/contracts; S1 + local S2 **must pass**. S0–S6 preview results recorded if available.
- [ ] **D2:** exactly two Cycle 1 drafts, valid Content DNA, approved claims and human content approval.
- [ ] **D3:** Cycle 1 with validated fixture, exact KPI, Analytics proposal, human approval, persisted `exp_002`.
- [ ] **D4:** restart/redeploy persistence verified; Cycle 2 linked to Cycle 1; trace; E2E results; **freeze new features**.
- [ ] **D5:** fix critical bugs, actual `docs/test-report.md`, two rehearsals, fallback recording, updated README, joint final acceptance.
- [ ] If D3 Cycle 1 blocked: remove visual polish/trace UI (JSON endpoint okay), reduce nonessential tests; never skip approvals, actual LLM calls, schema validation or persistence.
- [ ] If Vercel remains blocked D4: documented local demo and backup recording; do not claim online deployment.

## G. Final two-cycle PASS evidence (D4–D5)
- [ ] Real Anthropic calls generate two Cycle 1 drafts; source claims valid; human gate enforced. — **open**: the integrated Content Agent is template-based (2.7). Claim validation and the human gate are implemented on branch #12/#14.
- [x] Invalid fixture rows rejected; Michelle's independent expected KPI equals calculated results; zero denominator handled. — **verified by Michelle** on #4 at `5270d79` (38/38).
- [x] Analytics cites stored metrics, expresses uncertainty, proposes one variable and stop rule; no invented causal proof. — implemented on branch #5/#7; smoke results with real Claude on 2026-10-23 and 2026-10-29.
- [x] Approved `exp_002` saved and read after true restart/redeploy. — smoke result on 2026-10-23 (new process, and redeploy `BARus…` → `BCdwk…`).
- [ ] Cycle 2 drafts cite `exp_002`, `parent_experiment_id=exp_001`, and prior findings; repeat click does not duplicate drafts. — implemented on branch #14 and #17 with integration tests. Smoke result on the #17 preview at `fc9c552` (2026-10-29): both Cycle 2 drafts generated. **Open:** Michelle's retest of the DNA fix (`9de2c9c`), and the live E2E with real Content Agent drafts.
- [ ] API E2E, refusal/invalid JSON/timeout cases actually executed and logged with PASS/FAIL/BLOCKED; no fictitious test results. — API E2E runs in tests over the production handlers (PGlite, stubbed Anthropic). The live E2E is open.
- [x] No API keys in repo/client bundle; access code and cap tested; hypothetical/simulated labels visible. — smoke result S3/S5 on 2026-10-23; access protection passed Michelle's #7 verification.
- [ ] README updated with **verified** commands; demo rehearsed twice; official submission requirements checked. — open (Michelle is reviewing the Lesson 7 requirements).

## H. GO / NO-GO record
**Planning approval:** GO only after both approve A and necessary GrantReady claims in B.  
**Feature coding:** NO-GO if **S1 (real Anthropic)** or **local S2 (persistent PostgreSQL)** fails; fix before building features. A failed preview S4 can use documented local fallback temporarily.  
**Final submission:** PASS only with actual two-cycle evidence or an honest documented limitation.

| Gate | Actual result (PASS/FAIL/BLOCKED) | Evidence path / reviewer / date |
|---|---|---|
| Joint approval | PENDING (draft, not signed) | `docs/decisions.md` |
| S0–S6 | Smoke results PASS except S1b (not run; see 2.7) | `docs/test-report.md`, 2026-10-23; S1, S2 and S4 re-run 2026-10-29 |
| KPI vs GL-03 | PASS, verified by Michelle | #4 at `5270d79`, 2026-10-29 |
| Cycle 1 | PARTIAL. Implemented on branch #12/#14 with integration tests; the live run needs GL-02 claims in Neon; the drafts are template-based (2.7). | `docs/test-report.md` |
| Cycle 2 / restart | PARTIAL. Restart and redeploy read-back is a 2026-10-23 smoke result. Cycle 2 draft generation is a smoke result on the #17 preview (2026-10-29). The DNA fix awaits Michelle's retest. | `docs/test-report.md` |
| Deployment | PASS (Vercel preview); production waits for the stack to merge | `docs/test-report.md` |
| Final sign-off | PENDING | `docs/decisions.md` |


## Fixed operating policy (Shawn decision, 2026-10-21)
- **Primary KPI:** `qualified_demo_requests / landing_page_visits`; **secondary:** `qualified_demo_requests / link_clicks`. Show numerator and denominator. Zero/missing/invalid denominator returns `not_calculable`, never 0. A qualified request is a synthetic fixture count, not inferred by an LLM.
- **Approval responsibility:** Michelle reviews GrantReady claims and content drafts; Shawn approves Analytics Agent experiment proposals and technical release. Both can review final demo. The shared access code does **not** authenticate individual identities; `reviewer` is a selected/recorded demo role, not a verified identity. Never claim enterprise-grade RBAC.
- **Access control:** Protect all private pages and generation/mutation endpoints with a server-validated `DEMO_ACCESS_CODE` delivered outside the public repository. Use a secure server-side session/cookie after code entry (HttpOnly, Secure in production, SameSite=Lax) or a server-validated authorization header for test scripts. Do not rely on UI-only gating. Keep `/api/health` free of sensitive data. Reject unauthenticated requests with 401.
- **Abuse/cost controls:** Maximum **30 successful agent-generation calls per UTC day** across the deployment, enforced atomically in PostgreSQL (not in-memory). Also reject when quota is exhausted (429), configure a **$50 Anthropic workspace spend limit**, and retain SDK timeout/retry safeguards. The spend cap is a backstop, not a substitute for server authorization.
- **Human approvals:** All claims must be approved before use; every content draft and experiment proposal requires an explicit approval action, recorded with role, timestamp, decision, and relevant record ID. Rejected/unapproved records cannot advance.
- **Open external dependencies:** Michelle must confirm the actual GrantReady brief/claims and accept her proposed tasks; the official course deadline/format must be verified. These remain real-world confirmations, not architecture choices.


## Updated Joint Pre-Build Checklist — October 21, 2026

This section reflects Michelle and Shawn's agreement to share technical implementation of GrowthLoop AI. It supersedes conflicting earlier role assignments in this checklist. All existing security, data-validation, cost-control, and human-approval requirements remain applicable.

### 1. Joint Project Decisions
- [ ] Confirm GrowthLoop AI as the Pursuit Cycle 3 multi-agent application.
- [ ] Confirm GrantReady as the hypothetical product used in the marketing demonstration, not a grant discovery application being built during this cycle.
- [ ] Review and approve the two-agent MVP scope, including Cycle 2 ending after generation of two new drafts.
- [ ] Confirm Michelle as Content Agent technical lead and Shawn as Analytics & Experiment Agent technical lead.
- [ ] Confirm shared responsibility for controller integration, testing, debugging, deployment, and understanding the complete workflow.
- [ ] Verify the official Pursuit deadline and required Pathfinder submission materials.
- [ ] Record joint decisions and approvals without claiming incomplete work is finished.

### 2. Michelle — Content Agent Development Readiness
- [ ] Prepare the hypothetical GrantReady product brief, ICP, approved claims, banned phrases, and labeled content examples.
- [ ] Review Content Agent input/output contracts with Shawn before implementation.
- [ ] Confirm Anthropic API access and the agreed TypeScript/Zod development approach.
- [ ] Implement Content Agent prompts and structured control/variant LinkedIn draft generation.
- [ ] Implement Content DNA output and Zod schema validation.
- [ ] Implement approved-claim checks and rejection or review handling for unsupported claims.
- [ ] Implement the content review and approval interface.
- [ ] Write unit tests using mocked agent responses and document actual results.
- [ ] Integrate Content Agent outputs with the shared controller.
- [ ] Implement Cycle 2 memory-backed draft generation in collaboration with Shawn.
- [ ] Participate in debugging, pull-request reviews, integration testing, and deployment verification.

### 3. Shawn — Analytics & Experiment Agent Development Readiness
- [x] Scaffold the Next.js/TypeScript application and verify required environment configuration.
- [x] Confirm Anthropic, PostgreSQL/Neon, and deployment smoke-test results. — see `docs/test-report.md`.
- [x] Review agent handoff contracts and shared data schemas with Michelle. — requirements agreed on #13. The implementations are under her review on #5–#17.
- [x] Implement simulated-metrics ingestion and deterministic KPI calculations. — PR #4.
- [x] Verify calculated KPIs against Michelle's independently prepared expected values. — **verified by Michelle** on #4 at `5270d79` (2026-10-29); she approved #4.
- [x] Implement Analytics & Experiment Agent prompts, structured output, metric references, uncertainty statements, and one-variable next-test proposals. — PR #5.
- [x] Implement experiment proposal review and approval interface. — PR #7.
- [x] Lead Prisma/PostgreSQL persistence and Experiment Memory implementation. — PR #6.
- [x] Write unit tests using mocked agent responses and document actual results. — PRs #4–#17. Test counts change per branch, so they're recorded in `docs/test-report.md` instead of here.
- [ ] Participate in debugging, pull-request reviews, integration testing, and deployment verification.

### 4. Shared Engineering and Integration Checks
- [x] Agree on versioned Content Agent and Analytics Agent input/output contracts. — requirements agreed on #13 (Content DNA 1.0, handoff 1.1). This is agreement only, not approval of the implementation.
- [ ] Review TypeScript/Zod schemas, database entities, and controller state transitions together. — in progress: Michelle's independent verification of #4–#17 (`docs/decisions.md` §8).
- [ ] Ensure agents cannot bypass deterministic validation, KPI calculations, approval gates, or database controls. — implemented on branch with tests. Michelle's findings are open, and the fixes await her retest.
- [ ] Test the full Cycle 1 workflow from approved brief to saved experiment proposal. — integration tests on branch #12+. The live run is open (needs GL-02 claims).
- [ ] Test the Cycle 2 handoff from persisted Experiment Memory to new Content Agent drafts. — integration tests on branch #14+, and a smoke result on the #17 preview (2026-10-29). The live joint E2E is open.
- [ ] Verify rejected or unapproved content and experiments cannot advance. — implemented on branch with tests. Awaiting Michelle's retest.
- [x] Verify simulated metrics remain clearly labeled and are never represented as real campaign outcomes. — labels on every experiment screen.
- [x] Verify database persistence after application restart or redeployment. — see `docs/test-report.md`.
- [ ] Verify existing API key protection, access controls, call quotas, and spend-limit requirements.
- [ ] Review each other's pull requests and record actual test evidence.
- [ ] Practice debugging together and document root causes and fixes.
- [ ] Confirm both partners can explain and demonstrate the complete system.

### 5. Documentation, Demo, and Submission
- [ ] Align PRD.md, TEAM_TASKS.md, PRE_BUILD_CHECKLIST.md, and README.md with the agreed technical responsibilities.
- [ ] Record actual joint decisions in docs/decisions.md when created.
- [ ] Collaboratively complete Pursuit's official Multi-Agent PRD Google Docs template.
- [ ] Submit the official PRD link through Pathfinder according to verified requirements.
- [ ] Rehearse the complete two-agent demonstration together.
- [x] Record actual tests, unresolved issues, and deployment status. — `docs/test-report.md`.
- [ ] Obtain joint approval before treating the project as ready for final submission.

### Completion Status
All checklist items above are initially unchecked. This section documents agreed responsibilities and planned verification steps; it does not claim that coding, tests, deployment, or course submission have been completed.

**Update 2026-10-23:** items are checked only where evidence exists (see `docs/test-report.md` and the linked PRs). Partly done items stay unchecked with a note. Joint decisions remain unsigned in `docs/decisions.md`.

**Update 2026-10-29:** these notes now follow Michelle's documentation audit of #10. Each note says whether the evidence is a historical smoke result, an implementation on a PR branch, or Michelle's independent verification, and limitations are named. The document stays a DRAFT and is unsigned.
