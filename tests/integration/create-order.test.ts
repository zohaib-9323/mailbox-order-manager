import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { mailboxes, orders } from "@/db/schema";
import { ForbiddenError, IdempotencyKeyReusedError } from "@/domain/errors";
import { createOrder } from "@/server/services/order-service";
import { createOrderSchema } from "@/server/validation/order-schemas";
import { eventsFor, makeUser, resetDb } from "./helpers";

const input = createOrderSchema.parse({ domain: "  Acme.COM ", provider: "google", mailboxCount: "3" });

describe("createOrder (integration, real Postgres)", () => {
  beforeEach(resetDb);

  it("creates the order, its mailboxes and a 'placed' audit event in one go", async () => {
    const alice = await makeUser();
    const { order, created } = await createOrder(alice, input, "key-0001");

    expect(created).toBe(true);
    expect(order).toMatchObject({ status: "PENDING", domain: "acme.com", provider: "google", mailboxCount: 3, attempt: 0 });

    const boxes = await getDb().select().from(mailboxes).where(eq(mailboxes.orderId, order.id));
    expect(boxes.map((b) => b.address).sort()).toEqual(["alex@acme.com", "blake@acme.com", "casey@acme.com"]);
    expect(boxes.every((b) => b.status === "PENDING")).toBe(true);

    const events = await eventsFor(order.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ fromStatus: null, toStatus: "PENDING", actorType: "customer", actorId: alice.id });
  });

  it("replays the original order for the same key and payload, writing nothing new", async () => {
    const alice = await makeUser();
    const first = await createOrder(alice, input, "key-0002");
    const second = await createOrder(alice, input, "key-0002");

    expect(second.created).toBe(false);
    expect(second.order.id).toBe(first.order.id);
    expect(await getDb().$count(orders)).toBe(1);
    expect(await getDb().$count(mailboxes)).toBe(3);
    expect(await eventsFor(first.order.id)).toHaveLength(1);
  });

  it("creates exactly one order when 10 identical requests race", async () => {
    const alice = await makeUser();
    const results = await Promise.all(Array.from({ length: 10 }, () => createOrder(alice, input, "key-race")));

    expect(new Set(results.map((r) => r.order.id)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await getDb().$count(orders)).toBe(1);
    expect(await getDb().$count(mailboxes)).toBe(3);
  });

  it("rejects the same key with a different payload (422)", async () => {
    const alice = await makeUser();
    await createOrder(alice, input, "key-0003");
    await expect(createOrder(alice, { ...input, mailboxCount: 4 }, "key-0003")).rejects.toBeInstanceOf(
      IdempotencyKeyReusedError,
    );
    expect(await getDb().$count(orders)).toBe(1);
  });

  it("scopes keys per user: two customers may use the same key", async () => {
    const [alice, bob] = await Promise.all([makeUser(), makeUser()]);
    const a = await createOrder(alice, input, "shared-key");
    const b = await createOrder(bob, input, "shared-key");
    expect(a.order.id).not.toBe(b.order.id);
    expect(b.created).toBe(true);
  });

  it("does not let an admin place orders", async () => {
    const admin = await makeUser("admin");
    await expect(createOrder(admin, input, "key-0004")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
