# GrowthLoop AI

**Tagline:** Learn what converts. Know why. Test what works next.

**Status:** Hackathon MVP specification (proposed; not yet implemented).

GrowthLoop AI is an evidence-aware marketing experimentation assistant for early-stage B2B SaaS teams. It connects *content DNA* (audience, hook, pain point, value proposition, proof, CTA, format, channel) to campaign performance and qualified leads, then recommends controlled follow-up experiments and drafts the next content variants. The long-term vision includes authorized publishing, automated analytics ingestion, and continuous learning. **The MVP does not claim autonomous causal discovery or real customer acquisition.**

## Problem
Teams can create and distribute content quickly, but struggle to answer: **Which channel and message generated qualified leads, what evidence supports that conclusion, and what should we test next?** Metrics are fragmented across publishing tools, web analytics, and CRMs. A high-performing post does not by itself prove which specific hook caused conversions.

## Who it's for
Founder-led B2B SaaS teams and small growth teams with limited resources. Initial use case: a restaurant AI phone-ordering SaaS targeting US independent restaurant owners.

## MVP user journey
1. Enter product, ICP, campaign goal and preferred channel.
2. Generate three campaign variants, each with structured content DNA and a clear hypothesis.
3. Review and approve drafts; generate distinct content IDs and tracked destination URLs.
4. Simulate publishing and import clearly labeled **synthetic** impressions, clicks, qualified leads and conversions.
5. View a channel/content funnel dashboard with correctly computed rates.
6. Ask the analysis agent to compare variants, disclose uncertainty and recommend a single-variable next test.
7. Approve a next-round variant and store its lineage, hypothesis and decision in experiment memory.

## MVP scope
**In:** campaign workspace, structured Content DNA, draft/approval status, synthetic dataset seeding, CSV import with validation, metrics dashboard, evidence-aware recommendations, next-variant drafting, experiment log, basic audit trail.

**Out:** live social publishing, scraping, production OAuth integrations, paid ad spend, automatic budget changes, fine-tuning, statistical causal claims, autonomous posting without approval, actual revenue attribution without connected CRM.

## Proposed architecture
- **UI:** Base44 if the team chooses it for the hackathon; verify available plan/API capabilities before implementation.
- **App data:** persistent tables for campaigns, content variants, channel posts, metric snapshots, leads/conversions (synthetic for demo), experiments, recommendations and approvals.
- **Agent:** start with **one orchestrated agent** using tools for content drafting, data queries and experiment recommendations; deterministic code computes metrics.
- **Later:** specialized Research, Content, Analytics and Experiment agents only if operational complexity warrants it.
- **Integrations (later, optional):** publishing platform, GA4/PostHog, HubSpot, SEO/GEO data providers via authorized APIs/webhooks.

## Data contract (minimum)
- `Campaign`: `id`, `name`, `product`, `icp`, `goal`, `created_at`
- `ContentVariant`: `id`, `campaign_id`, `parent_variant_id?`, `channel`, `format`, `hook`, `pain_point`, `value_prop`, `proof`, `cta`, `body`, `hypothesis`, `approval_status`, `created_at`
- `MetricSnapshot`: `id`, `variant_id`, `period_start`, `period_end`, `impressions`, `clicks`, `qualified_leads`, `conversions`, `revenue?`, `source`, `is_synthetic`
- `Experiment`: `id`, `campaign_id`, `control_variant_id`, `test_variant_id`, `variable_changed`, `primary_metric`, `status`, `result_summary`, `confidence_note`
- `Recommendation`: `id`, `campaign_id`, `evidence_variant_ids`, `insight`, `uncertainty`, `next_test`, `approval_status`

**Metric rules:** CTR = clicks / impressions; lead rate = qualified leads / clicks; lead-to-customer rate = conversions / qualified leads. Return N/A on zero denominator; never fabricate missing data. Clearly label synthetic and observed data. Store timestamps, source, campaign IDs and experiment lineage. Do not imply that correlations prove causality.

## Agent guardrails
- Require human approval before publication or material external action.
- Respect platform policies, rate limits, consent, unsubscribe requirements and privacy laws.
- Avoid spam, unverifiable claims and sensitive personal data in demo datasets.
- Explain recommendations with cited internal metrics and sample sizes; state limitations.
- Use deterministic calculations and tests for rates; LLM only for interpretation/drafting.
- Log decisions, model outputs, tool errors and retries; prevent duplicate posts.

## Demo acceptance criteria
- [ ] Create campaign and 3 variants with complete Content DNA.
- [ ] Import synthetic data and show a visible **DEMO DATA** label.
- [ ] Calculate all rates correctly; handle missing/zero denominators.
- [ ] Rank variants by a selected metric and show numerator/denominator.
- [ ] Generate a recommendation that acknowledges confounders and small samples.
- [ ] Generate a follow-up variant changing exactly one specified factor.
- [ ] Save experiment, source data, approvals and next-round lineage.
- [ ] No real posts, messages, spend or external API calls in demo mode.

## Suggested repository layout
```
/docs/PRD.docx
/docs/architecture.md
/docs/data-dictionary.md
/src/                  # platform-specific app code, if exportable
/tests/                # metric, validation and agent evaluation cases
/demo/seed-data.csv
README.md
.env.example           # names only, no secrets
```

## Suggested team ownership (assign names together)
1. Product / UX: problem, flows, copy, demo narrative.
2. Data / attribution: schema, synthetic seed data, metric formulas.
3. Agent / prompts: structured outputs, recommendation safeguards, evals.
4. App / integrations: Base44 UI, storage, import and optional adapters.
5. QA / delivery: end-to-end testing, demo script, README and submission.

Use GitHub Issues per feature, small PRs, peer review, and a designated integration owner. Never commit API keys.

## Build order for Claude Code
1. Inspect repository and environment; **do not assume Base44 source access or API permissions**.
2. Read PRD; propose implementation plan and platform constraints before modifying files.
3. Implement data model + synthetic seed fixtures and deterministic metric functions.
4. Implement campaign, Content DNA and dashboard screens.
5. Add a single agent with schema-validated draft/recommendation outputs.
6. Add experiment memory, approvals, guardrails and test cases.
7. Run unit and end-to-end tests; prepare a 2-minute demo with synthetic-data disclosure.

**Model recommendation:** Claude Sonnet for routine implementation and test generation; Claude Opus for difficult architecture reviews or debugging. Availability and model names should be verified in the team's Claude environment.

## Definition of success
**MVP success:** a credible, auditable *learning workflow* demonstrated on synthetic data. **Post-MVP business success:** real controlled experiments that improve qualified-lead conversion relative to a documented baseline, without misleading attribution.
