import { sql } from "drizzle-orm";
import {
  bigserial,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { ACTOR_TYPES, MAILBOX_STATUSES, ORDER_STATUSES, PROVIDERS, ROLES } from "@/domain/order";

export const roleEnum = pgEnum("role", ROLES);
export const providerEnum = pgEnum("provider", PROVIDERS);
export const orderStatusEnum = pgEnum("order_status", ORDER_STATUSES);
export const mailboxStatusEnum = pgEnum("mailbox_status", MAILBOX_STATUSES);
export const actorTypeEnum = pgEnum("actor_type", ACTOR_TYPES);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 of the cookie token: a leaked DB row cannot be replayed as a cookie. */
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    domain: text("domain").notNull(),
    provider: providerEnum("provider").notNull(),
    mailboxCount: integer("mailbox_count").notNull(),
    status: orderStatusEnum("status").notNull().default("PENDING"),

    // Idempotent creation: one order per (user, key). requestHash detects a key
    // being reused with a different payload.
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),

    // Worker lease + fencing token. `attempt` increments on every claim; a worker
    // may only write results while the row still carries the attempt it claimed.
    attempt: integer("attempt").notNull().default(0),
    lockedBy: text("locked_by"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),

    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("orders_user_idempotency_key_uq").on(t.userId, t.idempotencyKey),
    index("orders_user_created_idx").on(t.userId, t.createdAt),
    index("orders_status_created_idx").on(t.status, t.createdAt),
    index("orders_provider_created_idx").on(t.provider, t.createdAt),
    check("orders_mailbox_count_range", sql`${t.mailboxCount} BETWEEN 1 AND 50`),
  ],
);

export const mailboxes = pgTable(
  "mailboxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    status: mailboxStatusEnum("status").notNull().default("PENDING"),
    /** Id returned by the provider once the mailbox exists there. */
    externalId: text("external_id"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("mailboxes_order_address_uq").on(t.orderId, t.address)],
);

/** Append-only audit log: one row per order status change (plus creation). */
export const orderEvents = pgTable(
  "order_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status").notNull(),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: text("actor_id"),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.id)],
);

export type UserRow = typeof users.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type MailboxRow = typeof mailboxes.$inferSelect;
export type OrderEventRow = typeof orderEvents.$inferSelect;
