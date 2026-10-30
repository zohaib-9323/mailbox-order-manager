import Link from "next/link";
import { formatDateTime, PROVIDER_LABEL, shortId } from "@/lib/format";
import type { OrderList } from "@/server/services/order-service";
import { RetryButton } from "./retry-button";
import { StatusBadge } from "./status-badge";

export function OrdersTable({ items, admin }: { items: OrderList["items"]; admin: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs font-medium text-ink-muted">
            <th className="px-4 py-2.5 font-medium">Order</th>
            <th className="px-4 py-2.5 font-medium">Domain</th>
            <th className="px-4 py-2.5 font-medium">Provider</th>
            <th className="px-4 py-2.5 text-right font-medium">Mailboxes</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            {admin && <th className="px-4 py-2.5 font-medium">Customer</th>}
            <th className="px-4 py-2.5 font-medium">Placed</th>
            {admin && <th className="px-4 py-2.5" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((o) => (
            <tr key={o.id} className="align-middle hover:bg-paper/60">
              <td className="px-4 py-3">
                <Link href={`/orders/${o.id}`} className="font-mono text-xs text-accent hover:underline">
                  {shortId(o.id)}
                </Link>
              </td>
              <td className="px-4 py-3 font-medium">{o.domain}</td>
              <td className="px-4 py-3 text-ink-muted">{PROVIDER_LABEL[o.provider]}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                <span className={o.activeMailboxes === o.mailboxCount ? "" : "text-ink-muted"}>
                  {o.activeMailboxes}
                </span>
                <span className="text-ink-faint"> / {o.mailboxCount}</span>
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={o.status} />
              </td>
              {admin && <td className="px-4 py-3 text-ink-muted">{o.ownerEmail}</td>}
              <td className="px-4 py-3 whitespace-nowrap text-ink-muted tabular-nums">{formatDateTime(o.createdAt)}</td>
              {admin && (
                <td className="px-4 py-3 text-right">{o.status === "FAILED" && <RetryButton orderId={o.id} />}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
