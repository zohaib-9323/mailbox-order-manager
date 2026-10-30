import { createHash } from "node:crypto";
import { getDb } from "@/db/client";
import type { OrderRow } from "@/db/schema";
import { ForbiddenError, IdempotencyKeyReusedError, NotFoundError } from "@/domain/errors";
import { mailboxAddresses } from "@/domain/mailbox-addresses";
import { actorFor, type SessionUser } from "@/domain/user";
import * as orderRepo from "@/server/repositories/order-repository";
import type { CreateOrderInput, ListOrdersQuery } from "@/server/validation/order-schemas";
import { transitionOrder } from "./order-transitions";

export interface CreateOrderResult {
  order: OrderRow;
  /** false when this was a replay of an earlier request with the same Idempotency-Key. */
  created: boolean;
}

/** Fingerprint of the order payload, to detect a key reused for a different order. */
export function requestHash(input: CreateOrderInput): string {
  const canonical = JSON.stringify([input.domain, input.provider, input.mailboxCount]);
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Idempotent order creation keyed by (user, Idempotency-Key).
 *
 * - First request: inserts order + its mailboxes + the "created" audit event in one transaction.
 * - Replay (same key, same payload): returns the original order, writes nothing.
 * - Same key, different payload: 422 IDEMPOTENCY_KEY_REUSED.
 *
 * Concurrency: the unique index + INSERT ... ON CONFLICT DO NOTHING decides the
 * winner atomically, so N parallel identical requests create exactly one order.
 */
export async function createOrder(
  user: SessionUser,
  input: CreateOrderInput,
  idempotencyKey: string,
): Promise<CreateOrderResult> {
  if (user.role !== "customer") throw new ForbiddenError("Only customers can place orders.");
  const hash = requestHash(input);

  const created = await getDb().transaction(async (tx) => {
    const order = await orderRepo.insertOrderIfAbsent(tx, {
      userId: user.id,
      domain: input.domain,
      provider: input.provider,
      mailboxCount: input.mailboxCount,
      idempotencyKey,
      requestHash: hash,
    });
    if (!order) return null;
    await orderRepo.insertMailboxes(tx, order.id, mailboxAddresses(order.domain, order.mailboxCount));
    await orderRepo.insertEvent(tx, {
      orderId: order.id,
      from: null,
      to: "PENDING",
      actor: actorFor(user),
      reason: `Order placed: ${order.mailboxCount} ${order.provider} mailbox(es) on ${order.domain}`,
    });
    return order;
  });
  if (created) return { order: created, created: true };

  // Lost the race or a plain retry: the original order is committed by now.
  const existing = await orderRepo.findByIdempotencyKey(getDb(), user.id, idempotencyKey);
  if (!existing) throw new Error("Idempotency conflict without an existing order"); // unreachable by construction
  if (existing.requestHash !== hash) throw new IdempotencyKeyReusedError();
  return { order: existing, created: false };
}

/** Customers see only their own orders (others are a 404, not a 403, so ids do not leak). */
export async function getOrderDetail(user: SessionUser, orderId: string) {
  const detail = await orderRepo.findDetail(getDb(), orderId);
  if (!detail || (user.role !== "admin" && detail.order.userId !== user.id)) {
    throw new NotFoundError("Order");
  }
  return detail;
}

export type OrderDetail = Awaited<ReturnType<typeof getOrderDetail>>;

export async function listOrders(user: SessionUser, query: ListOrdersQuery) {
  const { items, total } = await orderRepo.list(getDb(), {
    ...query,
    // A customer's filter is always pinned to themselves, whatever the query says.
    userId: user.role === "admin" ? undefined : user.id,
  });
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export type OrderList = Awaited<ReturnType<typeof listOrders>>;

/**
 * Admin retry: FAILED → PENDING. The state machine rejects anything else
 * (409), including retrying an order that is not FAILED. Failed mailboxes go
 * back to PENDING; already ACTIVE ones are kept and will not be provisioned again.
 */
export async function retryOrder(user: SessionUser, orderId: string): Promise<OrderRow> {
  if (user.role !== "admin") throw new ForbiddenError("Only admins can retry orders.");
  return getDb().transaction(async (tx) => {
    const order = await orderRepo.lockById(tx, orderId);
    if (!order) throw new NotFoundError("Order");
    const updated = await transitionOrder(tx, {
      order,
      to: "PENDING",
      actor: actorFor(user),
      reason: "Retried by admin",
      patch: { lastError: null },
    });
    await orderRepo.resetFailedMailboxes(tx, order.id);
    return updated;
  });
}
