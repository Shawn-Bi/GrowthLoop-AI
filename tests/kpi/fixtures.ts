import type { DraftRef } from "@/lib/kpi/ingest";

// Test-only rows built from the PRD §5 illustrative math (control 10/250,
// variant 18/240). Not Michelle's GL-03 fixture or expected values.
export const drafts: DraftRef[] = [
  { experiment_id: "exp_001", variant_role: "control", content_id: "cnt_001" },
  { experiment_id: "exp_001", variant_role: "variant", content_id: "cnt_002" },
];

export const controlRow = {
  dataset_id: "test_fixture",
  experiment_id: "exp_001",
  variant_role: "control",
  source: "simulated",
  impressions: 5000,
  link_clicks: 400,
  landing_page_visits: 250,
  demo_requests: 20,
  qualified_demo_requests: 10,
};

export const variantRow = {
  dataset_id: "test_fixture",
  experiment_id: "exp_001",
  variant_role: "variant",
  source: "simulated",
  impressions: 5000,
  link_clicks: 380,
  landing_page_visits: 240,
  demo_requests: 30,
  qualified_demo_requests: 18,
};
