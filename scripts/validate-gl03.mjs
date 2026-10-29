// Run without npm installation on the documentation-only main/GL-03 branch:
// node scripts/validate-gl03.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(new URL('../data/fixtures/demo_fixture_v1.json', import.meta.url)));
const expected = JSON.parse(readFileSync(new URL('../data/fixtures/expected.json', import.meta.url)));
assert.equal(expected.source, 'simulated');
assert.equal(fixture.length, 4);
for (const row of fixture) {
  assert.equal(row.source, 'simulated');
  assert.equal(row.dataset_id, expected.dataset_id);
  assert.equal(row.experiment_id, expected.experiment_id);
  assert.ok(['control', 'variant'].includes(row.variant_role));
  for (const field of ['impressions', 'link_clicks', 'landing_page_visits', 'demo_requests', 'qualified_demo_requests']) assert.ok(Number.isInteger(row[field]) && row[field] >= 0, field);
}
const funnel = ['qualified_demo_requests', 'demo_requests', 'landing_page_visits', 'link_clicks', 'impressions'];
const accepted = [], rejected = [];
fixture.forEach((row, index) => {
  const reasons = funnel.slice(0, -1).flatMap((field, i) => row[field] > row[funnel[i + 1]] ? [`${field} (${row[field]}) exceeds ${funnel[i + 1]} (${row[funnel[i + 1]]})`] : []);
  if (reasons.length) rejected.push({ index, reasons }); else accepted.push(row);
});
assert.equal(accepted.length, expected.expected_ingestion.accepted_row_count);
assert.equal(rejected.length, expected.expected_ingestion.quarantined_row_count);
assert.deepEqual(rejected, expected.invalid_rows.map(row => ({ index: row.index_zero_based, reasons: [row.reason] })));
for (const row of expected.valid_rows) {
  const actual = accepted.find(item => item.variant_role === row.variant_role);
  assert.equal(actual.qualified_demo_requests, row.numerator_qualified_demo_requests);
  assert.equal(actual.landing_page_visits, row.primary_denominator_landing_page_visits);
  assert.equal(actual.link_clicks, row.secondary_denominator_link_clicks);
  assert.equal(actual.qualified_demo_requests / actual.landing_page_visits, row.primary_kpi.value);
  assert.equal(actual.qualified_demo_requests / actual.link_clicks, row.secondary_kpi.value);
  assert.equal(row.primary_kpi.value * 100, row.primary_kpi.percent);
  assert.equal(row.secondary_kpi.value * 100, row.secondary_kpi.percent);
  console.log(`Simulated, pre-authored ${row.variant_role}: primary ${row.primary_kpi.percent}%; secondary ${row.secondary_kpi.percent}%.`);
}
for (const kpi of [expected.zero_denominator_unit_case.primary_kpi, expected.zero_denominator_unit_case.secondary_kpi]) {
  assert.equal(kpi.status, 'not_calculable'); assert.equal(kpi.value, null);
}
console.log('Independent JSON validation passed: 2 accepted rows, 2 invalid examples with exact reasons. These are not actual campaign results.');
console.log('This standalone check is independent arithmetic; the Vitest GL-03 suite separately exercises the real KPI implementation.');
