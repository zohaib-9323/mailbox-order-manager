import Link from "next/link";
import { ORDER_STATUSES, PROVIDERS, type OrderStatus, type Provider } from "@/domain/order";
import { PROVIDER_LABEL } from "@/lib/format";

const select =
  "rounded-md border border-line-strong bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent";

/** A plain GET form: filters live in the URL, so they are shareable and work without JS. */
export function OrderFilters({ status, provider }: { status?: OrderStatus; provider?: Provider }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
        Status
        <select name="status" defaultValue={status ?? ""} className={select}>
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-ink-muted">
        Provider
        <select name="provider" defaultValue={provider ?? ""} className={select}>
          <option value="">All providers</option>
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABEL[p]}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="rounded-md bg-ink px-3.5 py-1.5 text-sm font-medium text-white hover:bg-ink/85">
        Apply
      </button>
      {(status || provider) && (
        <Link href="?" className="py-1.5 text-sm text-ink-muted hover:text-ink">
          Clear
        </Link>
      )}
    </form>
  );
}
