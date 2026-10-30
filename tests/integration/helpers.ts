import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { orderEvents, users } from "@/db/schema";
import type { Role } from "@/domain/order";
import type { SessionUser } from "@/domain/user";
import { ProviderError, type MailboxProvider, type ProviderRegistry } from "@/server/providers/types";
import { ProvisioningService } from "@/server/services/provisioning-service";

export async function resetDb() {
  await getDb().execute(sql`truncate table order_events, mailboxes, orders, sessions, users restart identity cascade`);
}

export async function makeUser(role: Role = "customer"): Promise<SessionUser> {
  const email = `${role}-${randomUUID()}@test.local`;
  const [u] = await getDb()
    .insert(users)
    .values({ email, name: `Test ${role}`, role, passwordHash: "not-used" })
    .returning({ id: users.id, email: users.email, name: users.name, role: users.role });
  return u!; // insert ... returning always yields the row
}

/** Instant, deterministic provider. Fails any address in `failing` (mutable between runs). */
export class FakeProvider implements MailboxProvider {
  readonly displayName = "Fake";
  readonly calls: string[] = [];
  constructor(
    readonly id: "google" | "microsoft",
    readonly failing = new Set<string>(),
  ) {}
  async createMailbox(req: { address: string; idempotencyKey: string }) {
    this.calls.push(req.address);
    await new Promise((r) => setImmediate(r)); // yield, so concurrent workers interleave
    if (this.failing.has(req.address)) throw new ProviderError(this.id, `boom: ${req.address}`);
    return { externalId: `ext-${req.address}` };
  }
}

export function fakeRegistry(failing = new Set<string>()): ProviderRegistry & {
  google: FakeProvider;
  microsoft: FakeProvider;
} {
  return { google: new FakeProvider("google", failing), microsoft: new FakeProvider("microsoft", failing) };
}

export function makeWorker(providers: ProviderRegistry, workerId = "w1", leaseMs = 60_000) {
  return new ProvisioningService({ providers, workerId, leaseMs, mailboxConcurrency: 3 });
}

export async function eventsFor(orderId: string) {
  return getDb().select().from(orderEvents).where(eq(orderEvents.orderId, orderId)).orderBy(orderEvents.id);
}
