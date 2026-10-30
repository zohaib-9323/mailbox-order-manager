import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/server/auth/session";
import { handleRoute, readJson } from "@/server/http/handle-route";
import { createOrder, listOrders } from "@/server/services/order-service";
import { createOrderSchema, idempotencyKeySchema, listOrdersQuerySchema } from "@/server/validation/order-schemas";
import { parseOrThrow } from "@/server/validation/parse";

/** Customers get their own orders; admins get all, filterable by status/provider. */
export const GET = handleRoute(async (request: NextRequest) => {
  const user = await requireUser();
  const query = parseOrThrow(listOrdersQuerySchema, Object.fromEntries(request.nextUrl.searchParams));
  return NextResponse.json(await listOrders(user, query));
});

/**
 * Requires an `Idempotency-Key` header. 201 on first create; 200 with
 * `Idempotent-Replayed: true` when the same request is sent again.
 */
export const POST = handleRoute(async (request: NextRequest) => {
  const user = await requireUser();
  const key = parseOrThrow(idempotencyKeySchema, request.headers.get("idempotency-key") ?? undefined);
  const input = parseOrThrow(createOrderSchema, await readJson(request));
  const { order, created } = await createOrder(user, input, key);
  return NextResponse.json(
    { order },
    { status: created ? 201 : 200, headers: created ? undefined : { "Idempotent-Replayed": "true" } },
  );
});
