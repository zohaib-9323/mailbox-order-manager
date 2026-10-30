import Link from "next/link";

/** Server-rendered pagination that keeps the current filters in the URL. */
export function Pagination({
  page,
  totalPages,
  total,
  basePath,
  params,
}: {
  page: number;
  totalPages: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const link = "rounded-md border border-line-strong bg-surface px-3 py-1.5 hover:border-accent hover:text-accent";
  const disabled = "rounded-md border border-line px-3 py-1.5 text-ink-faint";

  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
      <p className="text-ink-muted tabular-nums">
        {total} order{total === 1 ? "" : "s"} · page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={link}>
            Previous
          </Link>
        ) : (
          <span className={disabled}>Previous</span>
        )}
        {page < totalPages ? (
          <Link href={href(page + 1)} className={link}>
            Next
          </Link>
        ) : (
          <span className={disabled}>Next</span>
        )}
      </div>
    </nav>
  );
}
