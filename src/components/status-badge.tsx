import type { MailboxStatus, OrderStatus } from "@/domain/order";

const STYLES: Record<OrderStatus | MailboxStatus, string> = {
  PENDING: "bg-pending-soft text-pending",
  PROVISIONING: "bg-provisioning-soft text-provisioning",
  ACTIVE: "bg-active-soft text-active",
  FAILED: "bg-failed-soft text-failed",
};

const LABELS: Record<OrderStatus | MailboxStatus, string> = {
  PENDING: "Pending",
  PROVISIONING: "Provisioning",
  ACTIVE: "Active",
  FAILED: "Failed",
};

export function StatusBadge({ status }: { status: OrderStatus | MailboxStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full bg-current ${status === "PROVISIONING" ? "animate-pulse" : ""}`}
      />
      {LABELS[status]}
    </span>
  );
}
