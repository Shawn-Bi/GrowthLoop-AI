import type { PrismaClient } from "@/generated/prisma/client";
import { metricRecordSchema, type MetricRecord } from "@/schemas/metrics";

// Idempotent: recomputing the same dataset yields the same metric IDs, so
// existing rows are kept rather than duplicated.
export async function saveMetricRecords(
  db: PrismaClient,
  records: MetricRecord[]
): Promise<number> {
  const result = await db.metricRecord.createMany({
    data: records.map((record) => ({
      id: record.metric_id,
      experimentId: record.experiment_id,
      contentId: record.content_id,
      datasetId: record.dataset_id,
      variantRole: record.variant_role,
      metric: record.metric,
      source: record.source,
      record,
    })),
    skipDuplicates: true,
  });

  return result.count;
}

// Re-validated on read, so the Analytics Agent only ever sees records that
// match the current contract.
export async function loadMetricRecords(
  db: Pick<PrismaClient, "metricRecord">,
  experimentId: string
): Promise<MetricRecord[]> {
  const rows = await db.metricRecord.findMany({
    where: { experimentId },
    orderBy: { id: "asc" },
  });

  return rows.map((row) => metricRecordSchema.parse(row.record));
}
