import type { PrismaClient } from "@/generated/prisma/client";
import {
  releaseAccessAttempt,
  reserveAccessAttempt,
} from "@/lib/persistence/access-attempts";
import { checkAccessCode, clientAddress } from "./access";

// Every access-code check, from the sign-in form or a bearer header, counts
// against the client's attempt limit, so the code can't be guessed through
// either path. A correct code gives its attempt back. Throws
// TooManyAttemptsError (429) once the limit is reached.
export async function verifyAccessCode(
  db: PrismaClient,
  code: string,
  headers: Headers,
  now: Date
): Promise<boolean> {
  const slot = await reserveAccessAttempt(db, clientAddress(headers), now);

  if (!checkAccessCode(code)) {
    return false;
  }

  await releaseAccessAttempt(db, slot);
  return true;
}
