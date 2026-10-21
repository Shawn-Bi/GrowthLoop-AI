# GrowthLoop AI — Product Requirements Document

**Version:** 2.0 · 2026-10-21 · **Scope:** Five-working-day demonstration MVP  
**Status:** Implementation-ready specification; joint business sign-off and technical smoke tests still pending. No code or tests are claimed complete.  
**Team:** Shawn & Michelle · **Internal delivery target:** Tuesday, October 27, 2026 (official submission deadline/format must be confirmed).

## 1. Product vision and boundary
GrowthLoop AI is an evidence-driven, human-supervised marketing experimentation system for early-stage B2B SaaS. It uses **two specialized LLM agents** and a **deterministic TypeScript controller** to draft LinkedIn organic posts, assess *simulated* campaign performance, recommend the next controlled test, persist findings, and generate a second round of drafts grounded in that history. It does not claim to prove marketing lift or that two agents outperform one; a single-agent comparison is deferred.

**Hypothetical first customer:** GrantReady, a proposed nonprofit grant discovery/application-readiness product. GrowthLoop markets GrantReady; it does **not** implement grant research, matching, eligibility, or applications. GrantReady product facts, ICP, and claims are proposed by Michelle and approved by the team before use. Do not imply GrantReady has production capabilities without evidence.

## 2. Users, problem, success
**Primary user:** B2B SaaS founder/growth marketer who needs traceable, repeatable messaging experiments. **Problem:** marketing decisions are often disconnected from message hypotheses, measurable outcomes, and recorded next steps. **Success for this demo:** the system completes a traceable two-cycle workflow with actual Anthropic calls, deterministic math, approval gates, and database-persisted memory after a restart/redeploy.

### P0 demonstration acceptance
1. One seeded product brief, one ICP, one campaign, one LinkedIn organic channel; two draft roles per cycle: `control` and `variant`.
2. Content Agent generates exactly two structured drafts with Content DNA and only approved hypothetical claims; each draft visibly labeled `Hypothetical product — demonstration only`.
3. Human approves/rejects drafts; unapproved drafts cannot become `ready_for_manual_publication`. **No external publishing** is implemented.
4. Pre-authored `simulated` metrics fixture loads with provenance, validates row relationships, and calculates primary and secondary KPIs deterministically.
5. Analytics Agent receives **precomputed** metrics, references metric IDs, expresses uncertainty, and proposes a one-variable next experiment with stop rule; a human must approve it.
6. Approved proposal and evidence are saved to PostgreSQL as Experiment Memory; after app restart/redeploy they remain retrievable.
7. Controller passes a versioned, traceable handoff to Content Agent; Cycle 2 generates two drafts linked to the prior experiment and selected test variable. **Cycle 2 ends at draft generation/optional approval; no second metrics analysis is required.**
8. A minimal trace page or JSON endpoint shows `exp_001 → cnt_001/cnt_002 → metrics → exp_002 → cnt_003/cnt_004`.
9. Tests record **actual** results; the demonstration distinguishes simulated observations from real performance and causal evidence.

### Deferred (not a blocker)
**P1:** CSV upload, third variant, UTM export, editable claim UI, charts/polish, Playwright browser E2E, single-agent baseline. **P2:** multi-workspace, RBAC/accounts, live LinkedIn, CRM/GA4/PostHog, paid ads, SEO/GEO, webhook integrations, streaming, cost dashboard, generalized queues, prompt caching, second-cycle analysis, automatic posting.

## 3. Fixed demo workflow
1. Controller loads seeded GrantReady brief, ICP, `registry_version`, and approved claim registry (read-only UI).
2. Controller assigns experiment/content IDs and asks **Content Agent** for two draft objects with Content DNA; LLM has no tools or direct DB access.
3. Controller validates schema, `claim_ids_used`, forbidden phrases and safety rules. Invalid/uncertain copy becomes `needs_review`; human review remains mandatory.
4. Authorized reviewer approves/rejects; controller enforces state transition and writes audit event.
5. Simulated fixture (not real campaign data) is matched by `experiment_id + variant_role`, mapped to controller-generated content IDs, and validated. Invalid rows are quarantined with reasons.
6. Controller computes KPIs as pure functions, persists metrics with `metric_id`, source and denominator.
7. **Analytics & Experiment Agent** sees approved aggregate metrics and Content DNA, but cannot modify claims or directly write DB. It returns a proposed hypothesis, one changed dimension, control conditions, metric references, uncertainty and stop rule.
8. Human approves experiment proposal; controller atomically creates `exp_002` with `parentExperimentId=exp_001`, stores report, decision and handoff.
9. Restart app/redeploy; read saved experiment from PostgreSQL. Controller sends a schema-validated handoff to Content Agent to generate Cycle 2 drafts. Trace parent and source IDs. No unapproved automatic execution.

## 4. Claims and human oversight
Seeded `data/seed/claims.json` is machine-readable, versioned (`registry_version`), and read-only in MVP. Every claim has `claim_id`, `text`, `status`, `source_or_evidence`, `reviewer`, `reviewed_at`, `demo_only`. Allowed statuses:
- `approved_demo_claim`: may appear **only** with clear hypothetical/demo labeling; not verified fact.
- `verified_claim`: requires supporting source evidence.
- `rejected_claim`: prohibited. Unreviewed/missing IDs are prohibited.

Michelle is the **proposed** GrantReady brief/claims owner and content reviewer; Shawn is the **proposed** experiment approver and technical owner. Both must confirm. Add `data/seed/banned_phrases.json` including unverified guarantees (e.g. guaranteed grant award); automated phrase checks are incomplete, so humans make final decisions. An approval event records reviewer and timestamp; do not claim this MVP provides robust authentication or RBAC. The demo uses a shared access code and a single seeded workspace/context, with role labels for audit rather than verified personal identities.

## 5. Metrics and dataset contract
**Primary KPI:** `qualified_demo_requests / landing_page_visits` (conversion per landing-page visit). Show numerator and denominator. If denominator is `0`, missing, or invalid, return `not_calculable`, **never zero**. **Secondary:** `qualified_demo_requests / link_clicks`, labeled explicitly as per-click rate; impressions, clicks and demo requests can be displayed as raw counts. Do not silently switch denominators.

Each fixture row includes `dataset_id`, `experiment_id`, `variant_role` (`control|variant`), `source="simulated"`, `impressions`, `link_clicks`, `landing_page_visits`, `demo_requests`, `qualified_demo_requests`, and optional notes. Validate nonnegative integers and sensible relationships (e.g., `qualified_demo_requests <= demo_requests <= landing_page_visits <= link_clicks <= impressions`, for this synthetic dataset). Quarantine invalid rows with reasons. Missing values are not zero. Fixture values are **pre-authored** and are not outcomes caused by the generated posts. Michelle provides independent hand-calculated expected KPI values.

**Illustrative math only (not a test result):** control 10/250 = 4.0%; variant 18/240 = 7.5%. No significance or causal inference from this synthetic example. Findings cite stored `metric_id`s, not invented numbers. Uncertain or unsupported narratives are flagged `needs_review`; don't rely only on keyword bans to catch fabricated claims.

## 6. Content DNA and experiment discipline
Required DNA: `icp`, `pain_point`, `hook`, `value_proposition`, `evidence`, `cta`, `channel`, `primary_test_variable`, `variant_role`, `claim_ids_used`. One main experimental dimension per round; preserve comparable controls where feasible. Exact natural-language text **need not** be identical across variants when wording must change naturally; log material confounds. Cycle 2 must cite `parent_experiment_id`, source findings/metric IDs and the approved new test variable.

## 7. Agent and controller contracts
- **Content Agent (Claude Sonnet via Anthropic API):** receives approved brief/claims, ICP, test plan, and selected historical findings. Returns structured JSON drafts. No external posting, DB tools, or analytics modifications.
- **Analytics & Experiment Agent (Claude Sonnet):** receives validated KPI aggregates and DNA; returns evidence-linked analysis and next experiment proposal. No claim editing, DB tools, or arithmetic authority.
- **Controller (TypeScript):** assigns IDs, validates Zod schemas, calculates KPIs, enforces approvals and state transitions, stores records, and makes all Anthropic calls. All mutations happen server-side.

**Versioned handoff v1.0 required fields:** `schema_version`, `task_id`, `correlation_id`, `idempotency_key`, `experiment_id`, `parent_experiment_id` (nullable on Cycle 1), `source_content_ids`, `approved_claim_ids`, `hypothesis`, `primary_test_variable`, `control_conditions`, `metric_ids`, `findings`, `uncertainty`, `approval_state`, `next_action`. Reject missing required fields and unsupported schema versions. Controller uses conditional state updates; illegal transitions return HTTP 409. Database unique constraint on `(experimentId, variantRole)` prevents duplicate drafts. For failed/refused/truncated responses, log `AgentRun`, optionally retry one schema repair, then show visible error without inventing results.

**Statuses:** use distinct typed enums for drafts (`draft|needs_review|pending_approval|approved|rejected|ready_for_manual_publication`), proposals (`needs_human_approval|approved|rejected|error`), and agent runs (`started|completed|error`); do not overload one generic status enum across entity types.

## 8. Architecture and data
**One Next.js App Router application**, TypeScript-only Route Handlers, Tailwind CSS, server-side Anthropic SDK, Zod 4, Prisma 7 + **Neon PostgreSQL in every environment**, Vitest, Vercel if smoke tests pass. No FastAPI, Python backend, SQLite, monorepo or generic agent framework. No tools exposed to LLMs.

**Proposed minimal entities:** `Claim`, `Experiment` (parent ID, cycle, status), `ContentDraft` (Content DNA as JSON; unique experiment/role), `MetricRecord`, `AnalysisReport`, `AgentRun` (token usage/latency), `Handoff`, `AuditEvent` (8 entities). No Workspace table or full authentication for MVP. If a singleton demo context ID is used, enforce it server-side; don't claim tenant isolation.

**Secrets / environment:** `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `DATABASE_URL` (pooled runtime), `DATABASE_URL_UNPOOLED` (migration/direct), `DEMO_ACCESS_CODE`. No `NEXT_PUBLIC_ANTHROPIC_*`, no `SESSION_SECRET` until real auth exists. `server-only` Anthropic client. Apply rate/daily generation cap server-side, access code or platform protection, Anthropic spend cap, no secrets in Git or logs.

**Runtime/version policy:** target Node 24.x; pin package versions and commit lockfile; proposed verified-on-2026-10-21 package targets: Next 16.4.2, React 19.3.1, TS 5.9.3, Prisma/client/adapter-pg 7.10.1, Anthropic SDK 0.137.0, Zod 4.6.7, Tailwind 4.3.3, Vitest 5.0.5. Confirm registry compatibility during S0; do not install `latest` blindly. Prisma 7 uses `prisma.config.ts`, explicit client output and driver adapter; `prisma generate` before build; explicit seed execution. Anthropic model candidate `claude-sonnet-5-5` **must pass account-specific S1**; do not hardcode an unverified model ID. Follow installed SDK docs for structured outputs; avoid unsupported thinking/tool-choice parameters. `CLAUDE.md` will capture pinned versions and code guardrails.

## 9. Security, data integrity, failure handling
- Restrict all generation/mutation endpoints behind server-side demo access control; no public unprotected paid API calls. Daily cap and Anthropic spend limit are separate safeguards.
- Human approval required before content is marked publishable and before next experiment generation.
- Validate LLM outputs, claims, numeric citations, and dataset provenance; reject fabricated or nonmatching metrics. Manual review catches semantic claims beyond simple word matching.
- Store token counts, latency, errors and audit trail without secrets or sensitive personal data.
- Protect against duplicate clicks with conditional transitions and unique keys.
- Fail visibly on timeout, refusal, max_tokens, invalid JSON, unavailable database; never silently produce fictional reports.
- Local/preview/production PostgreSQL must persist across application restarts and redeployments.

## 10. Evaluation and definition of done
**S0–S6 prerequisite checks** are defined in `PRE_BUILD_CHECKLIST.md`; results must be recorded, not assumed. Each feature issue includes Vitest/contract tests. `npm test` uses mocked LLM calls; real API calls are confined to explicit smoke/E2E scripts.

**Two-cycle E2E acceptance (real calls plus deterministic fixture):**
1. Seed approved hypothetical claims, ICP, one experiment; generate two valid Cycle 1 drafts with stable IDs and DNA.
2. Reject unauthorized/unapproved publish-ready transition (403/409), audit it; approve via human gate.
3. Load simulated fixture; quarantine invalid records; compute stored KPI exactly, including `not_calculable` on zero denominator.
4. Analytics report references real stored `metric_id`s, makes no unsupported causal or numerical claim, proposes one changed variable and stop rule; remains pending until approval.
5. Human approves `exp_002`; persist report, parent ID, reviewer, handoff and memory.
6. Restart/redeploy, read back `exp_002`, generate `cnt_003`/`cnt_004` with parent/source references and documented controlled variable.
7. Trace contains complete chain; repeat approval/click does not duplicate records; errors are visible.
8. Show clear `Simulated, pre-authored outcomes` and `Hypothetical product` labels.

**PASS:** all eight checks with saved evidence in `docs/test-report.md`; otherwise record failed/blocked status accurately. Real marketing effectiveness, causal lift and multi-agent superiority remain **unvalidated**.

## 11. Five-working-day delivery plan
**Day 1 Wed Oct 21:** both approve decision log and scope; Michelle delivers brief/claims/ICP/fixture + independent expected KPIs; Shawn locks versions, scaffolds app, confirms Anthropic, Postgres and protected preview smoke checks, Zod contracts and seed. **Exit:** core infrastructure works and seed validates. If preview fails, continue local and retry deployment by Day 4.

**Day 2 Thu Oct 22:** Shawn builds controller, approval state machine and Content Agent + minimal review UI; Michelle reviews generated claims and drafts. **Exit:** two drafts generated, invalid claims blocked, human approval works.

**Day 3 Fri Oct 23:** Shawn builds fixture ingestion, deterministic KPIs, Analytics Agent and proposal approval; Michelle verifies independently calculated KPI and analysis language. **Exit:** complete Cycle 1; `exp_002` approved and persisted.

**Day 4 Mon Oct 26:** Shawn implements memory-backed Cycle 2 and trace, E2E and deployment/access protections; Michelle walks through demo. **Exit:** two-cycle workflow tested locally and online (or documented local fallback). **Feature freeze at end of Day 4.**

**Day 5 Tue Oct 27:** fix critical bugs, record actual tests, update README with actual commands/status, rehearse twice, record fallback video, submit as required. **Exit:** both sign off on demo. Weekend Oct 24–25 is not counted as a working day.

## 12. Seven joint decisions and sign-off
The five-day architecture and technical policies below are **fixed for this implementation baseline** by Shawn. Michelle must still confirm her proposed workload, GrantReady facts, and official submission requirements; no consent or signatures are presumed:

| Decision | Proposed owner | Approval / target | Default for discussion |
|---|---|---|---|
| GrantReady brief and claim authority | Michelle | Both, D1 | Michelle supplies and reviews demo-only registry |
| ICP and geography | Michelle | Both, D1 | One nonprofit marketing persona; geography specified in seed |
| Qualified demo request + KPI | Shawn | Fixed technical definition; D1 verify fixture | `qualified_demo_requests / landing_page_visits`; 0 denominator = not_calculable |
| Fixture source and use | Michelle | Both, D1 | Pre-authored simulated JSON; CSV P1 |
| Stack, provider, spend cap | Shawn | Fixed technical decision; setup D1 | Anthropic Sonnet + Neon + Vercel; $50 Anthropic workspace spend limit |
| Content / experiment approvals | Shawn (policy) | Fixed technical policy; Michelle to acknowledge role, D1 | Michelle reviews content; Shawn reviews experiment; shared demo code controls access but does not prove reviewer identity |
| Official deadline and submission format | Both | Both, D1 | Internal target Oct 27; official deadline TBD |

Record names/date and decisions in `docs/decisions.md` (a GitHub PR approval may serve as sign-off). If team consent is not yet obtained, do **not** mark the decisions signed.

## 13. Delivery tracking
`TEAM_TASKS.md` is the task source until GitHub Issues are created. Use **GL-01–GL-12** only; do not treat old `#1–#14` backlog labels as issue numbers. Actual GitHub issue numbers/assignees exist only after creation. Claude Code may create issues through authenticated `gh` **after** joint scope approval. Every PR includes tests and evidence; never claim implementation or tests exist before they do.

## 14. Future commercial roadmap (not five-day scope)
Real customer validation, verified claims, real analytics and CRM connectors, compliant LinkedIn publishing, cross-channel attribution, SEO/GEO, rigorous experiments, auth/multi-tenancy, and a measured single-agent baseline. None are prerequisites for the five-day demo.


## Fixed operating policy (Shawn decision, 2026-10-21)
- **Primary KPI:** `qualified_demo_requests / landing_page_visits`; **secondary:** `qualified_demo_requests / link_clicks`. Show numerator and denominator. Zero/missing/invalid denominator returns `not_calculable`, never 0. A qualified request is a synthetic fixture count, not inferred by an LLM.
- **Approval responsibility:** Michelle reviews GrantReady claims and content drafts; Shawn approves Analytics Agent experiment proposals and technical release. Both can review final demo. The shared access code does **not** authenticate individual identities; `reviewer` is a selected/recorded demo role, not a verified identity. Never claim enterprise-grade RBAC.
- **Access control:** Protect all private pages and generation/mutation endpoints with a server-validated `DEMO_ACCESS_CODE` delivered outside the public repository. Use a secure server-side session/cookie after code entry (HttpOnly, Secure in production, SameSite=Lax) or a server-validated authorization header for test scripts. Do not rely on UI-only gating. Keep `/api/health` free of sensitive data. Reject unauthenticated requests with 401.
- **Abuse/cost controls:** Maximum **30 successful agent-generation calls per UTC day** across the deployment, enforced atomically in PostgreSQL (not in-memory). Also reject when quota is exhausted (429), configure a **$50 Anthropic workspace spend limit**, and retain SDK timeout/retry safeguards. The spend cap is a backstop, not a substitute for server authorization.
- **Human approvals:** All claims must be approved before use; every content draft and experiment proposal requires an explicit approval action, recorded with role, timestamp, decision, and relevant record ID. Rejected/unapproved records cannot advance.
- **Open external dependencies:** Michelle must confirm the actual GrantReady brief/claims and accept her proposed tasks; the official course deadline/format must be verified. These remain real-world confirmations, not architecture choices.


## 15. Joint Technical Ownership and Collaboration Agreement (October 21, 2026)

Michelle and Shawn have agreed to share technical implementation responsibilities for the GrowthLoop AI MVP. This section supersedes earlier proposed role assignments in this document where they conflict. Both partners will participate in coding, debugging, testing, integration, and understanding the complete system.

### Michelle — Content Agent Technical Lead
- Implement the Content Agent using the Anthropic API and TypeScript.
- Develop prompts that generate two structured LinkedIn marketing drafts (control and variant) using approved GrantReady demonstration claims.
- Implement Content DNA output, Zod schema validation, and claim-checking logic.
- Build the content review and approval interface.
- Write unit tests, investigate bugs, and integrate Content Agent outputs with the shared controller and Experiment Memory.
- Lead preparation of the hypothetical GrantReady product brief, ICP, approved claims, and content examples.

### Shawn — Analytics & Experiment Agent Technical Lead
- Implement the Analytics & Experiment Agent using the Anthropic API and TypeScript.
- Develop deterministic KPI calculations and simulated-metrics ingestion.
- Implement experiment recommendations, evidence references, uncertainty statements, and approval workflows.
- Lead PostgreSQL persistence and Experiment Memory implementation.
- Write unit tests, investigate bugs, and integrate analytics outputs with the shared controller.

### Shared Engineering Responsibilities
- Jointly review architecture, agent handoff contracts, Zod schemas, controller state transitions, and failure handling.
- Collaborate on controller integration, security, deployment, end-to-end testing, and final demonstration.
- Use feature branches, meaningful commits, pull requests, and mutual code reviews.
- Document debugging steps and test evidence so both partners learn to diagnose problems efficiently.
- Ensure both partners can explain and demonstrate the complete two-agent workflow, not only their individual components.

### Product Scope and Course Deliverables
GrowthLoop AI is the application being developed for Pursuit Cycle 3. GrantReady is the hypothetical product being marketed in the demonstration; grant discovery or grant application features are outside this MVP.

The GitHub PRD must also be adapted collaboratively into Pursuit's official Multi-Agent PRD Google Docs template, with the required document link submitted through Pathfinder. The official deadline and submission details remain to be verified.

### Implementation and Approval Notes
This agreement updates the proposed ownership of GL-05 through GL-12 and the five-day schedule; TEAM_TASKS.md, PRE_BUILD_CHECKLIST.md, and README.md must be aligned before the plan is treated as final. Existing technical architecture and acceptance criteria remain in effect unless jointly changed.

No implementation, tests, deployment, or formal GitHub sign-off are claimed completed by this section.
