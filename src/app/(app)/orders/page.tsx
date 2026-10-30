import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { OrdersTable } from "@/components/orders-table";
import { Pagination } from "@/components/pagination";
import { isInFlight } from "@/domain/order";
import { parseListQuery } from "@/lib/search-params";
import { requirePageUser } from "@/server/auth/session";
import { listOrders } from "@/server/services/order-service";

export const metadata: Metadata = { title: "My orders" };

export default async function MyOrdersPage(props: PageProps<"/orders">) {
  const user = await requirePageUser();
  if (user.role === "admin") redirect("/admin/orders");
  const query = parseListQuery(await props.searchParams);
  const result = await listOrders(user, { ...query, status: undefined, provider: undefined });

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">My orders</h1>
          <p className="mt-1 text-sm text-ink-muted">Each order provisions its mailboxes in the background. This page updates on its own.</p>
        </div>
        <Link
          href="/orders/new"
          className="shrink-0 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          New order
        </Link>
      </div>
      <AutoRefresh active={result.items.some((o) => isInFlight(o.status))} />
      {result.total === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
          <p className="font-medium">No orders yet</p>
          <p className="mt-1 text-sm text-ink-muted">Place your first order to get mailboxes on your domain.</p>
        </div>
      ) : (
        <>
          <OrdersTable items={result.items} admin={false} />
          <Pagination page={result.page} totalPages={result.totalPages} total={result.total} basePath="/orders" params={{}} />
        </>
      )}
    </>
  );
}
