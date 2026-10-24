import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE,
  isAccessConfigured,
  issueSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/access";
import { verifyAccessCode } from "@/lib/auth/verify";
import { errorResponse } from "@/lib/controller/http";
import { getDb } from "@/lib/db";

const bodySchema = z.object({ code: z.string().min(1) });

// Exchanges the shared demo access code for an HttpOnly session cookie.
// Attempts are limited per client (429 with Retry-After).
export async function POST(request: NextRequest) {
  if (!isAccessConfigured()) {
    return Response.json({ error: "Access is not configured." }, { status: 503 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Enter the access code." }, { status: 400 });
  }

  try {
    const valid = await verifyAccessCode(
      getDb(),
      body.data.code,
      request.headers,
      new Date()
    );
    if (!valid) {
      return Response.json({ error: "Invalid access code." }, { status: 401 });
    }
  } catch (error) {
    return errorResponse(error, request);
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
