import { z } from "zod";
import { MAX_MAILBOXES, MIN_MAILBOXES, ORDER_STATUSES, PROVIDERS } from "@/domain/order";

// RFC 1035-ish: labels of letters/digits/hyphens, no leading/trailing hyphen, a TLD of letters.
const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export const createOrderSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(DOMAIN_RE, "Enter a domain like acme.com (no http://, no paths)."),
  provider: z.enum(PROVIDERS, { error: "Provider must be google or microsoft." }),
  mailboxCount: z.coerce
    .number({ error: "Mailbox count must be a number." })
    .int("Mailbox count must be a whole number.")
    .min(MIN_MAILBOXES, `At least ${MIN_MAILBOXES} mailbox.`)
    .max(MAX_MAILBOXES, `At most ${MAX_MAILBOXES} mailboxes per order.`),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/** Client-generated key, one per create-form instance. UUIDs fit comfortably. */
export const idempotencyKeySchema = z
  .string({ error: "Idempotency-Key header is required." })
  .trim()
  .min(8, "Idempotency-Key must be 8-128 characters.")
  .max(128, "Idempotency-Key must be 8-128 characters.")
  .regex(/^[A-Za-z0-9_\-:.]+$/, "Idempotency-Key may only contain letters, digits and - _ : .");

const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

export const listOrdersQuerySchema = z.object({
  status: z.preprocess(emptyToUndefined, z.enum(ORDER_STATUSES).optional()),
  provider: z.preprocess(emptyToUndefined, z.enum(PROVIDERS).optional()),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1)),
  pageSize: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).default(20)),
});
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

export const orderIdSchema = z.uuid("Order id must be a UUID.");
