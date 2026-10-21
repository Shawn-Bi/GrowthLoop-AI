# GrowthLoop AI — TEAM_TASKS.md

**Status:** Proposed for Michelle & Shawn approval | **Date:** 2026-10-21 | **Timebox:** two weeks from joint kickoff (exact dates and school deadline TBD)

## Ownership principles
- **Shawn — Product / GrowthLoop lead (proposed):** product vision, Content DNA, conversion KPI, end-to-end workflow, agent handoff, acceptance criteria, architecture review, integration and demo sign-off.
- **Michelle — GrantReady customer / Campaign lead (proposed):** hypothetical product brief, ICP, claim registry and approvals, campaign scenarios, sample marketing messages, review of analytical findings and demo narrative.
- **Implementation:** proposed Shawn-led Claude Code implementation with Michelle owning review/fixture content. This is **not a unilateral assignment**: both approve task owners and can redistribute technical work. Avoid parallel edits to shared core files; use separate branches and pull requests.
- **Shared decisions:** stack, cost ceiling, approval permissions, actual submission date, final PRD, acceptance and merge review.

## MVP demo definition
Two cycles: product brief + approved claims → Content Agent makes 2 LinkedIn variations with Content DNA → human approval → simulated metrics → deterministic KPI computation → Analytics Agent recommends experiment → human approval → persistent Experiment Memory → structured handoff → two new variants referencing Cycle 1 experiment. **No live publishing, real CRM or paid ads.**

## Week 1 — working vertical slice
| ID | Task / output | Proposed owner | Reviewer | Target | Depends on | Definition of done |
|---|---|---|---|---|---|---|
| GL-01 | Confirm seven PRD decisions and deadline | Shawn + Michelle | Both | D1 | None | Decision register approved; actual date recorded |
| GL-02 | GrantReady brief, ICP, demo claims, disallowed claims | Michelle | Shawn | D1–D2 | GL-01 | Approved hypothetical product brief; every claim labeled |
| GL-03 | Lock KPI, schemas, data fixtures, handoff contract | Shawn | Michelle | D2 | GL-01, GL-02 | Schemas and 2-cycle sample records validated |
| GL-04 | App scaffold, API connectivity, persistent DB | Shawn (Claude Sonnet) | Michelle | D3 | GL-03 | Local app starts; server-only Anthropic key; DB persists after restart |
| GL-05 | Content Agent, Content DNA, human review gate | Shawn (Claude Sonnet) | Michelle | D4–D5 | GL-02, GL-04 | 2 schema-valid drafts; unsupported claims blocked; approval saved |
| GL-06 | Simulated fixture, deterministic metrics and Analytics Agent | Shawn (Claude Sonnet) | Michelle | D6 | GL-03–05 | Fixture labeled simulated; math test passes; proposal cites data |
| GL-07 | Workflow controller and first-cycle smoke test | Shawn (Claude Sonnet) | Michelle | D7 | GL-05–06 | End-to-end Cycle 1 locally repeatable, structured handoff logged |

## Week 2 — close loop and deliver
| ID | Task / output | Proposed owner | Reviewer | Target | Depends on | Definition of done |
|---|---|---|---|---|---|---|
| GL-08 | Experiment Memory and Cycle 2 handoff | Shawn (Claude Sonnet) | Michelle | D8–D9 | GL-07 | Saved record survives restart; Cycle 2 drafts reference Cycle 1 ID |
| GL-09 | Claim/ICP and marketing-output review; demo script | Michelle | Shawn | D9–D11 | GL-08 | Hypothetical disclaimers correct; narrative matches actual UI |
| GL-10 | Contract, failure, approval and 2-cycle evals | Shawn (Claude Sonnet) | Michelle | D10–D11 | GL-08 | Tests run, results documented; errors handled; no fake pass claims |
| GL-11 | Deploy / accessible demo / runtime verification | Shawn (Claude Sonnet) | Michelle | D12 | GL-10 | Hosted URL or agreed local fallback works; persistent DB confirmed |
| GL-12 | Final rehearsal, docs sync, submission | Shawn + Michelle | Both | D13–D14 | GL-09–11 | Demo repeatable, README reflects actual run steps, PRD status updated |

## Stretch work (only after GL-08 passes)
- CSV upload UI; third LinkedIn variant; UTM copy/export; dashboard polish; lightweight single-agent baseline comparison.
- Not in this sprint: LinkedIn publishing API, CRM/GA4, real paid marketing, advanced attribution, SEO/GEO.

## Collaboration / GitHub protocol
1. Create one Issue per GL task with acceptance checks; mark proposed owner until jointly agreed.
2. `main` protected by review when available. Branch pattern `feat/GL-05-content-agent`.
3. One PR per issue; PR includes screenshots or test evidence and mentions issue.
4. No real credentials in repo, issues, screenshots or client code; use `.env.local` and deployment secrets.
5. Daily 10–15 minute async update: done / next / blockers. Raise blockers within 24 hours.
6. Freeze new features after D10; reserve D13–D14 for rehearsals and fixes.

## Dependencies and critical path
GL-01 → GL-02/03 → GL-04 → GL-05 → GL-06 → GL-07 → GL-08 → GL-10 → GL-11 → GL-12. Michelle can draft GL-09 in parallel once claims are approved. **Do not delay the first working end-to-end slice for UI polish.**

## Unresolved team approvals
- Michelle accepts proposed ownership; exact kickoff/deadline; Anthropic budget cap; deployment account owner; final approval rights; whether the team has separate API accounts; what final submission format is required.

## GitHub issue creation status (2026-10-21)
Attempted to create issues in `Shawn-Bi/GrowthLoop-AI`; GitHub returned HTTP 403 `Resource not accessible by integration`. **No issue creation was confirmed.** GL-01 through GL-12 above are proposed issue specifications, not live issue numbers. A repository owner must grant the connected GitHub integration Issues write permission (or create issues manually) before they can be published. Do not refer to GL identifiers as GitHub issue numbers.
