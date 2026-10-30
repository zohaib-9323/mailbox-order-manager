import type { Metadata } from "next";
import { AutoRefresh } from "@/components/auto-refresh";
import { OrderFilters } from "@/components/order-filters";
import { OrdersTable } from "@/components/orders-table";
import { Pagination } from "@/components/pagination";
import { isInFlight } from "@/domain/order";
import { parseListQuery } from "@/lib/search-params";
import { requirePageAdmin } from "@/server/auth/session";
import { listOrders } from "@/server/services/order-service";

export const metadata: Metadata = { title: "All orders" };

export default async function AdminOrdersPage(props: PageProps<"/admin/orders">) {
  const user = await requirePageAdmin();
  const query = parseListQuery(await props.searchParams);
  const result = await listOrders(user, query);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">All orders</h1>
          <p className="mt-1 text-sm text-ink-muted">Failed orders can be retried. Mailboxes that already succeeded are kept.</p>
        </div>
        <OrderFilters status={query.status} provider={query.provider} />
      </div>
      <AutoRefresh active={result.items.some((o) => isInFlight(o.status))} />
      {result.total === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-surface px-6 py-12 text-center text-sm text-ink-muted">
          No orders match these filters.
        </div>
      ) : (
        <>
          <OrdersTable items={result.items} admin />
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            total={result.total}
            basePath="/admin/orders"
            params={{ status: query.status, provider: query.provider }}
          />
        </>
      )}
    </>
  );
}
