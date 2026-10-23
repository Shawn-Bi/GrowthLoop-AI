import type { PrismaClient } from "@/generated/prisma/client";

// PRD fixed operating policy: at most 30 successful agent generations per
// UTC day across the whole deployment.
export const DAILY_GENERATION_LIMIT = 30;

export class QuotaExceededError extends Error {
  readonly httpStatus = 429;

  constructor(day: string, limit: number) {
    super(`Daily generation limit of ${limit} reached for ${day} (UTC).`);
    this.name = "QuotaExceededError";
  }
}

export type GenerationSlot = { day: string; used: number };

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// Reserves a slot in one atomic statement before calling an agent, so
// concurrent requests can't overshoot the limit. Release the slot if the
// generation fails, so only successful calls count.
export async function reserveGenerationSlot(
  db: PrismaClient,
  now: Date,
  limit = DAILY_GENERATION_LIMIT
): Promise<GenerationSlot> {
  const day = utcDay(now);
  const rows = await db.$queryRaw<{ successful_calls: number }[]>`
    INSERT INTO daily_generation_quota (day, successful_calls)
    VALUES (${day}, 1)
    ON CONFLICT (day) DO UPDATE
      SET successful_calls = daily_generation_quota.successful_calls + 1
      WHERE daily_generation_quota.successful_calls < ${limit}
    RETURNING successful_calls`;

  if (rows.length === 0) {
    throw new QuotaExceededError(day, limit);
  }

  return { day, used: rows[0].successful_calls };
}

export async function releaseGenerationSlot(
  db: PrismaClient,
  slot: GenerationSlot
): Promise<void> {
  await db.$executeRaw`
    UPDATE daily_generation_quota
    SET successful_calls = successful_calls - 1
    WHERE day = ${slot.day} AND successful_calls > 0`;
}
