export const ORDER_STATUSES = ["PENDING", "PROVISIONING", "ACTIVE", "FAILED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PROVIDERS = ["google", "microsoft"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const MAILBOX_STATUSES = ["PENDING", "ACTIVE", "FAILED"] as const;
export type MailboxStatus = (typeof MAILBOX_STATUSES)[number];

export const ROLES = ["customer", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Who caused a state change. Stored on every audit log entry. */
export const ACTOR_TYPES = ["customer", "admin", "worker", "system"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export interface Actor {
  type: ActorType;
  /** User id for customer/admin, worker id for worker, null for system. */
  id: string | null;
}

export const MIN_MAILBOXES = 1;
export const MAX_MAILBOXES = 50;

/** Statuses the worker has not finished with yet; the UI polls while in these. */
export function isInFlight(status: OrderStatus): boolean {
  return status === "PENDING" || status === "PROVISIONING";
}
