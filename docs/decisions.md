# GrowthLoop AI — Decision Log (GL-01)

**Status: DRAFT, not signed.** Shawn drafted it on 2026-10-23. It was updated on 2026-10-29 with the contract decisions Michelle finalized on PR #13 and the agreements in the PR #4–#12 review threads. Nothing here counts as signed until both of us approve. Per PRD §12, an approving review on the PR that adds or changes this file may serve as sign-off. Disagreements go in PR comments, and we edit before merging.

**Status values:**
- **Fixed**: set as policy in the PRD by Shawn on 2026-10-21; Michelle still needs to acknowledge it.
- **Agreed**: both of us agreed in writing in the PR thread cited.
- **Implemented**: built in the code; needs joint review.
- **Open**: needs a decision or input.

## 1. Scope and schedule

| # | Decision | Status | Where |
|---|---|---|---|
| 1.1 | Five-working-day P0 scope; P1/P2 deferrals as listed in PRD §2. | Fixed | PRD §2 |
| 1.2 | The demo shows **two cycles**: Cycle 2 ends at draft generation and optional approval, with no second metrics analysis. | Fixed | PRD §2 P0 #7 |
| 1.3 | The feedback loop keeps iterating: cycle N → N+1, parent-linked and human-approved. The demo is capped at two cycles by `MAX_EXPERIMENT_CYCLES` (default 2, configurable). Approving at the cap returns 409, and the page explains that the loop stops there. | **Agreed** (Michelle on #10, 2026-10-27) / Implemented | `lib/controller/cycle-rules.ts`, PR #17 (includes a cycle 3 test with the limit raised) |
| 1.4 | The internal target was Tue 2026-10-27. The official Pursuit deadline, format and Pathfinder submission still need checking. | **Open** (both) | PRD §11 |
| 1.5 | Ownership: Michelle leads the Content Agent, GL-02/03 inputs and content review. Shawn leads Analytics, persistence, the controller and deployment. Integration, E2E and demo are shared. | Fixed | PRD §15, TEAM_TASKS §8 |

## 2. Product inputs (Michelle)

| # | Decision | Status | Where |
|---|---|---|---|
| 2.1 | GrantReady is a hypothetical product; GrowthLoop markets it and doesn't implement grant features. | Fixed | PRD §1 |
| 2.2 | One ICP and geography, one LinkedIn organic channel (`channel: "linkedin_organic"` in Content DNA). | **Open** (GL-02 seed) | `data/seed/icp.json` (pending) |
| 2.3 | Claim registry statuses are `approved_demo_claim`, `verified_claim` and `rejected_claim`. Only the first two may be used; missing or unreviewed IDs are prohibited. Claims are checked when content is generated, approved and marked ready. A claim dropped from `claims.json` is kept as `rejected_claim`, so its history stays readable but it can't be used again. | Fixed / **Agreed** (retention: Michelle on #11; `mark_ready` recheck: Michelle on #12; both 2026-10-27) / Implemented | `lib/persistence/claims.ts` (PR #11), `lib/persistence/drafts.ts`, `lib/controller/content-generation.ts` |
| 2.4 | The final GrantReady claims, with evidence and statuses, go in `data/seed/claims.json` and are loaded with `npm run db:seed`. | **Open** (GL-02, Michelle; Shawn reviews and loads) | `data/seed/claims.json` (pending) |
| 2.5 | Outcomes come from a pre-authored simulated JSON fixture in `data/fixtures/`, not real data. CSV upload is P1. | Fixed / Implemented: Michelle's `demo_fixture_v1.json` and `expected.json` were merged with PR #15 on 2026-10-29. Her tests pass 38/38 against the KPI code. | PR #15, `tests/kpi/gl-03-fixture.test.ts` |
| 2.6 | Banned phrases: `data/seed/banned_phrases.json`, including unverified guarantees, plus automated phrase checks. Humans make the final decision (PRD §4). | **Open** (joint). Proposed: Michelle supplies the list and checks it at generation; Shawn re-checks it at approve and `mark_ready`, like claims. | Not implemented yet |

## 3. Metrics

| # | Decision | Status | Where |
|---|---|---|---|
| 3.1 | **Primary KPI** is `qualified_demo_requests / landing_page_visits`; **secondary** is `qualified_demo_requests / link_clicks`. Both show numerator and denominator. A zero, missing or invalid denominator is `not_calculable`, never 0, and a missing value is never 0. | Fixed / Implemented; matches GL-03 `expected.json` | `lib/kpi/calculate.ts`, PR #4, PR #15 |
| 3.2 | Metric ID format: `met_<dataset>_<experiment>_<role>_<metric>`. It is deterministic, so recomputing the same dataset gives the same IDs. Handoff and Content DNA carry the same IDs, and substituted IDs are rejected. | **Agreed** (Michelle on #4, 2026-10-27) / Implemented | PR #4, `tests/integration/content-loop.test.ts` |
| 3.3 | Fixture rules: rows must follow the funnel order; duplicates are all quarantined; only drafts approved for publication receive outcomes; one dataset per experiment. | Implemented / review | `lib/kpi/ingest.ts`, `lib/controller/workflow.ts` |
| 3.4 | Agents never do arithmetic. Findings must cite stored metric IDs. The proposal becomes an error, so it can't be approved, when it cites unknown IDs or changes anything other than its one primary test variable. Unverified numbers and causal wording are flagged for the approver. | **Agreed** (strict single variable: PR #13, and Michelle on #5, 2026-10-27) / Implemented | `lib/agents/analytics/review.ts` (PR #5), `lib/controller/proposal-approval.ts` |

## 4. Approvals and access

| # | Decision | Status | Where |
|---|---|---|---|
| 4.1 | Roles: `content_reviewer` (Michelle) decides drafts; `experiment_approver` (Shawn) decides proposals. These are recorded demo roles, not verified identities, and the UI says so. There is no RBAC claim. | Fixed / Implemented | PR #5, #12, #14 |
| 4.2 | Every decision is an audit event with role, timestamp and record ID. Status changes use conditional updates, so a wrong role gets 403 and an illegal or repeated change gets 409. | Implemented for drafts and proposals | PR #6, #12 |
| 4.3 | Approval safeguards (PR #13 decision 6):<ul><li>each draft is approved on its own;</li><li>claims and Content DNA are re-checked at approve and `mark_ready`;</li><li>analysis needs two approved drafts;</li><li>Analytics proposals need human approval before Cycle 2;</li><li>nothing publishes automatically.</li></ul> | **Agreed** (PR #13) / Implemented | `lib/persistence/drafts.ts`, `lib/controller/workflow.ts`, PR #12, #14 |
| 4.4 | Cycle 2 baseline (PR #13 decision 3):<ul><li>to approve, the experiment approver records `control_better`, `variant_better` or `inconclusive`;</li><li>only `variant_better` moves the baseline to the variant; otherwise the control, which is the previous baseline, stays;</li><li>if either primary KPI is `not_calculable`, only `inconclusive` is allowed;</li><li>the outcome is stored on the proposal and its audit event;</li><li>the system never picks a winner.</li></ul> | **Agreed** (PR #13) / Implemented | `lib/controller/cycle-rules.ts`, PR #17 |
| 4.5 | **Demo access** works as follows: <ul><li>one server-validated `DEMO_ACCESS_CODE`;</li><li>an HttpOnly, SameSite=Lax session cookie (Secure in production), derived from the code, so there is no `SESSION_SECRET`;</li><li>a bearer code for scripts;</li><li>`proxy.ts` plus per-route and per-page checks;</li><li>401 when unauthenticated;</li><li>`/api/health` is public and reveals nothing.</li></ul> | Implemented | PR #7 |
| 4.6 | Sign-in attempts are limited to 10 per client per 15 minutes, in Postgres, storing hashed addresses; this covers the form and bearer codes. On Vercel the client address comes from `X-Forwarded-For`, which Vercel overwrites. | Implemented; Michelle approved #9 | PR #9 |
| 4.7 | Vercel Authentication stays on for previews; scripts use the Protection Bypass for Automation. Michelle was given access to the #17 preview on 2026-10-29. | Implemented (Vercel settings) | `docs/test-report.md` |

## 5. Cost and abuse controls

| # | Decision | Status | Where |
|---|---|---|---|
| 5.1 | No Anthropic spend limit: the API key is provided by the school and has no limit we can set, so the PRD's $50 cap doesn't apply. The daily cap (5.2) is the cost control. | Not applicable | PRD §9 |
| 5.2 | Max 30 successful agent generations per UTC day, counted atomically in Postgres. A slot is released when a call fails, and requests past the cap get 429. | Implemented | `lib/persistence/quota.ts`, PR #6/#7 |
| 5.3 | The Analytics Agent runs at `effort: "medium"` with `max_tokens` 16000. The analysis route has `maxDuration` 120 s. On the #17 preview it took 17.0 s (2026-10-29). | Implemented | PR #5/#7, `docs/test-report.md` |

## 6. Stack and platform

| # | Decision | Status | Where |
|---|---|---|---|
| 6.1 | One Next.js app with exact pins: Next 16.4.2, React 19.3.1, TS 5.9.3, Prisma 7.10.1, Anthropic SDK 0.137.0, Zod 4.6.7, Tailwind 4.3.3, Vitest 5.0.5, Node 24.x, plus `.npmrc save-exact`. No Python, SQLite, monorepo or agent framework. | Implemented | PR #3, `CLAUDE.md` (PR #8) |
| 6.2 | The model is `claude-sonnet-5-5` via `ANTHROPIC_MODEL`, never hardcoded. It was verified for this account in S1 on 2026-10-23 and re-run on 2026-10-29. | Implemented | `docs/test-report.md` |
| 6.3 | Structured output uses `messages.create` + `zodOutputFormat`, validated with our Zod contract, with one append-only repair. It sends no `thinking` setting, no forced `tool_choice`, and not the legacy `output_format`. | Implemented | PR #5 |
| 6.4 | No server-side refusal `fallbacks` for now: they would silently run a model that S1 hasn't verified. We can revisit. | Implemented / revisit | PR #5 |
| 6.5 | Neon Postgres (us-east-2) is shared by local development and Vercel previews. A per-developer Neon branch is optional. Migrations run with `npm run db:migrate`; both migrations were applied on 2026-10-29. | Implemented | `.env.example`, `prisma/migrations/` |
| 6.6 | Vercel project `growth-loop-ai`: one preview per branch, production = `main`. | Implemented | `docs/test-report.md` |
| 6.7 | Keep `cacheComponents` and `partialPrefetching` on. Pages read runtime data behind `<Suspense>`. This was raised in the #2 review. | Implemented / **confirm** | `next.config.ts` |
| 6.8 | Unit and integration tests make no network calls. Persistence tests run on PGlite (community adapter, dev only). Real calls happen only in `smoke/`. | Implemented | PR #6, `CLAUDE.md` |

## 7. Shared contracts (finalized by Michelle on PR #13)

| # | Contract | Status | Where |
|---|---|---|---|
| 7.1 | **Handoff v1.1**, controller → Content Agent (`schemas/handoff.ts`). It keeps every v1.0 field. `content_change` (`baseline_content_id`, `variant_value`) is required from Cycle 2, and the baseline must be one of `source_content_ids`. The controller and the Content Agent both parse with this schema, so a v1.0 payload is rejected at either end. | **Agreed** (decision 4) / Implemented | PR #16 |
| 7.2 | **Content DNA 1.0** (`schemas/content.ts`) has these fields: `icp`, `pain_point`, `hook`, `value_proposition`, `evidence`, `cta`, `channel`, `primary_test_variable`, `variant_role` and `claim_ids_used`, plus the brief and the generation context. It's validated when a draft is saved and again at approve and `mark_ready`. | **Agreed** (decision 1) / Implemented | PR #14, PR #12 |
| 7.3 | Test variables are `pain_point`, `hook`, `value_proposition`, `evidence` and `cta`. They map explicitly to Content DNA fields, and exactly one changes per cycle; invalid pairs are blocked. | **Agreed** (decision 2) / Implemented | PR #14, PR #5 |
| 7.4 | Evidence tests vary only `evidence`, use registry-approved claims verbatim and keep the "Hypothetical product — demonstration only" label. | **Agreed** (decision 5) / Implemented | `lib/content-agent/handoff.ts`, `lib/persistence/drafts.ts` |
| 7.5 | IDs: `prop_<experiment>_<n>`; the next experiment ID follows the parent's (`exp_001` → `exp_002`); drafts are `cnt_<experiment>_<role>`. | Implemented | PR #7, PR #14 |
| 7.6 | Tables: `ContentDraft` and `Claim` (PR #6), with Claim rows kept on removal (PR #11). `AnalysisReport.outcome` and `AuditEvent.outcome` were added by migration `20261029000000_proposal_outcome` (PR #17). | Implemented | `prisma/schema.prisma` |

## 8. Accounts (no secrets)

| Account | Owner |
|---|---|
| GitHub repo `Shawn-Bi/GrowthLoop-AI` | Shawn |
| Anthropic API key | Provided by the school (Pursuit); used by Shawn |
| Neon project | Shawn |
| Vercel project `growth-loop-ai` (team `shawn-9964`) | Shawn |

Shawn shared the local environment values with Michelle privately on 2026-10-23. Secrets never go in the repo, issues or screenshots.

## Still open before sign-off

- **1.4 (both):** the official Pursuit deadline and submission requirements.
- **2.2 and 2.4 (Michelle, GL-02):** the ICP seed and the final GrantReady claims. Shawn reviews and loads them.
- **2.6 (joint):** banned phrases, both the list and the checks.
- **Joint:** the live two-cycle E2E on the preview with real Content Agent drafts and real Claude, recorded in `docs/test-report.md`.

## Sign-off

Only actual approvals are filled in.

| Area | Shawn | Michelle | Date / evidence |
|---|---|---|---|
| Scope, deferrals, two-cycle demo (§1) | Pending | Pending | |
| Ownership and reviewer roles (§1.5, §4.1) | Pending | Pending | |
| KPI, fixture and claim policy (§2–§3) | Pending | Pending | |
| Access and daily cap (§4–§5) | Pending | Pending | |
| Contracts (§7) | Pending | Pending | |
| Official deadline and submission (§1.4) | Pending | Pending | |
