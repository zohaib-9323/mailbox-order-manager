import type { DbExecutor } from "@/db/client";
import type { OrderRow } from "@/db/schema";
import { ConcurrentModificationError } from "@/domain/errors";
import type { Actor, OrderStatus } from "@/domain/order";
import { assertTransition } from "@/domain/order-state-machine";
import * as orderRepo from "@/server/repositories/order-repository";

export interface TransitionArgs {
  order: Pick<OrderRow, "id" | "status">;
  to: OrderStatus;
  actor: Actor;
  reason?: string | null;
  /** Fencing token: only apply if the order is still on this worker attempt. */
  expectedAttempt?: number;
  patch?: orderRepo.OrderPatch;
}

/**
 * The ONLY way an order changes status. Must be called inside a transaction so
 * the status change and its audit row commit (or roll back) together.
 *
 * 1. Domain check: is `from → to` legal for this actor?  (else 409 INVALID_TRANSITION)
 * 2. Compare-and-set UPDATE ... WHERE status = from     (else 409 CONCURRENT_MODIFICATION)
 * 3. Append to the audit log.
 */
export async function transitionOrder(tx: DbExecutor, args: TransitionArgs): Promise<OrderRow> {
  const from = args.order.status;
  assertTransition(from, args.to, args.actor.type);

  const leavingProvisioning = from === "PROVISIONING";
  const updated = await orderRepo.updateStatusIf(tx, {
    orderId: args.order.id,
    from,
    to: args.to,
    expectedAttempt: args.expectedAttempt,
    // A finished attempt no longer holds a lease.
    patch: leavingProvisioning ? { lockedBy: null, leaseExpiresAt: null, ...args.patch } : args.patch,
  });
  if (!updated) throw new ConcurrentModificationError();

  await orderRepo.insertEvent(tx, {
    orderId: updated.id,
    from,
    to: args.to,
    actor: args.actor,
    reason: args.reason,
  });
  return updated;
}
