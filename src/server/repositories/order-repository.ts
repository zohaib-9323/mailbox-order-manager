import { and, asc, count, desc, eq, lt, ne, sql, type SQL } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { mailboxes, orderEvents, orders, users, type OrderRow } from "@/db/schema";
import type { Actor, OrderStatus, Provider } from "@/domain/order";

/**
 * Data access for orders, mailboxes and the audit log. SQL only: decisions about
 * *whether* something may happen live in the services.
 */

export async function findByIdempotencyKey(db: DbExecutor, userId: string, key: string) {
  const [row] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.idempotencyKey, key)));
  return row ?? null;
}

export interface NewOrder {
  userId: string;
  domain: string;
  provider: Provider;
  mailboxCount: number;
  idempotencyKey: string;
  requestHash: string;
}

/**
 * INSERT ... ON CONFLICT DO NOTHING on (user_id, idempotency_key).
 * Returns null when a request with this key already created the order.
 * Postgres makes a concurrent inserter wait for the first transaction to
 * commit, so two racing requests can never both get a row back.
 */
export async function insertOrderIfAbsent(db: DbExecutor, data: NewOrder): Promise<OrderRow | null> {
  const [row] = await db
    .insert(orders)
    .values({ ...data, status: "PENDING" })
    .onConflictDoNothing({ target: [orders.userId, orders.idempotencyKey] })
    .returning();
  return row ?? null;
}

export async function insertMailboxes(db: DbExecutor, orderId: string, addresses: string[]) {
  await db.insert(mailboxes).values(addresses.map((address) => ({ orderId, address })));
}

export async function insertEvent(
  db: DbExecutor,
  e: { orderId: string; from: OrderStatus | null; to: OrderStatus; actor: Actor; reason?: string | null },
) {
  await db.insert(orderEvents).values({
    orderId: e.orderId,
    fromStatus: e.from,
    toStatus: e.to,
    actorType: e.actor.type,
    actorId: e.actor.id,
    reason: e.reason ?? null,
  });
}

export type OrderPatch = Partial<Pick<OrderRow, "attempt" | "lockedBy" | "lastError">> & {
  leaseExpiresAt?: Date | SQL | null;
};

/**
 * Compare-and-set on status (and optionally on the fencing attempt). Returns the
 * updated row, or null if the order was no longer in `from` / at `expectedAttempt`.
 */
export async function updateStatusIf(
  db: DbExecutor,
  args: { orderId: string; from: OrderStatus; to: OrderStatus; expectedAttempt?: number; patch?: OrderPatch },
): Promise<OrderRow | null> {
  const conditions = [eq(orders.id, args.orderId), eq(orders.status, args.from)];
  if (args.expectedAttempt !== undefined) conditions.push(eq(orders.attempt, args.expectedAttempt));
  const [row] = await db
    .update(orders)
    .set({ ...args.patch, status: args.to, updatedAt: sql`now()` })
    .where(and(...conditions))
    .returning();
  return row ?? null;
}

/** Row-locks the oldest PENDING order, skipping rows another worker already holds. */
export async function lockNextPending(db: DbExecutor): Promise<OrderRow | null> {
  const [row] = await db
    .select()
    .from(orders)
    .where(eq(orders.status, "PENDING"))
    .orderBy(asc(orders.createdAt))
    .limit(1)
    .for("update", { skipLocked: true });
  return row ?? null;
}

/** Row-locks PROVISIONING orders whose worker lease ran out (the worker died). */
export async function lockExpiredLeases(db: DbExecutor, limit = 10): Promise<OrderRow[]> {
  return db
    .select()
    .from(orders)
    .where(and(eq(orders.status, "PROVISIONING"), lt(orders.leaseExpiresAt, sql`now()`)))
    .orderBy(asc(orders.leaseExpiresAt))
    .limit(limit)
    .for("update", { skipLocked: true });
}

export async function lockById(db: DbExecutor, orderId: string): Promise<OrderRow | null> {
  const [row] = await db.select().from(orders).where(eq(orders.id, orderId)).for("update");
  return row ?? null;
}

/** Lease deadline computed on the database clock, so worker clock skew does not matter. */
export function leaseFromNow(leaseMs: number): SQL {
  return sql`now() + (${leaseMs} * interval '1 millisecond')`;
}

/** Pushes the lease forward. Fenced: returns false if this attempt no longer owns the order. */
export async function extendLease(db: DbExecutor, orderId: string, attempt: number, leaseMs: number) {
  const rows = await db
    .update(orders)
    .set({ leaseExpiresAt: leaseFromNow(leaseMs) })
    .where(and(eq(orders.id, orderId), eq(orders.status, "PROVISIONING"), eq(orders.attempt, attempt)))
    .returning({ id: orders.id });
  return rows.length === 1;
}

export async function findById(db: DbExecutor, orderId: string): Promise<OrderRow | null> {
  const [row] = await db.select().from(orders).where(eq(orders.id, orderId));
  return row ?? null;
}

export async function findDetail(db: DbExecutor, orderId: string) {
  const [row] = await db
    .select({ order: orders, ownerEmail: users.email, ownerName: users.name })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(eq(orders.id, orderId));
  if (!row) return null;
  const [mailboxRows, eventRows] = await Promise.all([
    db.select().from(mailboxes).where(eq(mailboxes.orderId, orderId)).orderBy(asc(mailboxes.address)),
    db.select().from(orderEvents).where(eq(orderEvents.orderId, orderId)).orderBy(asc(orderEvents.id)),
  ]);
  return { ...row, mailboxes: mailboxRows, events: eventRows };
}

export interface ListFilter {
  userId?: string;
  status?: OrderStatus;
  provider?: Provider;
  page: number;
  pageSize: number;
}

export async function list(db: DbExecutor, f: ListFilter) {
  const conditions: SQL[] = [];
  if (f.userId) conditions.push(eq(orders.userId, f.userId));
  if (f.status) conditions.push(eq(orders.status, f.status));
  if (f.provider) conditions.push(eq(orders.provider, f.provider));
  const where = conditions.length ? and(...conditions) : undefined;

  const [items, [totals]] = await Promise.all([
    db
      .select({
        id: orders.id,
        domain: orders.domain,
        provider: orders.provider,
        mailboxCount: orders.mailboxCount,
        status: orders.status,
        attempt: orders.attempt,
        lastError: orders.lastError,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
        ownerEmail: users.email,
        activeMailboxes: sql<number>`(select count(*)::int from ${mailboxes} where ${mailboxes.orderId} = ${orders.id} and ${mailboxes.status} = 'ACTIVE')`,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .where(where)
      // id as a tie-breaker keeps pages stable when timestamps collide.
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize),
    db.select({ total: count() }).from(orders).where(where),
  ]);
  return { items, total: totals?.total ?? 0 };
}

// ---- mailboxes ----

export async function listUnprovisionedMailboxes(db: DbExecutor, orderId: string) {
  return db
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.orderId, orderId), ne(mailboxes.status, "ACTIVE")))
    .orderBy(asc(mailboxes.address));
}

export type MailboxResult = { ok: true; externalId: string } | { ok: false; error: string };

/**
 * Records one provider call result. Fenced on the order's attempt: if a newer
 * attempt has taken over, the stale worker's write is dropped (returns false).
 */
export async function recordMailboxResult(
  db: DbExecutor,
  args: { mailboxId: string; orderId: string; attempt: number; result: MailboxResult },
) {
  const { result } = args;
  const rows = await db
    .update(mailboxes)
    .set({
      status: result.ok ? "ACTIVE" : "FAILED",
      externalId: result.ok ? result.externalId : null,
      error: result.ok ? null : result.error,
      attempts: sql`${mailboxes.attempts} + 1`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(mailboxes.id, args.mailboxId),
        sql`exists (select 1 from ${orders} where ${orders.id} = ${args.orderId} and ${orders.status} = 'PROVISIONING' and ${orders.attempt} = ${args.attempt})`,
      ),
    )
    .returning({ id: mailboxes.id });
  return rows.length === 1;
}

export async function mailboxStatusCounts(db: DbExecutor, orderId: string) {
  const rows = await db
    .select({ status: mailboxes.status, n: count() })
    .from(mailboxes)
    .where(eq(mailboxes.orderId, orderId))
    .groupBy(mailboxes.status);
  const counts = { PENDING: 0, ACTIVE: 0, FAILED: 0 };
  for (const r of rows) counts[r.status] = r.n;
  return counts;
}

export async function firstMailboxError(db: DbExecutor, orderId: string) {
  const [row] = await db
    .select({ address: mailboxes.address, error: mailboxes.error })
    .from(mailboxes)
    .where(and(eq(mailboxes.orderId, orderId), eq(mailboxes.status, "FAILED")))
    .orderBy(asc(mailboxes.address))
    .limit(1);
  return row ?? null;
}

export async function resetFailedMailboxes(db: DbExecutor, orderId: string) {
  await db
    .update(mailboxes)
    .set({ status: "PENDING", error: null, updatedAt: sql`now()` })
    .where(and(eq(mailboxes.orderId, orderId), eq(mailboxes.status, "FAILED")));
}
