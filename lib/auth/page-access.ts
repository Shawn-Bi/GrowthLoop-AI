import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, isValidSessionToken } from "./access";

// Pages call this inside their <Suspense> boundary, so a page is never
// protected by the proxy alone.
export async function requirePageAccess(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  if (!isValidSessionToken(token)) {
    redirect("/access");
  }
}
