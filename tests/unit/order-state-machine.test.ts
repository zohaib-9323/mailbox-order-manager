import { describe, expect, it } from "vitest";
import {
  allowedNextStatuses,
  assertTransition,
  canTransition,
  checkTransition,
} from "@/domain/order-state-machine";
import { InvalidTransitionError } from "@/domain/errors";
import { ACTOR_TYPES, ORDER_STATUSES, type ActorType, type OrderStatus } from "@/domain/order";

/** The complete set of legal moves. Anything not listed must be rejected. */
const LEGAL: ReadonlyArray<[OrderStatus, OrderStatus, ActorType]> = [
  ["PENDING", "PROVISIONING", "worker"],
  ["PROVISIONING", "ACTIVE", "worker"],
  ["PROVISIONING", "FAILED", "worker"],
  ["PROVISIONING", "FAILED", "system"],
  ["FAILED", "PENDING", "admin"],
];

const isLegal = (from: OrderStatus, to: OrderStatus, actor: ActorType) =>
  LEGAL.some(([f, t, a]) => f === from && t === to && a === actor);

describe("order state machine", () => {
  describe("exhaustive matrix (every from × to × actor)", () => {
    const cases = ORDER_STATUSES.flatMap((from) =>
      ORDER_STATUSES.flatMap((to) => ACTOR_TYPES.map((actor) => ({ from, to, actor, legal: isLegal(from, to, actor) }))),
    );

    it.each(cases)("$from → $to by $actor: legal=$legal", ({ from, to, actor, legal }) => {
      expect(canTransition(from, to, actor)).toBe(legal);
    });

    it("covers all 64 combinations", () => {
      expect(cases).toHaveLength(64);
      expect(cases.filter((c) => c.legal)).toHaveLength(LEGAL.length);
    });
  });

  it("follows the happy path PENDING → PROVISIONING → ACTIVE", () => {
    expect(() => assertTransition("PENDING", "PROVISIONING", "worker")).not.toThrow();
    expect(() => assertTransition("PROVISIONING", "ACTIVE", "worker")).not.toThrow();
  });

  it("lets an admin retry a failed order, and nobody else", () => {
    expect(canTransition("FAILED", "PENDING", "admin")).toBe(true);
    for (const actor of ["customer", "worker", "system"] as const) {
      expect(canTransition("FAILED", "PENDING", actor)).toBe(false);
    }
  });

  it("treats ACTIVE as final", () => {
    expect(allowedNextStatuses("ACTIVE")).toEqual([]);
    expect(checkTransition("ACTIVE", "PENDING", "admin")).toEqual({ ok: false, reason: "ACTIVE is a final state" });
  });

  it("rejects skipping PROVISIONING", () => {
    expect(checkTransition("PENDING", "ACTIVE", "worker")).toEqual({
      ok: false,
      reason: "allowed next states are PROVISIONING",
    });
  });

  it("rejects self-transitions (no silent no-op that would write a bogus audit row)", () => {
    for (const s of ORDER_STATUSES) {
      for (const actor of ACTOR_TYPES) expect(canTransition(s, s, actor)).toBe(false);
    }
  });

  it("throws a 409 InvalidTransitionError with a readable reason", () => {
    try {
      assertTransition("PENDING", "PROVISIONING", "admin");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTransitionError);
      const e = err as InvalidTransitionError;
      expect(e.status).toBe(409);
      expect(e.code).toBe("INVALID_TRANSITION");
      expect(e.message).toBe("Cannot move order from PENDING to PROVISIONING: only worker may do this");
      expect(e.details).toEqual({ from: "PENDING", to: "PROVISIONING" });
    }
  });
});
