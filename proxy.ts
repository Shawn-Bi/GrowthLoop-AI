import { NextResponse, type NextRequest } from "next/server";
import { hasValidSession } from "@/lib/auth/access";

// First line of defence for every private page and API route. Route
// handlers and pages check access again close to the data.
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    // A bearer code is verified, and rate-limited, by the route handler.
    if (hasValidSession(request) || request.headers.has("authorization")) {
      return NextResponse.next();
    }
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Pages accept only the session cookie.
  if (hasValidSession(request)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/access";
  url.search = "";
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!access|api/access|api/health|_next/static|_next/image|favicon.ico).*)",
  ],
};
