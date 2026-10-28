# GL-03 — Simulated fixture and independent expected KPIs

All values are **simulated, pre-authored data**, not actual campaign results, measured lift, statistical significance, or causal evidence.

## Approved inputs preserved

Both JSON files were copied byte-for-byte from Michelle's uploaded GL-03-files.zip, without replacing any numbers with existing engineering fixtures:

- data/fixtures/demo_fixture_v1.json — SHA-256 ec8444e735f69465bee4c4a4bdfe1c2ea8e4e17b54c6655aabccdb49cbd667c8
- data/fixtures/expected.json — SHA-256 08a315cef08f11e5b3bd17a3253df90bdc2679211e7f7337a4911ba8214e30a4

The fixture has two valid rows and two deliberately invalid examples for exp_001. Source is simulated throughout. The separate all-zero unit case is not inserted into the fixture: adding another exp_001/role row could trigger duplicate-row quarantine.

## Independent expected arithmetic

| Simulated role | Primary: qualified / visits | Secondary: qualified / clicks |
|---|---|---|
| Control | 8 / 80 = 0.10 = 10% | 8 / 100 = 0.08 = 8% |
| Variant | 15 / 100 = 0.15 = 15% | 15 / 120 = 0.125 = 12.5% |

The synthetic differences are 5 and 4.5 percentage points respectively. They are not real campaign lift.

Verified quarantine reasons, with original zero-based row positions:

- Row 2: qualified_demo_requests (13) exceeds demo_requests (12)
- Row 3: landing_page_visits (130) exceeds link_clicks (120)

The accepted rows produce 14 schema-valid metric records: five counts and two rates for each role. Invalid rows contribute no metrics. Content IDs are resolved through experiment + role, not supplied in the fixture.

Both rates for the separate all-zero case return status not_calculable and value null, never a calculated 0%. Missing/invalid denominators also return not_calculable. A zero numerator with a positive denominator remains a legitimate calculated zero, per the existing KPI contract.

## Compatibility review

TEAM_TASKS.md GL-03/GL-08, PRE_BUILD_CHECKLIST.md fixture and denominator requirements, PRD.md sections 3/5, schemas/metrics.ts and lib/kpi/{ingest,calculate}.ts were reviewed.

No production Analytics/KPI changes are needed. Both intentionally invalid rows pass the structural Zod schema (their counts are nonnegative integers); the ingestion layer correctly rejects their funnel relationships. The independent expected.json file is a test oracle, not a metrics input; load demo_fixture_v1 through the fixture route, not expected.json.

One wording difference is intentional: expected.json describes the zero-denominator reason as "zero denominator", while calculateRate emits "Denominator is 0." The tests verify the shared status/null semantics and the actual implementation reason without rewriting Michelle's expected file.

The GL-03 branch was created from main at a44ebbf3401216c3572d49fc2aa94e15cc30d359. Main does not yet include the KPI/schema/Vitest stack. Rather than merging Shawn's open work into this branch or copying his implementation, the test runner materializes a pinned implementation read-only in a temporary directory. It tests this branch's actual JSON against that source, then removes the temporary directory. No source branches are changed. The default source is integration/content-analytics-loop at 49797865ac3900834846cc4aaf8ec467cd2a2053; its KPI and metrics schema match the reviewed Shawn implementation.

## Executed checks

- node scripts/validate-gl03.mjs — passed independent fixture/provenance/arithmetic checks without external dependencies.
- node scripts/test-gl03-kpi.mjs — **38 tests passed, 0 failed**, 3 files: the GL-03 suite plus existing calculate and ingest suites. Uses the real implementation and Zod schemas, not a reimplemented KPI function.
- git diff --check — passed.
- ZIP-vs-working-file byte comparison — passed for both JSON files.

No app build, LLM request, production database mutation or deployment is required for this data-only task; these were not run.

## Reproduce

From the GL-03 branch, the independent check needs only Node:

    node scripts/validate-gl03.mjs

The cross-branch implementation test needs Vitest 5.0.5, Zod 4.6.7, and the pinned source commit available locally. This environment reused the previously installed integration toolchain. If necessary, fetch the integration branch read-only, or supply another compatible local source ref as the runner's first argument:

    node scripts/test-gl03-kpi.mjs 49797865ac3900834846cc4aaf8ec467cd2a2053

Once the KPI stack lands, tests/kpi/gl-03-fixture.test.ts can run normally under the existing Vitest alias configuration. Merge/retest coordination belongs to Shawn; this task does not merge or modify his branches or PRs.
