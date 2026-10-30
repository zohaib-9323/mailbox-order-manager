"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

export function RetryButton({ orderId, size = "sm" }: { orderId: string; size?: "sm" | "md" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/orders/${orderId}/retry`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    router.refresh();
  }

  const pad = size === "md" ? "px-3.5 py-2 text-sm" : "px-2.5 py-1 text-xs";
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={retry}
        disabled={busy}
        className={`${pad} rounded-md border border-line-strong bg-surface font-medium text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-wait disabled:opacity-60`}
      >
        {busy ? "Retrying…" : "Retry"}
      </button>
      {error && (
        <span role="alert" className="max-w-56 text-right text-xs text-failed">
          {error}
        </span>
      )}
    </span>
  );
}
