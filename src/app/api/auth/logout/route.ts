import { NextResponse } from "next/server";
import { clearSessionCookie, readSessionToken } from "@/server/auth/session";
import { handleRoute } from "@/server/http/handle-route";
import { logout } from "@/server/services/auth-service";

export const POST = handleRoute(async () => {
  const token = await readSessionToken();
  if (token) await logout(token);
  await clearSessionCookie();
  return new NextResponse(null, { status: 204 });
});
