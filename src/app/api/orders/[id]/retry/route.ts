import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { handleRoute } from "@/server/http/handle-route";
import { retryOrder } from "@/server/services/order-service";
import { orderIdSchema } from "@/server/validation/order-schemas";
import { parseOrThrow } from "@/server/validation/parse";

/** Admin only: FAILED → PENDING. 409 for any other current status. */
export const POST = handleRoute(async (_request: NextRequest, ctx: RouteContext<"/api/orders/[id]/retry">) => {
  const user = await requireUser();
  const id = parseOrThrow(orderIdSchema, (await ctx.params).id);
  return NextResponse.json({ order: await retryOrder(user, id) });
});
