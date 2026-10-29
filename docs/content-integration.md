# Content → Analytics → Content integration

Validated locally on 2026-10-28. No production deployment or PR merge was performed.

## Source snapshots

The integration branch starts from PR #12 (`0a7b43a`), which contains the stacked claim registry, controller, persistence, Analytics and KPI work. The Content safeguards from `test/content-agent-ab-contract` (`2d34da0`) were combined only on `integration/content-analytics-loop`. PR #13 (`b2392f7`) is an ancestor of that Content branch. The source branches/PRs and main were not changed.

## Implemented workflow

1. Create Cycle 1 through `POST /api/experiments` with a hypothesis and one supported `primary_test_variable`.
2. Call `POST /api/experiments/exp_001/drafts` with `brief: { audience, campaignGoal, keyMessage }` and `approved_claim_ids`. The experiment page exposes this form. Claims must already exist in the reviewed registry; supplied text is not treated as registry approval.
3. The controller loads and validates registry records, constructs a versioned handoff, and invokes the existing deterministic Content Agent. It persists two pending drafts and typed Content DNA atomically. Exactly one of pain_point/hook/value_proposition/evidence/cta differs. IDs are controller-owned and unique per experiment/role.
4. Approve both drafts individually through the existing draft decision API or the experiment UI. Marking ready is a separate human action, never publication.
5. Load a pre-authored simulated fixture through the metrics API. Run Analytics through the analysis API. The Analytics adapter receives stored DNA and controller-computed metrics mapped to actual generated content IDs.
6. Analytics proposes a single changed dimension plus `content_change: { baseline_content_id, variant_value }`. Findings, citations, uncertainty and controls remain part of the proposal. The UI displays the concrete baseline and replacement before human approval.
7. The experiment approver's decision atomically stores its audit, closes the parent, creates the next experiment/handoff and invokes Content for the child pair. Any generation failure rolls the entire decision back.
8. Cycle 2 copies the approved baseline and replaces only the approved dimension in the variant. Both new drafts start pending, with parent findings and metric IDs retained in generation_context. Nothing publishes automatically.

The home page now enters the access-protected persisted workflow. The original local-only dashboard component is retained rather than deleted.

## Contract and security

`schemas/content.ts` is the validated DNA boundary. All five Analytics variables map explicitly to the existing Content Agent variables; unknown variables fail. The existing v1.0 handoff fields remain intact; content_change is an optional backward-compatible addition to stored proposals/handoffs, but required to execute an integrated next cycle. Recommendations lacking a concrete change must be rejected/regenerated, not silently interpreted or substituted.

At the controller boundary, the stored handoff is compared against its human-approved database proposal, experiment, correlation, parent and source drafts. Metric references must resolve to the parent. The baseline must be approved. Its claim IDs must remain unchanged and currently usable. The Content Agent independently validates the handoff, approval state, variable mapping and registry. It binds findings/metric IDs to the generated DNA and applies the approved replacement rather than inserting analytical findings or simulated rates into public copy.

The database's approved_demo_claim/verified_claim statuses map explicitly to Content's approved status after registry validation. Missing/rejected claims fail; the Content resolver also rejects pending/revoked statuses. Database revocation uses rejected_claim, since the existing Prisma enum has no pending/revoked values. Claim text and hypothetical labels are rechecked at both approval and mark_ready. Empty claim provenance cannot be approved. Human semantic review remains necessary for assertions in free text; schema validation is not factual verification.

The shared access code and recorded role labels preserve the existing demo security model; they are not authenticated individual identities or enterprise RBAC. There is no publication integration.

Historical, manually seeded drafts without the new DNA remain on the existing handoff-only behavior. They are not silently migrated or regenerated. New controller-generated drafts follow the integrated path. An old source draft cannot be used as a new-contract baseline without valid DNA.

## Executed validation

- `npm test -- --maxWorkers=2`: **196 passed, 0 failed**, 19 files. Includes **28 new integration tests** and the existing 168 Vitest tests.
- `npm run test:integration`: **28 passed, 0 failed** on the final HTTP-fixture implementation.
- `npm run test:content`: **15 passed, 0 failed**, preserving the supplied Content regression suite.
- `npm run typecheck`: passed.
- `npm run lint`: passed. CommonJS is explicitly allowed for the inherited Node test files, while other lint rules remain enabled.
- `npm run build`: passed after replacing build-time Google font downloads with the same self-hosted Geist fonts from the pinned, integrity-checked npm package.
- Final production-server HTTP smoke: **5 passed, 0 failed**. Health 200; unauthenticated generation 401; anonymous home redirects to access; authenticated home redirects to experiments; access page returns HTML (200). The smoke server was stopped afterward.

The complete workflow runs over a local HTTP harness dispatching production Next API handlers, including the real fixture-file metrics route. Content generation, Analytics JSON parsing/evidence review, controller logic, migrations and Prisma persistence are real. The database is PGlite (PostgreSQL), not an in-memory mock. Only database binding and Anthropic transport are replaced for isolation. This is not a live Anthropic/Neon or browser E2E test.

Tests cover all five variables; missing handoff fields; unknown variables; wrong role; pending/rejected recommendations; rejected/revoked/pending claims; claim revocation before approval/readiness/advancement; duplicate/concurrent generation; tampered metric references; transactional rollback; and persisted DNA after database close/reopen.

`data/fixtures/test_fixture.json` is an illustrative integration-only fixture, not Michelle's approved GL-03 results. Its numbers do not establish campaign performance.

## Captured handoff evidence

Committed traces:

- `docs/integration/content-handoff-http-trace.json`: actual HTTP workflow; selected variable hook.
- `docs/integration/content-handoff-trace.json`: controller/API workflow; selected variable cta, with only CTA changed in Cycle 2.

In both traces, controller_send, content_receive and content_result have the same payload and per-field SHA-256 hashes, correlation_id `corr_exp_001`, and child experiment `exp_002`. No required fields were missing or rejected in the successful runs. A/B labels map to control/variant and reviewed registry statuses map to approved; evidence fields are not transformed. Logs contain opaque identifiers and hashes, not prose, credentials or claim text. content_result means validated generation; successful transaction/database assertions establish persistence.

For the HTTP run, the findings hash is `8bc5d8f7054a9e6a367c6f01944fb2579ca31a42308e04a92e42bd87dbc8de9f`; metric_ids hash is `bf1a01fd31d6ba45f96a60aa1f2a91911d136f90d9516897ec61327833825b06`. Both are identical on send/receive/result. The selected variable is hook at every stage. Test assertions also verify the corresponding actual findings and metric IDs in stored Cycle 2 DNA for the CTA run.

## Environment limits and reproduction

No ANTHROPIC_API_KEY/ANTHROPIC_MODEL or DATABASE_URL/DATABASE_URL_UNPOOLED was injected. Live Anthropic calls and Neon migration/deployment were not run. Production use still requires those bindings, a demo access code and actual reviewed seed content.

The native Prisma engine/checksum host binaries.prisma.sh returned proxy 403 during npm ci/postinstall. Verification was never disabled. Dependencies installed, and the client was generated using the official same-version npm/WASM generator, without a native engine download:

```sh
npm install --prefix /tmp/growthloop-prisma-tools --ignore-scripts --no-audit --no-fund @prisma/internals@7.10.1 @prisma/client-generator-ts@7.10.1
node <<'JS'
const {getGenerators} = require('/tmp/growthloop-prisma-tools/node_modules/@prisma/internals');
const {PrismaClientTsGenerator} = require('/tmp/growthloop-prisma-tools/node_modules/@prisma/client-generator-ts');
(async () => {
  const generators = await getGenerators({
    schemaPath: process.cwd() + '/prisma/schema.prisma',
    registry: {'prisma-client': {type: 'in-process', generator: new PrismaClientTsGenerator()}},
    skipDownload: true,
    cliCommand: 'prisma generate',
  });
  try { for (const generator of generators) await generator.generate(); }
  finally { for (const generator of generators) generator.stop(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
JS
```

Run these commands from the repository root after dependencies are installed. This does not enable native migration commands; a normal fresh npm ci still requires access to binaries.prisma.sh, or the equivalent dependency-install-without-lifecycle plus documented client-generation procedure. The temporary generator tools are not application dependencies. No external database, model or deployment readiness is implied by the isolated tests.
