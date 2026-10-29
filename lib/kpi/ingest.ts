import {
  fixtureRowSchema,
  type FixtureRow,
  type VariantRole,
} from "@/schemas/metrics";

// A controller-generated draft that fixture rows are matched against.
export type DraftRef = {
  experiment_id: string;
  variant_role: VariantRole;
  content_id: string;
};

export type AcceptedRow = FixtureRow & { content_id: string };

export type QuarantinedRow = {
  index: number;
  row: unknown;
  reasons: string[];
};

export type IngestResult = {
  accepted: AcceptedRow[];
  quarantined: QuarantinedRow[];
};

// Funnel order for the synthetic dataset: each count must not exceed the next.
const FUNNEL = [
  "qualified_demo_requests",
  "demo_requests",
  "landing_page_visits",
  "link_clicks",
  "impressions",
] as const;

function draftKey(experimentId: string, role: VariantRole): string {
  return `${experimentId}::${role}`;
}

function formatIssue(issue: { path: PropertyKey[]; message: string }): string {
  const path = issue.path.map(String).join(".") || "row";
  return `${path}: ${issue.message}`;
}

function funnelErrors(row: FixtureRow): string[] {
  const errors: string[] = [];

  for (let i = 0; i < FUNNEL.length - 1; i++) {
    const lower = FUNNEL[i];
    const upper = FUNNEL[i + 1];

    if (row[lower] > row[upper]) {
      errors.push(`${lower} (${row[lower]}) exceeds ${upper} (${row[upper]})`);
    }
  }

  return errors;
}

// Validates simulated fixture rows and maps each to its content draft.
// Invalid, unmatched or ambiguous rows are quarantined with reasons instead
// of being repaired or dropped silently.
export function ingestFixture(
  rows: unknown,
  drafts: DraftRef[]
): IngestResult {
  if (!Array.isArray(rows)) {
    throw new Error("Fixture must be an array of rows.");
  }

  const contentIds = new Map(
    drafts.map((draft) => [
      draftKey(draft.experiment_id, draft.variant_role),
      draft.content_id,
    ])
  );
  const quarantined: QuarantinedRow[] = [];
  const candidates: { index: number; row: AcceptedRow }[] = [];

  rows.forEach((raw, index) => {
    const parsed = fixtureRowSchema.safeParse(raw);

    if (!parsed.success) {
      quarantined.push({
        index,
        row: raw,
        reasons: parsed.error.issues.map(formatIssue),
      });
      return;
    }

    const row = parsed.data;
    const reasons = funnelErrors(row);
    const contentId = contentIds.get(
      draftKey(row.experiment_id, row.variant_role)
    );

    if (!contentId) {
      reasons.push(
        `No content draft for experiment_id=${row.experiment_id}, variant_role=${row.variant_role}`
      );
    }

    if (reasons.length > 0 || !contentId) {
      quarantined.push({ index, row: raw, reasons });
      return;
    }

    candidates.push({ index, row: { ...row, content_id: contentId } });
  });

  // Two valid rows for the same draft are ambiguous: quarantine both rather
  // than guess which one is correct.
  const rowsPerDraft = new Map<string, number>();
  for (const { row } of candidates) {
    const key = draftKey(row.experiment_id, row.variant_role);
    rowsPerDraft.set(key, (rowsPerDraft.get(key) ?? 0) + 1);
  }

  const accepted: AcceptedRow[] = [];
  for (const { index, row } of candidates) {
    const key = draftKey(row.experiment_id, row.variant_role);

    if ((rowsPerDraft.get(key) ?? 0) > 1) {
      quarantined.push({
        index,
        row: rows[index],
        reasons: [
          `Duplicate row for experiment_id=${row.experiment_id}, variant_role=${row.variant_role}`,
        ],
      });
    } else {
      accepted.push(row);
    }
  }

  quarantined.sort((a, b) => a.index - b.index);

  return { accepted, quarantined };
}
