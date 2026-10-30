import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "mom_session";

/**
 * Optimistic gate only: bounce visitors without a session cookie to /login
 * before rendering. The real check (is the session valid? which role?) happens
 * in the pages and API handlers via src/server/auth/session.ts.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const { pathname } = request.nextUrl;
  if (!hasSession && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Pages only: API routes answer 401 JSON themselves; static assets are skipped.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
