# GrowthLoop AI — Decision Log (GL-01)

**Status: DRAFT, not signed.** Drafted by Shawn on 2026-10-23. Nothing here counts as agreed by Michelle until she approves it. Per PRD §12, an approving review on the PR that adds or changes this file may serve as sign-off. Disagreements go in PR comments, and we edit before merging.

**Status values:**
- **Fixed** — set as policy in the PRD by Shawn on 2026-10-21; Michelle still needs to acknowledge it.
- **Implemented** — built in the code; needs joint review.
- **Open** — needs a decision or input.

## 1. Scope and schedule

| # | Decision | Status | Where |
|---|---|---|---|
| 1.1 | Five-working-day P0 scope; P1/P2 deferrals as listed in PRD §2. | Fixed | PRD §2 |
| 1.2 | The demo shows **two cycles**: Cycle 2 ends at draft generation and optional approval, with no second metrics analysis. | Fixed | PRD §2 P0 #7 |
| 1.3 | The feedback loop is built generically (cycle N → N+1, parent-linked, human-approved), so it *can* keep iterating. Michelle asked on 2026-10-23 for a continuous loop. Demo acceptance stays at two cycles unless we jointly widen it. | Implemented / **Open** (confirm) | `lib/controller/build-handoff.ts`, PR #5 |
| 1.4 | Internal target is Tue 2026-10-27. The official Pursuit deadline, format and Pathfinder submission still need checking. | **Open** | PRD §11 |
| 1.5 | Ownership: Michelle leads the Content Agent, GL-02/03 inputs and content review. Shawn leads Analytics, persistence, the controller and deployment. Integration, E2E and demo are shared. | Fixed | PRD §15, TEAM_TASKS §8 |

## 2. Product inputs (Michelle)

| # | Decision | Status | Where |
|---|---|---|---|
| 2.1 | GrantReady is a hypothetical product; GrowthLoop markets it and doesn't implement grant features. | Fixed | PRD §1 |
| 2.2 | One ICP and geography, one LinkedIn organic channel. | **Open** (GL-02 seed) | `data/seed/icp.json` (pending) |
| 2.3 | Claim registry statuses: `approved_demo_claim`, `verified_claim`, `rejected_claim`. Only the first two may be used; missing or unreviewed IDs are prohibited. | Fixed; handoff carries only approved/verified IDs | PRD §4, `lib/controller/workflow.ts` |
| 2.4 | Outcomes come from a pre-authored simulated JSON fixture in `data/fixtures/`, not real data. CSV upload is P1. | Fixed; Michelle's `demo_fixture_v1.json` + `expected.json` pending | PRD §5, GL-03 |

## 3. Metrics

| # | Decision | Status | Where |
|---|---|---|---|
| 3.1 | **Primary KPI** is `qualified_demo_requests / landing_page_visits`; **secondary** is `qualified_demo_requests / link_clicks`. Both show numerator and denominator. A zero, missing or invalid denominator is `not_calculable`, never 0, and a missing value is never 0. | Fixed / Implemented | `lib/kpi/calculate.ts`, PR #4 |
| 3.2 | Metric ID format: `met_<dataset>_<experiment>_<role>_<metric>`. It is deterministic, so recomputing the same dataset gives the same IDs. | Implemented / **review** | PR #4 |
| 3.3 | Fixture rules: rows must follow the funnel order; duplicates are all quarantined; only drafts approved for publication receive outcomes; one dataset per experiment. | Implemented / review | `lib/kpi/ingest.ts`, `lib/controller/workflow.ts` |
| 3.4 | Agents never do arithmetic. Findings must cite stored metric IDs; unknown IDs make the proposal an error, while unverified numbers, causal wording or multi-variable proposals are flagged for the approver. | Implemented | `lib/agents/analytics/review.ts`, PR #5 |

## 4. Approvals and access

| # | Decision | Status | Where |
|---|---|---|---|
| 4.1 | Roles: `content_reviewer` (Michelle) decides drafts; `experiment_approver` (Shawn) decides proposals. These are recorded demo roles, not verified identities, and there is no RBAC claim. | Fixed / Implemented for proposals | PRD fixed policy, PR #5/#6 |
| 4.2 | Every decision is an audit event with role, timestamp and record ID. Status changes use conditional updates, so a wrong role gets 403 and an illegal or repeated change gets 409. | Implemented for proposals; drafts pending GL-07 | PR #5/#6 |
| 4.3 | **Demo access** works as follows: <ul><li>one server-validated `DEMO_ACCESS_CODE`;</li><li>an HttpOnly, SameSite=Lax session cookie (Secure in production), derived from the code, so there is no `SESSION_SECRET`;</li><li>a bearer code for scripts;</li><li>`proxy.ts` plus per-route and per-page checks;</li><li>401 when unauthenticated;</li><li>`/api/health` is public and reveals nothing.</li></ul> | Implemented | PR #7 |
| 4.4 | Sign-in attempts are limited to 10 per client per 15 minutes, in Postgres, storing hashed addresses; this covers the form and bearer codes. | Implemented | PR #9 |
| 4.5 | Vercel Authentication stays on for previews; scripts use the Protection Bypass for Automation. | Implemented (Vercel settings) | `docs/test-report.md` |

## 5. Cost and abuse controls

| # | Decision | Status | Where |
|---|---|---|---|
| 5.1 | No Anthropic spend limit: the API key is provided by the school and has no limit we can set, so the PRD's $50 cap doesn't apply. The daily cap (5.2) is the cost control. | Not applicable | PRD §9 |
| 5.2 | Max 30 successful agent generations per UTC day, counted atomically in Postgres. A slot is released when a call fails, and requests past the cap get 429. | Implemented | `lib/persistence/quota.ts`, PR #6/#7 |
| 5.3 | The Analytics Agent runs at `effort: "medium"` with `max_tokens` 16000. The analysis route has `maxDuration` 120 s; on the preview it took 11.8 s. | Implemented | PR #5/#7 |

## 6. Stack and platform

| # | Decision | Status | Where |
|---|---|---|---|
| 6.1 | One Next.js app with exact pins: Next 16.4.2, React 19.3.1, TS 5.9.3, Prisma 7.10.1, Anthropic SDK 0.137.0, Zod 4.6.7, Tailwind 4.3.3, Vitest 5.0.5, Node 24.x, plus `.npmrc save-exact`. No Python, SQLite, monorepo or agent framework. | Implemented | PR #3, `CLAUDE.md` (PR #8) |
| 6.2 | The model is `claude-sonnet-5-5` via `ANTHROPIC_MODEL`, never hardcoded; it was verified for this account in S1 on 2026-10-23. | Implemented | `docs/test-report.md` |
| 6.3 | Structured output uses `messages.create` + `zodOutputFormat`, validated with our Zod contract, with one append-only repair. It sends no `thinking` setting, no forced `tool_choice`, and not the legacy `output_format`. | Implemented | PR #5 |
| 6.4 | No server-side refusal `fallbacks` for now: they would silently run a model that S1 hasn't verified. We can revisit. | Implemented / revisit | PR #5 |
| 6.5 | Neon Postgres (us-east-2) is shared by local development and Vercel previews. A per-developer Neon branch is optional. | Implemented | `.env.example` |
| 6.6 | Vercel project `growth-loop-ai`: one preview per branch, production = `main`. | Implemented | `docs/test-report.md` |
| 6.7 | Keep `cacheComponents` and `partialPrefetching` on. Pages read runtime data behind `<Suspense>`. This was raised in the #2 review. | Implemented / **confirm** | `next.config.ts` |
| 6.8 | Unit and integration tests make no network calls. Persistence tests run on PGlite (community adapter, dev only). Real calls happen only in `smoke/`. | Implemented | PR #6, `CLAUDE.md` |

## 7. Contracts that need joint review

| # | Contract | Where |
|---|---|---|
| 7.1 | Handoff v1.0, controller → Content Agent (`schemas/handoff.ts`) | PR #5 |
| 7.2 | Test variables `pain_point`, `hook`, `value_proposition`, `evidence`, `cta`; these must match the Content DNA fields. | PR #5 |
| 7.3 | IDs: `prop_<experiment>_<n>`; the next experiment ID follows the parent's (`exp_001` → `exp_002`). | PR #7 |
| 7.4 | `ContentDraft` and `Claim` tables | PR #6 |

## 8. Accounts (no secrets)

| Account | Owner |
|---|---|
| GitHub repo `Shawn-Bi/GrowthLoop-AI` | Shawn |
| Anthropic API key | Provided by the school (Pursuit); used by Shawn |
| Neon project | Shawn |
| Vercel project `growth-loop-ai` (team `shawn-9964`) | Shawn |

Shawn shared the local environment values with Michelle privately on 2026-10-23. Secrets never go in the repo, issues or screenshots.

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
