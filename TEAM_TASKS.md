# GrowthLoop AI — Five-Working-Day Team Tasks & GitHub Issue Plan

**Version:** 2.0 · 2026-10-21  
**Status:** Final proposed implementation plan, **pending Michelle + Shawn sign-off**. No GitHub Issues are claimed created.  
**Internal target:** D1 Wed Oct 21; D2 Thu Oct 22; D3 Fri Oct 23; D4 Mon Oct 26; D5 Tue Oct 27, 2026. Weekend excluded. Official submission deadline/format: **to confirm**.

## 1. Division of work
- **Shawn (proposed):** GrowthLoop AI vision, requirements, architecture, GitHub planning, coding with Claude Sonnet, state machine, API/database, integration, deployment, technical test evidence, final acceptance. Shawn can take most coding work.
- **Michelle (proposed):** GrantReady hypothetical product brief, target ICP, reviewed claims and banned phrases, pre-authored synthetic campaign dataset, **independent hand-calculated KPI expected values**, 6–8 labeled good/bad marketing draft examples, content review, demo script/rehearsal. No GrantReady domain assumptions should be made by Shawn without Michelle's input.
- **Joint decisions:** five-day P0/P1 scope, KPI and denominator, approval roles, access control, budget limit, official deadline and submission, final sign-off. Roles are suggestions until both agree.

## 2. Daily delivery and cut lines
| Day | Shawn | Michelle | Exit gate | If blocked |
|---|---|---|---|---|
| **D1 Oct 21** | GL-01, GL-04, GL-05: decisions, repo/docs, exact package pins, `CLAUDE.md`, Anthropic/Neon/Vercel smoke, contracts/seed | GL-01–03: GrantReady brief/ICP/claims/banned phrases, fixture, independently calculated expected KPI, labeled draft samples | S0–S6 verified locally; preview when possible; seed/schema valid | If preview blocked, continue locally; **if API or DB smoke fails, fix before features** |
| **D2 Oct 22** | GL-06, GL-07: controller, approvals, Content Agent, minimal review UI | Review output claims, begin demo script | Two valid drafts and approval; unapproved action blocked | Minimal buttons, no polish |
| **D3 Oct 23** | GL-08, GL-09: fixture/KPI, Analytics Agent, proposal approval | Compare KPI with hand calculations; review uncertainty/claims | Cycle 1 complete; approved `exp_002` persisted | Trace via JSON, reduce noncritical failure cases |
| **D4 Oct 26** | GL-10, GL-11: memory, Cycle 2, trace, API E2E, deploy/protect | Online walkthrough and bug report | Two-cycle E2E passes locally and deployed **or** local fallback documented; feature freeze | Local demo + recording if hosting blocks |
| **D5 Oct 27** | GL-11/12: critical fixes, evidence/test report, README actual commands, sign-off | Two rehearsals, backup video, submission checklist | Demonstrable and jointly accepted | No new features |

## 3. GitHub Issues to create after approval
Use **GL-01–GL-12** as stable planning IDs. GitHub issue numbers are assigned by GitHub and must not be invented. Every issue should have labels `day:D1` etc. only if those labels exist; otherwise create without labels. Owners are proposed; assign GitHub usernames only after consent and identity confirmation. Each issue includes evidence in PR and `npm test` / `npx tsc --noEmit` results when applicable.

### GL-01 — Confirm scope, KPI, approvals and deadline (D1 AM)
**Owner:** both. **Depends:** none.  
**Deliverable:** `docs/decisions.md` recording both approvals, internal target and **official** submission deadline/format (or clearly pending), single-ICP selection, fixed main KPI = qualified demo requests / landing-page visits, denominator-zero behavior, fixture-only source, approved/rejected claims, content/experiment approval roles, Anthropic spend cap (fixed $50 Anthropic spend limit), server-validated access code + 30 successful agent-generation calls per UTC day, Cycle 2 ending at drafts.  
**Done:** both explicitly approve or record unresolved blocker; docs PR merged.

### GL-02 — GrantReady brief, ICP, claim registry and banned phrases (D1)
**Owner/reviewer:** Michelle / Shawn. **Depends:** GL-01.  
**Deliverable:** `data/seed/brief.json`, `icp.json`, `claims.json`, `banned_phrases.json`; each claim has `claim_id`, `status`, `source_or_evidence`, `reviewer`, `reviewed_at`, `demo_only`; registry version; at least one rejected example; 6–8 labeled evaluation draft samples.  
**Done:** Zod seed validation passes; unapproved claims blocked; Michelle approves hypothetical wording.

### GL-03 — Simulated fixture and independent expected KPI (D1)
**Owner/reviewer:** Michelle / Shawn. **Depends:** GL-01.  
**Deliverable:** `data/fixtures/demo_fixture_v1.json`, `expected.json` with hand-calculated answers and invalid-row examples (at least two). Fields: `dataset_id`, `experiment_id`, `variant_role`, `source=simulated`, `impressions`, `link_clicks`, `landing_page_visits`, `demo_requests`, `qualified_demo_requests`.  
**Done:** source labeled simulated, expected math documented, invalid rows and reasons included. Fixture tied to experiment+role, not fabricated as real outcomes.

### GL-04 — Scaffold, pinned dependencies and S0–S6 smoke (D1)
**Owner/reviewer:** Shawn / Michelle sees evidence. **Depends:** GL-01 (can start parallel with GL-02/03).  
**Deliverable:** one Next.js/TS app; Node 24; exact versions and lockfile; `CLAUDE.md`, `.env.example`; Neon + Vercel preview, server-only Anthropic client, protected routes, scripts for S0–S6.  
**Done:** actual smoke logs show model accessible, DB persists after restart, preview protection and `npm test` mocked. If preview blocked, record it and proceed local; S1 and S2 are hard blockers.

### GL-05 — Prisma entities, Zod contracts, seed (D1 afternoon)
**Owner:** Shawn. **Depends:** GL-04 and GL-02 for full seed; schema can start before seed arrives.  
**Deliverable:** minimal ~8 entities, migration in Neon, schema source-of-truth Zod, handoff v1.0 with `task_id`, `correlation_id`, `idempotency_key`, `parent_experiment_id`, approval state, metric IDs; valid/invalid examples.  
**Done:** migrations and seed run; missing task ID and unsupported version rejected; no direct agent DB tools.

### GL-06 — Controller, approvals, access and idempotency (D2)
**Owner:** Shawn. **Depends:** GL-05.  
**Deliverable:** explicit transition table, server-only ID allocation, audit events, role labels, conditional updates, unique experiment+variant role, access code and daily cap.  
**Done:** unapproved/invalid transitions blocked with 401/403/409 as appropriate; double approval does not duplicate data; unit tests run.

### GL-07 — Content Agent, claim validator and review UI (D2)
**Owner/reviewer:** Shawn / Michelle. **Depends:** GL-05/06 and approved GL-02.  
**Deliverable:** real Sonnet call returning exactly two JSON drafts with DNA; validated claim IDs; banned phrase checks; pending approval and minimal review UI; `AgentRun` token/latency logs.  
**Done:** two valid drafts; bad claims become `needs_review`; manual approve/reject; at most one repair retry; Michelle reviews outputs; tests use mock except explicit smoke.

### GL-08 — Fixture ingestion and deterministic KPI functions (D3 AM)
**Owner/reviewer:** Shawn / Michelle. **Depends:** GL-03/05; pure KPI code may start parallel with GL-07.  
**Deliverable:** load simulated fixture by experiment+role, quarantine bad rows, calculate primary/secondary KPI with correct denominators and `not_calculable`, store `metric_id`s.  
**Done:** Vitest exact match to Michelle's independent `expected.json`; missing not treated as zero.

### GL-09 — Analytics Agent and experiment proposal approval (D3)
**Owner/reviewer:** Shawn / Michelle reviews analysis. **Depends:** GL-07/08.  
**Deliverable:** real Sonnet analysis using precomputed metrics, metric references, uncertainty, one-variable hypothesis and stop rule; human proposal approval creates `exp_002` with parent.  
**Done:** Cycle 1 complete; fabricated metric references/unsupported causal claims/multi-variable proposals rejected or flagged; no auto Cycle 2 before approval.

### GL-10 — Persisted memory, Cycle 2 and trace (D4)
**Owner:** Shawn. **Depends:** GL-09.  
**Deliverable:** persist approved findings/handoff; read after restart/redeploy; generate `cnt_003/004` from `exp_002` with `parent_experiment_id=exp_001`; minimal trace page or JSON endpoint.  
**Done:** Cycle 2 drafts visibly use approved prior findings, preserve experiment controls where feasible, and cannot be duplicated by repeated action.

### GL-11 — Deployment, API E2E and failure behavior (D4–D5)
**Owner/reviewer:** Shawn / Michelle walkthrough. **Depends:** GL-10; preview skeleton started in GL-04.  
**Deliverable:** protected Vercel environment with Neon persistence or documented local fallback; API-based two-cycle E2E; mock refusal, invalid JSON and timeout; actual `docs/test-report.md`.  
**Done:** actual results logged; no secrets in build/repo; simulated labels visible; feature freeze end D4.

### GL-12 — Demo, README verification and submission (D5)
**Owners:** Michelle (script/rehearsal) + Shawn (technical README/acceptance). **Depends:** GL-11 or agreed local fallback.  
**Deliverable:** two rehearsals, backup recording, README with real run/test/deploy instructions, submission link/format as required, joint sign-off.  
**Done:** reproducible demo; no false claims of test or real-world lift.

## 4. Dependencies and parallelism
**Critical path:** GL-01 → GL-04 → GL-05 → GL-06 → GL-07 → GL-09 → GL-10 → GL-11 → GL-12.  
**Parallel:** Michelle's GL-02 and GL-03 alongside Shawn's GL-04; KPI pure functions from GL-08 may be developed alongside GL-07 once expected values exist. Avoid overlapping edits to the same file. Each PR/issue owns its changes and carries tests.

## 5. Claude Code collaboration rules
1. **Claude Opus** reviews architecture, package compatibility, contracts and plan; do not let it silently add scope.
2. **Claude Sonnet** implements **one issue per session/branch**, reading `CLAUDE.md`, relevant PRD sections and issue description. Follow exact pinned versions; don't install arbitrary `latest` packages.
3. Implement deterministic components with tests first; mock Anthropic in `npm test`; use explicit smoke/E2E scripts for real API calls.
4. Commit/PR with test outputs; Shawn reviews and merges. Michelle reviews claims, fixture math and demo behavior.
5. After joint sign-off, Shawn can use authenticated `gh issue create` via Claude Code. **A previous ChatGPT integration 403 does not prevent Claude Code from using the owner's GitHub CLI permissions.**

## 6. Hard stops and scope cuts
- **Hard stop:** Anthropic real call (S1) or Postgres persistence (S2) fails → fix foundation before features.
- **Hard stop:** unapproved GrantReady claims → don't generate content that relies on them.
- **D3 Cycle 1 incomplete:** cut trace UI to JSON, cut cosmetic UI, defer optional failure scenarios; do **not** remove approvals, persistence, schema validation, or real API calls.
- **D4 deployment blocked:** use tested local demo + backup video; clearly report deployment limitation.
- **D4 end:** feature freeze. D5 is for reliability and submission.

## 7. Sign-off record (fill with actual approval)
| Decision | Shawn | Michelle | Date / evidence |
|---|---|---|---|
| Five-day scope and P1/P2 deferrals | Pending | Pending | `docs/decisions.md` |
| Proposed ownership and reviewer roles | Pending | Pending | `docs/decisions.md` |
| KPI, fixture and claim policy | Pending | Pending | `docs/decisions.md` |
| Demo access, spend cap, official deadline | Pending | Pending | `docs/decisions.md` |


## Fixed operating policy (Shawn decision, 2026-10-21)
- **Primary KPI:** `qualified_demo_requests / landing_page_visits`; **secondary:** `qualified_demo_requests / link_clicks`. Show numerator and denominator. Zero/missing/invalid denominator returns `not_calculable`, never 0. A qualified request is a synthetic fixture count, not inferred by an LLM.
- **Approval responsibility:** Michelle reviews GrantReady claims and content drafts; Shawn approves Analytics Agent experiment proposals and technical release. Both can review final demo. The shared access code does **not** authenticate individual identities; `reviewer` is a selected/recorded demo role, not a verified identity. Never claim enterprise-grade RBAC.
- **Access control:** Protect all private pages and generation/mutation endpoints with a server-validated `DEMO_ACCESS_CODE` delivered outside the public repository. Use a secure server-side session/cookie after code entry (HttpOnly, Secure in production, SameSite=Lax) or a server-validated authorization header for test scripts. Do not rely on UI-only gating. Keep `/api/health` free of sensitive data. Reject unauthenticated requests with 401.
- **Abuse/cost controls:** Maximum **30 successful agent-generation calls per UTC day** across the deployment, enforced atomically in PostgreSQL (not in-memory). Also reject when quota is exhausted (429), configure a **$50 Anthropic workspace spend limit**, and retain SDK timeout/retry safeguards. The spend cap is a backstop, not a substitute for server authorization.
- **Human approvals:** All claims must be approved before use; every content draft and experiment proposal requires an explicit approval action, recorded with role, timestamp, decision, and relevant record ID. Rejected/unapproved records cannot advance.
- **Open external dependencies:** Michelle must confirm the actual GrantReady brief/claims and accept her proposed tasks; the official course deadline/format must be verified. These remain real-world confirmations, not architecture choices.


## 8. Updated Team Assignments — Joint Agreement (October 21, 2026)

Michelle and Shawn have agreed to share technical development of GrowthLoop AI. This section supersedes conflicting earlier proposed assignments in this document. Both partners will write code, debug, test, review pull requests, and understand the full two-agent workflow.

### Michelle — Content Agent Technical Lead
- GL-02: Lead GrantReady hypothetical product brief, ICP, approved claims, banned phrases, and marketing examples; Shawn reviews.
- GL-07: Own implementation of the Content Agent, Anthropic API integration, prompt design, structured control/variant drafts, Content DNA, Zod validation, claim checking, content approval UI, and unit tests.
- GL-10: Implement the Content Agent's Cycle 2 memory-backed generation in collaboration with Shawn.
- GL-03: Prepare the simulated metrics fixture and independently calculated KPI expectations, with Shawn supporting technical integration.
- Participate in debugging, integration testing, code reviews, deployment verification, and final demonstration.

### Shawn — Analytics & Experiment Agent Technical Lead
- GL-04: Lead initial Next.js scaffold, dependencies, environment configuration, and Anthropic/PostgreSQL smoke tests; Michelle participates and reviews results.
- GL-08: Own simulated-fixture ingestion and deterministic KPI implementation; Michelle verifies expected values.
- GL-09: Own Analytics & Experiment Agent implementation, evidence-linked recommendations, uncertainty statements, experiment approval UI, and unit tests.
- GL-05 and GL-10: Lead PostgreSQL/Prisma persistence and Experiment Memory implementation, collaborating with Michelle on handoff contracts.
- Participate in debugging, integration testing, code reviews, deployment verification, and final demonstration.

### Shared Technical Ownership
- GL-01: Jointly confirm MVP scope, approval rules, budget, deadline, and course deliverables.
- GL-05: Jointly review TypeScript/Zod contracts and data model.
- GL-06: Jointly implement and review controller integration, approval state transitions, error handling, and agent handoffs.
- GL-10: Integrate saved Experiment Memory with Cycle 2 Content Agent generation.
- GL-11: Jointly perform end-to-end testing, security checks, deployment, and troubleshooting.
- GL-12: Jointly rehearse, document actual test evidence, and approve the final demonstration and submission.

### Revised Five-Working-Day Delivery Plan
- D1 — Wednesday, October 21: Joint scope/role confirmation; Michelle prepares GrantReady inputs and begins Content Agent contract planning; Shawn scaffolds infrastructure and smoke tests. Both review interface contracts.
- D2 — Thursday, October 22: Michelle implements Content Agent and content approval UI; Shawn implements controller foundation, database schema, and supporting integration. Both test draft generation and approval.
- D3 — Friday, October 23: Shawn implements fixture ingestion, deterministic KPIs, Analytics Agent, and experiment approval; Michelle completes Content Agent tests and reviews KPI accuracy. Both integrate Cycle 1.
- D4 — Monday, October 26: Both integrate Experiment Memory and Cycle 2 generation, test the complete workflow, troubleshoot, and verify deployment or documented local fallback. Feature freeze after testing.
- D5 — Tuesday, October 27: Both resolve critical bugs, run final tests, rehearse the demo, verify documentation, and complete joint sign-off. No new features.

### Collaboration and Debugging Practices
- Each partner develops assigned features on separate branches and submits pull requests for review.
- Both partners review interface changes before merging and avoid simultaneous edits to the same files.
- Each pull request includes relevant test results, known limitations, and debugging notes.
- Both partners practice explaining the controller, Content Agent, Analytics Agent, and Experiment Memory.
- Debugging efficiency and complete-system understanding are explicit shared learning goals.

### Documentation and Sign-off
Update PRD.md, PRE_BUILD_CHECKLIST.md, and README.md consistently. Record actual decisions and approvals in docs/decisions.md when created. Prepare the official Pursuit Multi-Agent PRD Google Doc collaboratively and submit its link through Pathfinder according to confirmed course requirements.

These assignments reflect the partners' agreement in principle. No completed implementation, tests, deployment, GitHub Issues, or formal release approval are implied.
