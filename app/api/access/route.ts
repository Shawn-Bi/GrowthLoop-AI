import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE,
  checkAccessCode,
  isAccessConfigured,
  issueSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/access";

const bodySchema = z.object({ code: z.string().min(1) });

// Exchanges the shared demo access code for an HttpOnly session cookie.
export async function POST(request: Request) {
  if (!isAccessConfigured()) {
    return Response.json({ error: "Access is not configured." }, { status: 503 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Enter the access code." }, { status: 400 });
  }

  if (!checkAccessCode(body.data.code)) {
    return Response.json({ error: "Invalid access code." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, issueSessionToken(), sessionCookieOptions());
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
