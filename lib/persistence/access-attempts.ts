import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { ControllerError } from "@/lib/controller/errors";

// At most 10 sign-in attempts per client per 15-minute window. Counted in
// Postgres because serverless instances don't share memory.
export const ACCESS_ATTEMPT_LIMIT = 10;
export const ACCESS_WINDOW_MS = 15 * 60 * 1000;

export class TooManyAttemptsError extends ControllerError {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many sign-in attempts. Try again later.", 429);
    this.name = "TooManyAttemptsError";
  }
}

export type AccessAttemptSlot = { clientHash: string; windowStart: Date };

// The table only ever holds this hash, never a raw IP address.
export function hashClient(clientAddress: string): string {
  return createHash("sha256")
    .update(`growthloop-access:${clientAddress}`)
    .digest("hex");
}

function windowStart(now: Date): Date {
  return new Date(Math.floor(now.getTime() / ACCESS_WINDOW_MS) * ACCESS_WINDOW_MS);
}

// Counts the attempt before the code is checked, in one atomic statement, so
// parallel guesses can't slip past the limit. Release the slot after a
// successful sign-in so only failed attempts count.
export async function reserveAccessAttempt(
  db: PrismaClient,
  clientAddress: string,
  now: Date,
  limit = ACCESS_ATTEMPT_LIMIT
): Promise<AccessAttemptSlot> {
  const slot = { clientHash: hashClient(clientAddress), windowStart: windowStart(now) };
  const rows = await db.$queryRaw<{ attempts: number }[]>`
    INSERT INTO access_attempt_window (client_hash, window_start, attempts)
    VALUES (${slot.clientHash}, ${slot.windowStart}, 1)
    ON CONFLICT (client_hash, window_start) DO UPDATE
      SET attempts = access_attempt_window.attempts + 1
      WHERE access_attempt_window.attempts < ${limit}
    RETURNING attempts`;

  if (rows.length === 0) {
    const windowEnd = slot.windowStart.getTime() + ACCESS_WINDOW_MS;
    throw new TooManyAttemptsError(Math.ceil((windowEnd - now.getTime()) / 1000));
  }

  // Earlier windows are never read again.
  await db.$executeRaw`
    DELETE FROM access_attempt_window WHERE window_start < ${slot.windowStart}`;

  return slot;
}

export async function releaseAccessAttempt(
  db: PrismaClient,
  slot: AccessAttemptSlot
): Promise<void> {
  await db.$executeRaw`
    UPDATE access_attempt_window
    SET attempts = attempts - 1
    WHERE client_hash = ${slot.clientHash}
      AND window_start = ${slot.windowStart}
      AND attempts > 0`;
}
