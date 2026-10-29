# GrowthLoop AI — Decision Log (GL-01)

**Status: DRAFT, not signed.** Shawn drafted it on 2026-10-23. It was updated on 2026-10-29 after Michelle's independent verification and documentation audit of PRs #4–#17. Nothing here counts as signed until both of us approve this file. Per PRD §12, an approving review on the PR that changes it may serve as sign-off. Disagreements go in PR comments, and we edit before merging.

**Agreeing on a requirement is not approval of its implementation, and not final integration sign-off.** Michelle's agreement in a PR thread means we agree what the system must do. Whether the code does it is recorded separately below.

**Status values** (an item can carry more than one):
- **Fixed**: set as policy in the PRD by Shawn on 2026-10-21; Michelle still needs to acknowledge it.
- **Requirement agreed**: we both agreed in writing, in the PR thread cited, what the system must do.
- **Implemented on branch**: code and automated tests exist on the PR branch named. It isn't merged into `main` and isn't independently verified unless stated.
- **Verified by Michelle**: Michelle independently verified it at the commit cited.
- **Smoke result**: a recorded run on the date and commit cited. It's historical; re-run it before relying on it.
- **Limitation**: an accepted MVP limitation that we state in the demo.
- **Open**: not done, or fixed but awaiting Michelle's retest.

## 1. Scope and schedule

| # | Decision | Status | Where |
|---|---|---|---|
| 1.1 | Five-working-day P0 scope; P1/P2 deferrals as listed in PRD §2. | Fixed | PRD §2 |
| 1.2 | The demo shows **two cycles**: Cycle 2 ends at draft generation and optional approval, with no second metrics analysis. | Fixed | PRD §2 P0 #7 |
| 1.3 | The feedback loop keeps iterating (cycle N → N+1, parent-linked, human-approved). The demo is capped at two cycles by `MAX_EXPERIMENT_CYCLES` (default 2, configurable). | Requirement agreed (Michelle on #10, 2026-10-27). Implemented on branch #17 (`lib/controller/cycle-rules.ts`). | PR #17 |
| 1.4 | The internal target was Tue 2026-10-27. The official Pursuit deadline, format and Pathfinder submission still need confirming. Michelle is reviewing the Lesson 7 README and repository requirements. | **Open** (both) | PRD §11 |
| 1.5 | Ownership: Michelle leads the Content Agent, GL-02/03 inputs and content review. Shawn leads Analytics, persistence, the controller and deployment. Integration, E2E and demo are shared. | Fixed | PRD §15, TEAM_TASKS §8 |
| 1.6 | Fallback: if the integration isn't ready, Michelle may present her standalone Content Agent. LaNice approved this. | Noted (2026-10-29) | Michelle's message |

## 2. Product inputs (Michelle)

| # | Decision | Status | Where |
|---|---|---|---|
| 2.1 | GrantReady is a hypothetical product; GrowthLoop markets it and doesn't implement grant features. | Fixed | PRD §1 |
| 2.2 | One ICP and geography, one LinkedIn organic channel (`channel: "linkedin_organic"`). | **Open** (GL-02 seed) | `data/seed/icp.json` (missing) |
| 2.3 | Claim statuses are `approved_demo_claim`, `verified_claim` and `rejected_claim`. Only the first two may be used. Claims are checked at generation, approve and `mark_ready`. A claim dropped from `claims.json` is kept as `rejected_claim`. A stored claim's text and evidence can't be changed: a reworded claim needs a new `claim_id`. Blank or whitespace-only claim fields are rejected. | Requirement agreed (retention: #11; `mark_ready` recheck: #12; both 2026-10-27). Implemented on branch: #11 `28d3afb`, `671b254`; #12 and #14. Open: awaiting Michelle's retest. | `lib/persistence/claims.ts`, `lib/persistence/drafts.ts` |
| 2.4 | The final GrantReady claims, with evidence and statuses, go in `data/seed/claims.json` and are loaded with `npm run db:seed`. | **Open** (GL-02, Michelle; Shawn reviews and loads). Neon has 0 claims, so the preview can't generate real drafts yet. | `data/seed/claims.json` (missing) |
| 2.5 | Outcomes come from Michelle's pre-authored simulated fixture (`demo_fixture_v1.json`, `expected.json`), not real data. CSV upload is P1. | **Verified by Michelle** (#4 at `5270d79`, 38/38 tests, KPIs 10% / 8% / 15% / 12.5%). | PR #15 → #4 |
| 2.6 | Banned phrases: `data/seed/banned_phrases.json` (unverified guarantees), checked automatically, with humans making the final decision (PRD §4). | **Open** (joint). Proposed split: Michelle checks at generation; Shawn re-checks at approve and `mark_ready`. Not implemented. | — |
| 2.7 | TEAM_TASKS GL-07 asks for a real Sonnet call that returns two JSON drafts. The Content Agent integrated in this repo builds drafts from templates and doesn't call Claude. | **Open** (Michelle, GL-07): either integrate the model call or document it as a limitation. | `lib/content-agent/` |

## 3. Metrics

| # | Decision | Status | Where |
|---|---|---|---|
| 3.1 | **Primary KPI** is `qualified_demo_requests / landing_page_visits`; **secondary** is `qualified_demo_requests / link_clicks`. Both show numerator and denominator. A zero, missing or invalid denominator is `not_calculable`, never 0. | Fixed. **Verified by Michelle** (#4 at `5270d79`). | `lib/kpi/calculate.ts` |
| 3.2 | Metric ID format: `met_<dataset>_<experiment>_<role>_<metric>`, deterministic. | Requirement agreed (Michelle on #4, 2026-10-27). Verified by Michelle for KPI output (#4). The handoff schema doesn't check that IDs exist; generation checks them against the parent's stored metrics (#14), and so does approval (#7 `8798d42`). Open: awaiting retest. | PR #4, #7, #14 |
| 3.3 | Fixture rules: rows must follow the funnel order; duplicates are all quarantined; only approved drafts receive outcomes; one dataset per experiment. | Implemented on branch #4. Invalid-row quarantine verified by Michelle (#4). | `lib/kpi/ingest.ts` |
| 3.4 | Agents never do arithmetic. Findings must cite stored metric IDs. A proposal that cites unknown IDs or changes anything other than its one primary test variable is an error, so it can't be approved. Approval re-runs this review on the stored proposal. | Requirement agreed (strict single variable: #13, and #5 on 2026-10-27). Implemented on branch: #5 `7f17b6c`, #7 `8798d42`, #14. Open: Michelle found that `decideProposal` on #5 alone doesn't block this; it is blocked from #7 and #14 onward. Awaiting retest. | `lib/agents/analytics/review.ts`, `lib/controller/proposal-revalidation.ts` |

## 4. Approvals and access

| # | Decision | Status | Where |
|---|---|---|---|
| 4.1 | Roles: `content_reviewer` (Michelle) decides drafts; `experiment_approver` (Shawn) decides proposals. The role comes from the request: it is a recorded demo role, not a verified identity, and there is no RBAC. | Fixed. **Limitation** (also raised in Michelle's #7 verification); the UI says so. | PRD fixed policy |
| 4.2 | Every decision is an audit event with role, timestamp and record ID. A wrong role gets 403; an illegal or repeated change gets 409. | Implemented on branch #6, #12 | — |
| 4.3 | Approval safeguards (PR #13 decision 6):<ul><li>each draft is approved on its own;</li><li>claims and Content DNA are re-checked at approve and `mark_ready`, and the DNA must match the draft's role and claim IDs;</li><li>analysis needs two approved drafts;</li><li>Analytics proposals need human approval before Cycle 2;</li><li>nothing publishes automatically.</li></ul> | Requirement agreed (#13). Implemented on branch #12 (`b69b7c4`) and #14. Open: Michelle's remaining DNA-consistency findings need her full list. | `lib/persistence/drafts.ts` |
| 4.4 | Cycle 2 must have its drafts. Approval generates them in the same transaction. If the baseline's Content DNA is missing, empty or invalid, approval returns 409 and rolls back completely. | Implemented on branch: #12 `9de2c9c`, carried to #16 and #17. Michelle found the defect, and regression tests reproduce it. Smoke result on 2026-10-29 at `fc9c552`: the preview generated both Cycle 2 drafts. **Open: awaiting Michelle's retest.** | `lib/persistence/experiments.ts` |
| 4.5 | Cycle 2 baseline (PR #13 decision 3): the approver records `control_better`, `variant_better` or `inconclusive`. Only `variant_better` moves the baseline. If either primary KPI is `not_calculable`, only `inconclusive` is allowed. The outcome is stored on the proposal and its audit event, and the system never picks a winner. | Requirement agreed (#13). Implemented on branch #17. Michelle's #17 verification passed this part. | `lib/controller/cycle-rules.ts` |
| 4.6 | **Demo access** works as follows: <ul><li>one server-validated `DEMO_ACCESS_CODE`;</li><li>an HttpOnly, SameSite=Lax session cookie;</li><li>a bearer code for scripts;</li><li>`proxy.ts` plus per-route checks;</li><li>401 when unauthenticated;</li><li>a public `/api/health` that reveals nothing.</li></ul> | Implemented on branch #7. Michelle's #7 verification passed access protection. | PR #7 |
| 4.7 | Sign-in attempts are limited to 10 per client per 15 minutes, in Postgres, using hashed addresses. On Vercel the client address comes from `X-Forwarded-For`, which Vercel overwrites. | Implemented on branch #9; Michelle approved #9 | PR #9 |
| 4.8 | Vercel Authentication stays on for previews; scripts use the Protection Bypass for Automation. Michelle was given access to the #17 preview on 2026-10-29. | Implemented (Vercel settings) | — |

## 5. Cost and abuse controls

| # | Decision | Status | Where |
|---|---|---|---|
| 5.1 | No Anthropic spend limit: the API key is provided by the school and has no limit we can set. The daily cap (5.2) is the cost control. | Not applicable | PRD §9 |
| 5.2 | Max 30 successful agent generations per UTC day, counted atomically in Postgres; requests past the cap get 429. | Implemented on branch #6/#7 (tested on PGlite) | `lib/persistence/quota.ts` |
| 5.3 | The Analytics Agent runs at `effort: "medium"` with `max_tokens` 16000, and the analysis route has `maxDuration` 120 s. | Smoke results: 11.8 s (2026-10-23); 17.0 s and 11.9 s (2026-10-29, #17 preview) | `docs/test-report.md` |

## 6. Stack and platform

| # | Decision | Status | Where |
|---|---|---|---|
| 6.1 | One Next.js app with exact pins: Next 16.4.2, React 19.3.1, TS 5.9.3, Prisma 7.10.1, Anthropic SDK 0.137.0, Zod 4.6.7, Tailwind 4.3.3, Vitest 5.0.5, Node 24.x. | Implemented (PR #3, merged into `main`) | `package.json` |
| 6.2 | The model is `claude-sonnet-5-5` via `ANTHROPIC_MODEL`, never hardcoded. | Smoke results: S1 on 2026-10-23 and 2026-10-29 | `docs/test-report.md` |
| 6.3 | Structured output uses `messages.create` + `zodOutputFormat`, validated with our Zod contract, with one append-only repair. | Implemented on branch #5 | — |
| 6.4 | No server-side refusal `fallbacks` for now. | Implemented / revisit | — |
| 6.5 | Neon Postgres is shared by local development and previews. Migrations run with `npm run db:migrate`; both migrations were applied on 2026-10-29. Michelle hasn't verified live Neon herself: her `npm ci` hit a Prisma download 403 locally. | Smoke results: 2026-10-23 and 2026-10-29. **Open:** joint live verification. | `prisma/migrations/` |
| 6.6 | Vercel project `growth-loop-ai`: one preview per branch, production = `main`. | Implemented | — |
| 6.7 | Keep `cacheComponents` and `partialPrefetching` on. | Implemented / **confirm** | `next.config.ts` |
| 6.8 | Unit and integration tests make no network calls (PGlite for persistence). Real calls happen only in `smoke/`. | Implemented | — |

## 7. Shared contracts (finalized by Michelle on PR #13)

| # | Contract | Status | Where |
|---|---|---|---|
| 7.1 | **Handoff v1.1** (`schemas/handoff.ts`) keeps every v1.0 field, and `content_change` is required from Cycle 2, with its baseline one of `source_content_ids`. The controller and the Content Agent both parse with this schema. | Requirement agreed (decision 4). Implemented on branch #16. Michelle's #16 verification passed this, except for the DNA defect in 4.4. | PR #16 |
| 7.2 | **Content DNA 1.0** (`schemas/content.ts`): `icp`, `pain_point`, `hook`, `value_proposition`, `evidence`, `cta`, `channel`, `primary_test_variable`, `variant_role`, `claim_ids_used`, plus the brief and the generation context. | Requirement agreed (decision 1). Implemented on branch #14 and #12. Open: Michelle's DNA-consistency findings. | PR #14, #12 |
| 7.3 | The five test variables map explicitly to Content DNA fields, and exactly one changes per cycle. | Requirement agreed (decision 2). Implemented on branch #5, #14. | — |
| 7.4 | Evidence tests vary only `evidence`, use registry-approved claims verbatim, and keep the hypothetical label. | Requirement agreed (decision 5). Implemented on branch #14, #12. | — |
| 7.5 | IDs: `prop_<experiment>_<n>`; the next experiment follows the parent's (`exp_001` → `exp_002`); drafts are `cnt_<experiment>_<role>`. | Implemented on branch #7, #14 | — |
| 7.6 | Tables `ContentDraft` and `Claim`, plus `AnalysisReport.outcome` and `AuditEvent.outcome` (migration `20261029000000_proposal_outcome`). | Implemented on branch #6, #11, #17 | `prisma/schema.prisma` |

## 8. Findings from Michelle's independent verification (2026-10-29)

| PR | Finding | Status |
|---|---|---|
| #12, #16, #17 | **Critical:** approval committed a child experiment without Cycle 2 drafts when the baseline Content DNA was missing or empty. | Fixed on branch (`9de2c9c` → #16, #17). Regression tests fail on the old code. Awaiting retest. |
| #5 | `decideProposal` accepted a constructed multi-variable proposal. | Blocked from #7 (`8798d42`) and #14 onward. Awaiting retest. |
| #5 | The handoff schema accepts metric IDs that don't exist. | By design, the schema can't see the database. Generation (#14) and approval (`8798d42`) check IDs against stored metrics. Awaiting retest. |
| #7 | Stored proposals weren't re-validated at approval. | Fixed on branch (`8798d42`). Awaiting retest. |
| #7 | Reviewer roles are supplied in the request. | Limitation (4.1). |
| #11 | Restoring a claim ID with changed metadata overwrote history. | Fixed on branch (`671b254`): text and evidence are immutable. Status and reviewer changes keep only the latest value, which is a limitation since there is no change-history table. Awaiting retest. |
| #11 | Whitespace-only metadata was accepted. | Fixed on branch (`671b254`). Awaiting retest. |
| #11 | Some lower-level paths bypass claim eligibility. | **Open**: needs the specific paths from Michelle. |
| #12, #17 | Content DNA consistency. | Partly addressed (`b69b7c4`: DNA must match the draft's role and claims). **Open** for the rest. |
| All | Banned-phrase enforcement. | **Open** (2.6). |
| #6, #7, #11, #12, #17 | Remaining unmet expectations (11, 14, 13, 9 and 18 respectively). | **Open**: waiting for Michelle's full list, to sort each into fixed, to fix, or limitation. |

## 9. Accounts (no secrets)

| Account | Owner |
|---|---|
| GitHub repo `Shawn-Bi/GrowthLoop-AI` | Shawn |
| Anthropic API key | Provided by the school (Pursuit); used by Shawn |
| Neon project | Shawn |
| Vercel project `growth-loop-ai` (team `shawn-9964`) | Shawn |

Shawn shared the local environment values with Michelle privately on 2026-10-23, and the demo access code on 2026-10-29. Secrets never go in the repo, issues or screenshots.

## Still open before sign-off

- **1.4 (both):** the official deadline and submission requirements.
- **2.2, 2.4 and 2.7 (Michelle):** the GL-02 seed and claims, and whether the GL-07 drafts use a real model call.
- **2.6 (joint):** banned phrases.
- **Section 8 (Shawn, after Michelle's list):** the remaining findings, then her retest of the fixes.
- **Joint:** the live two-cycle E2E on the preview with real Content Agent drafts and real Claude, recorded in `docs/test-report.md`.

## Sign-off

Only actual approvals are filled in.

| Area | Shawn | Michelle | Date / evidence |
|---|---|---|---|
| Scope, deferrals, two-cycle demo (§1) | Pending | Pending | |
| Ownership and reviewer roles (§1.5, §4.1) | Pending | Pending | |
| KPI, fixture and claim policy (§2–§3) | Pending | Pending | KPI and fixture verified by Michelle on #4 (2026-10-29) |
| Access and daily cap (§4–§5) | Pending | Pending | |
| Contracts (§7) | Pending | Pending | |
| Official deadline and submission (§1.4) | Pending | Pending | |
