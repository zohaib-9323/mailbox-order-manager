import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { mailboxes, orderEvents, orders } from "@/db/schema";
import { ForbiddenError, InvalidTransitionError } from "@/domain/errors";
import { createOrder, retryOrder } from "@/server/services/order-service";
import { eventsFor, fakeRegistry, makeUser, makeWorker, resetDb } from "./helpers";

async function drain(worker: ReturnType<typeof makeWorker>) {
  while (await worker.runOnce()) {
    /* keep going until there is nothing left to claim */
  }
}

async function orderById(id: string) {
  const [o] = await getDb().select().from(orders).where(eq(orders.id, id));
  return o!;
}

describe("provisioning worker (integration, real Postgres)", () => {
  beforeEach(resetDb);

  it("two workers draining the queue concurrently never claim the same order twice", async () => {
    const alice = await makeUser();
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const { order } = await createOrder(
        alice,
        { domain: `d${i}.com`, provider: i % 2 ? "google" : "microsoft", mailboxCount: 2 },
        `k-${i}`,
      );
      ids.push(order.id);
    }

    const registry = fakeRegistry();
    await Promise.all([drain(makeWorker(registry, "w1")), drain(makeWorker(registry, "w2"))]);

    const claims = await getDb()
      .select({ orderId: orderEvents.orderId, n: sql<number>`count(*)::int` })
      .from(orderEvents)
      .where(eq(orderEvents.toStatus, "PROVISIONING"))
      .groupBy(orderEvents.orderId);
    expect(claims).toHaveLength(12);
    expect(claims.every((c) => c.n === 1)).toBe(true);

    // Every mailbox was created exactly once at the provider.
    const calls = [...registry.google.calls, ...registry.microsoft.calls];
    expect(calls).toHaveLength(24);
    expect(new Set(calls).size).toBe(24);

    for (const id of ids) expect((await orderById(id)).status).toBe("ACTIVE");
  });

  it("fails an order when a mailbox fails, and an admin retry re-provisions only the failed mailboxes", async () => {
    const [alice, admin] = await Promise.all([makeUser(), makeUser("admin")]);
    const { order } = await createOrder(alice, { domain: "acme.com", provider: "google", mailboxCount: 3 }, "k-retry");
    const failing = new Set(["blake@acme.com"]);
    const registry = fakeRegistry(failing);

    await drain(makeWorker(registry));
    const failed = await orderById(order.id);
    expect(failed.status).toBe("FAILED");
    expect(failed.lastError).toContain("1 of 3 mailbox(es) failed");
    expect(failed.lockedBy).toBeNull();

    await retryOrder(admin, order.id);
    expect((await orderById(order.id)).status).toBe("PENDING");

    failing.clear(); // the provider recovered
    registry.google.calls.length = 0;
    await drain(makeWorker(registry));

    expect((await orderById(order.id)).status).toBe("ACTIVE");
    expect(registry.google.calls).toEqual(["blake@acme.com"]); // alex and casey were not re-created
    const boxes = await getDb().select().from(mailboxes).where(eq(mailboxes.orderId, order.id));
    expect(boxes.every((b) => b.status === "ACTIVE")).toBe(true);

    const trail = (await eventsFor(order.id)).map((e) => `${e.fromStatus ?? "∅"}→${e.toStatus}:${e.actorType}`);
    expect(trail).toEqual([
      "∅→PENDING:customer",
      "PENDING→PROVISIONING:worker",
      "PROVISIONING→FAILED:worker",
      "FAILED→PENDING:admin",
      "PENDING→PROVISIONING:worker",
      "PROVISIONING→ACTIVE:worker",
    ]);
  });

  it("rejects invalid retries and records nothing", async () => {
    const [alice, admin] = await Promise.all([makeUser(), makeUser("admin")]);
    const { order } = await createOrder(alice, { domain: "ok.com", provider: "microsoft", mailboxCount: 1 }, "k-inv");

    await expect(retryOrder(admin, order.id)).rejects.toBeInstanceOf(InvalidTransitionError); // PENDING
    await drain(makeWorker(fakeRegistry()));
    await expect(retryOrder(admin, order.id)).rejects.toBeInstanceOf(InvalidTransitionError); // ACTIVE is final
    await expect(retryOrder(alice, order.id)).rejects.toBeInstanceOf(ForbiddenError); // customers cannot retry

    expect(await eventsFor(order.id)).toHaveLength(3); // placed, claimed, active
  });

  it("reaps an order whose worker died, and the stale worker cannot overwrite the next attempt", async () => {
    const [alice, admin] = await Promise.all([makeUser(), makeUser("admin")]);
    const { order } = await createOrder(alice, { domain: "slow.com", provider: "google", mailboxCount: 2 }, "k-lease");

    const stale = makeWorker(fakeRegistry(), "stale");
    const claim = await stale.claimNext();
    expect(claim?.attempt).toBe(1);

    // Simulate the worker freezing past its lease.
    await getDb().update(orders).set({ leaseExpiresAt: sql`now() - interval '1 second'` }).where(eq(orders.id, order.id));
    expect(await makeWorker(fakeRegistry(), "reaper").reapExpiredLeases()).toBe(1);
    const reaped = await orderById(order.id);
    expect(reaped.status).toBe("FAILED");
    const last = (await eventsFor(order.id)).at(-1);
    expect(last).toMatchObject({ fromStatus: "PROVISIONING", toStatus: "FAILED", actorType: "system" });

    // Admin retries and a fresh worker claims attempt 2.
    await retryOrder(admin, order.id);
    const fresh = makeWorker(fakeRegistry(), "fresh");
    const claim2 = await fresh.claimNext();
    expect(claim2?.attempt).toBe(2);

    // The stale worker wakes up and tries to finish attempt 1: every write is fenced off.
    expect(await stale.provision(claim!)).toBe("LOST_LEASE");
    const during = await orderById(order.id);
    expect(during).toMatchObject({ status: "PROVISIONING", attempt: 2, lockedBy: "fresh" });
    const boxes = await getDb().select().from(mailboxes).where(eq(mailboxes.orderId, order.id));
    expect(boxes.every((b) => b.status === "PENDING" && b.attempts === 0)).toBe(true);

    expect(await fresh.provision(claim2!)).toBe("ACTIVE");
  });
});
