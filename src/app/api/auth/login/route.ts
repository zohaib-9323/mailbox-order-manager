import { NextResponse } from "next/server";
import { setSessionCookie } from "@/server/auth/session";
import { handleRoute, readJson } from "@/server/http/handle-route";
import { login } from "@/server/services/auth-service";
import { loginSchema } from "@/server/validation/auth-schemas";
import { parseOrThrow } from "@/server/validation/parse";

export const POST = handleRoute(async (request: Request) => {
  const input = parseOrThrow(loginSchema, await readJson(request));
  const { token, expiresAt, user } = await login(input);
  await setSessionCookie(token, expiresAt);
  return NextResponse.json({ user });
});
