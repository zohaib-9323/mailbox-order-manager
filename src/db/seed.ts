import "dotenv/config";
import { count } from "drizzle-orm";
import type { Role } from "@/domain/order";
import type { SessionUser } from "@/domain/user";
import { hashPassword } from "@/server/auth/password";
import { createProviderRegistry } from "@/server/providers/registry";
import { createOrder } from "@/server/services/order-service";
import { ProvisioningService } from "@/server/services/provisioning-service";
import { closeDb, getDb } from "./client";
import { orders, users } from "./schema";

// Development-only credentials. Documented in the README.
export const SEED_USERS: { email: string; name: string; role: Role; password: string }[] = [
  { email: "admin@mailbox.test", name: "Ops Admin", role: "admin", password: "admin1234" },
  { email: "alice@acme.test", name: "Alice Romero", role: "customer", password: "customer1234" },
  { email: "bob@globex.test", name: "Bob Chen", role: "customer", password: "customer1234" },
];

async function seedUsers(): Promise<Record<string, SessionUser>> {
  const db = getDb();
  for (const u of SEED_USERS) {
    await db
      .insert(users)
      .values({ email: u.email, name: u.name, role: u.role, passwordHash: await hashPassword(u.password) })
      .onConflictDoNothing({ target: users.email });
  }
  const rows = await db.select({ id: users.id, email: users.email, name: users.name, role: users.role }).from(users);
  return Object.fromEntries(rows.map((r) => [r.email, r]));
}

/**
 * Demo orders go through the real service and worker code (instant, no random
 * failures) so their audit logs look exactly like production ones:
 *   - acme-outreach.com  → ACTIVE
 *   - fail-legacy.io     → FAILED (the mock always fails "fail-" domains), ready for an admin retry
 *   - globex-mail.com    → left PENDING for `npm run worker` to pick up
 */
async function seedOrders(byEmail: Record<string, SessionUser>) {
  const [{ n }] = await getDb().select({ n: count() }).from(orders);
  if (n > 0) {
    console.log(`Skipping demo orders: ${n} order(s) already exist.`);
    return;
  }
  const alice = byEmail["alice@acme.test"]!; // seeded just above
  const bob = byEmail["bob@globex.test"]!;
  const worker = new ProvisioningService({
    providers: createProviderRegistry({ failureRate: 0, minLatencyMs: 0, maxLatencyMs: 0 }),
    workerId: "seed",
    leaseMs: 60_000,
    mailboxConcurrency: 10,
  });

  await createOrder(alice, { domain: "acme-outreach.com", provider: "google", mailboxCount: 5 }, "seed-acme-1");
  await worker.runOnce();
  await createOrder(alice, { domain: "fail-legacy.io", provider: "microsoft", mailboxCount: 3 }, "seed-acme-2");
  await worker.runOnce();
  await createOrder(bob, { domain: "globex-mail.com", provider: "microsoft", mailboxCount: 8 }, "seed-globex-1");
  console.log("Seeded 3 demo orders (ACTIVE, FAILED, PENDING).");
}

async function main() {
  const byEmail = await seedUsers();
  console.log(`Seeded ${SEED_USERS.length} users.`);
  await seedOrders(byEmail);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(closeDb);
