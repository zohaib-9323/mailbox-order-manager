import { InvalidTransitionError } from "./errors";
import type { ActorType, OrderStatus } from "./order";

/**
 * The order lifecycle as data. Each edge lists which actors may take it, so
 * "only an admin can retry" is enforced here, not in a route handler.
 *
 *   PENDING ──worker──▶ PROVISIONING ──worker──▶ ACTIVE
 *      ▲                     │
 *      │                     └──worker/system──▶ FAILED
 *      └────────────admin (retry)────────────────┘
 *
 * `system` may fail a PROVISIONING order when its worker lease expired
 * (the worker crashed mid-run).
 */
const TRANSITIONS: Readonly<Record<OrderStatus, Partial<Record<OrderStatus, readonly ActorType[]>>>> = {
  PENDING: { PROVISIONING: ["worker"] },
  PROVISIONING: { ACTIVE: ["worker"], FAILED: ["worker", "system"] },
  ACTIVE: {},
  FAILED: { PENDING: ["admin"] },
};

export const TERMINAL_STATUSES: readonly OrderStatus[] = ["ACTIVE"];

export function allowedNextStatuses(from: OrderStatus): OrderStatus[] {
  return Object.keys(TRANSITIONS[from]) as OrderStatus[];
}

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

export function checkTransition(from: OrderStatus, to: OrderStatus, actor: ActorType): TransitionCheck {
  const actors = TRANSITIONS[from][to];
  if (!actors) {
    const allowed = allowedNextStatuses(from);
    return {
      ok: false,
      reason: allowed.length ? `allowed next states are ${allowed.join(", ")}` : `${from} is a final state`,
    };
  }
  if (!actors.includes(actor)) {
    return { ok: false, reason: `only ${actors.join(" or ")} may do this` };
  }
  return { ok: true };
}

export function canTransition(from: OrderStatus, to: OrderStatus, actor: ActorType): boolean {
  return checkTransition(from, to, actor).ok;
}

/** Throws InvalidTransitionError (HTTP 409) when the move is not allowed. */
export function assertTransition(from: OrderStatus, to: OrderStatus, actor: ActorType): void {
  const result = checkTransition(from, to, actor);
  if (!result.ok) throw new InvalidTransitionError(from, to, result.reason);
}
