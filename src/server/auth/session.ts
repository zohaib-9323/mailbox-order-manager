import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { UnauthorizedError } from "@/domain/errors";
import type { SessionUser } from "@/domain/user";
import { userForSessionToken } from "@/server/services/auth-service";

export const SESSION_COOKIE = "mom_session";

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = await readSessionToken();
  return token ? userForSessionToken(token) : null;
}

// ---- for API route handlers: throw, so handleRoute renders 401/403 JSON ----

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

// ---- for pages: redirect instead of throwing ----

export async function requirePageUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePageAdmin(): Promise<SessionUser> {
  const user = await requirePageUser();
  if (user.role !== "admin") redirect("/orders");
  return user;
}

