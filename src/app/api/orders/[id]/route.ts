import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { handleRoute } from "@/server/http/handle-route";
import { getOrderDetail } from "@/server/services/order-service";
import { orderIdSchema } from "@/server/validation/order-schemas";
import { parseOrThrow } from "@/server/validation/parse";

/** Order with per-mailbox status and the full audit log. */
export const GET = handleRoute(async (_request: NextRequest, ctx: RouteContext<"/api/orders/[id]">) => {
  const user = await requireUser();
  const id = parseOrThrow(orderIdSchema, (await ctx.params).id);
  return NextResponse.json(await getOrderDetail(user, id));
});
