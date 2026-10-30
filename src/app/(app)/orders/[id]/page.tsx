import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { RetryButton } from "@/components/retry-button";
import { StatusBadge } from "@/components/status-badge";
import { NotFoundError } from "@/domain/errors";
import { isInFlight, type ActorType } from "@/domain/order";
import type { SessionUser } from "@/domain/user";
import { formatDateTime, PROVIDER_LABEL, shortId } from "@/lib/format";
import { requirePageUser } from "@/server/auth/session";
import { getOrderDetail, type OrderDetail } from "@/server/services/order-service";
import { orderIdSchema } from "@/server/validation/order-schemas";

export const metadata: Metadata = { title: "Order" };

const ACTOR_LABEL: Record<ActorType, string> = {
  customer: "Customer",
  admin: "Admin",
  worker: "Worker",
  system: "System",
};

async function load(user: SessionUser, id: string): Promise<OrderDetail> {
  if (!orderIdSchema.safeParse(id).success) notFound();
  try {
    return await getOrderDetail(user, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}

export default async function OrderPage(props: PageProps<"/orders/[id]">) {
  const { id } = await props.params;
  const user = await requirePageUser();
  const { order, ownerEmail, mailboxes, events } = await load(user, id);
  const active = mailboxes.filter((m) => m.status === "ACTIVE").length;
  const failed = mailboxes.filter((m) => m.status === "FAILED").length;
  const backHref = user.role === "admin" ? "/admin/orders" : "/orders";

  return (
    <>
      <AutoRefresh active={isInFlight(order.status)} />
      <Link href={backHref} className="text-sm text-ink-muted hover:text-ink">
        ← {user.role === "admin" ? "All orders" : "My orders"}
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">{order.domain}</h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-1 font-mono text-xs text-ink-faint">order {order.id}</p>
        </div>
        {user.role === "admin" && order.status === "FAILED" && <RetryButton orderId={order.id} size="md" />}
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
        <Fact label="Provider" value={PROVIDER_LABEL[order.provider]} />
        <Fact label="Mailboxes" value={`${active} of ${order.mailboxCount} active`} />
        <Fact label="Attempts" value={String(order.attempt)} />
        <Fact label={user.role === "admin" ? "Customer" : "Placed"} value={user.role === "admin" ? ownerEmail : formatDateTime(order.createdAt)} />
      </dl>

      {order.status === "FAILED" && order.lastError && (
        <div role="status" className="mt-4 rounded-lg border border-failed/25 bg-failed-soft px-4 py-3 text-sm text-failed">
          <p className="font-medium">Provisioning failed</p>
          <p className="mt-0.5">{order.lastError}</p>
          {user.role === "customer" && (
            <p className="mt-1 text-failed/80">An admin can retry this order. Mailboxes that already worked are kept.</p>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <h2 className="text-sm font-semibold">
            Mailboxes
            {failed > 0 && <span className="ml-2 font-normal text-failed">{failed} failed</span>}
          </h2>
          <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th className="px-4 py-2 font-medium">Address</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {mailboxes.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5 font-mono text-xs">{m.address}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-muted">
                      {m.status === "FAILED" ? (
                        <span className="text-failed">{m.error}</span>
                      ) : m.externalId ? (
                        <span className="font-mono">{m.externalId}</span>
                      ) : (
                        "Waiting for worker"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold">Audit log</h2>
          <ol className="mt-3 space-y-0 rounded-lg border border-line bg-surface">
            {events.map((e) => (
              <li key={e.id} className="border-b border-line px-4 py-3 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {e.fromStatus ? <StatusBadge status={e.fromStatus} /> : <span className="text-ink-faint">created</span>}
                  <span aria-hidden className="text-ink-faint">→</span>
                  <StatusBadge status={e.toStatus} />
                </div>
                {e.reason && <p className="mt-1.5 text-sm">{e.reason}</p>}
                <p className="mt-1 text-xs text-ink-muted">
                  {ACTOR_LABEL[e.actorType]}
                  {e.actorType === "worker" && e.actorId ? ` ${e.actorId}` : ""}
                  {(e.actorType === "customer" || e.actorType === "admin") && e.actorId
                    ? ` ${shortId(e.actorId)}`
                    : ""}
                  {" · "}
                  <span className="tabular-nums">{formatDateTime(e.createdAt)}</span>
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium" title={value}>
        {value}
      </dd>
    </div>
  );
}
