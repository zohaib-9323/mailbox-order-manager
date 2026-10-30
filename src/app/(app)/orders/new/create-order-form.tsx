"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MAX_MAILBOXES, MIN_MAILBOXES, PROVIDERS, type Provider } from "@/domain/order";
import { apiFetch } from "@/lib/api-client";
import { PROVIDER_LABEL } from "@/lib/format";

const PROVIDER_NOTE: Record<Provider, string> = {
  google: "Gmail-hosted mailboxes, created through the Admin SDK.",
  microsoft: "Exchange Online mailboxes, created through Microsoft Graph.",
};

const field =
  "mt-1 block w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-accent aria-[invalid=true]:border-failed";

export function CreateOrderForm() {
  const router = useRouter();
  // One key per form instance. A double click or a resend after a network error
  // reuses it, so the server returns the same order instead of creating a second one.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [provider, setProvider] = useState<Provider>("google");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setFormError(null);
    setFieldErrors({});

    const res = await apiFetch<{ order: { id: string } }>("/api/orders", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ domain: form.get("domain"), provider, mailboxCount: form.get("mailboxCount") }),
    });
    if (res.ok) {
      router.push(`/orders/${res.data.order.id}`);
      return;
    }
    setBusy(false);
    setFieldErrors(res.error.details?.fields ?? {});
    if (!res.error.details?.fields) setFormError(res.error.message);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 space-y-6 rounded-lg border border-line bg-surface p-5">
      <label className="block text-sm font-medium">
        Domain
        <input
          name="domain"
          placeholder="acme.com"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(fieldErrors.domain)}
          className={`${field} font-mono`}
        />
        {fieldErrors.domain && <span className="mt-1 block text-xs text-failed">{fieldErrors.domain}</span>}
      </label>

      <fieldset>
        <legend className="text-sm font-medium">Provider</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {PROVIDERS.map((p) => (
            <label
              key={p}
              className={`cursor-pointer rounded-md border px-3 py-2.5 transition-colors ${
                provider === p ? "border-accent bg-accent-soft" : "border-line-strong hover:border-ink-faint"
              }`}
            >
              <input
                type="radio"
                name="provider"
                value={p}
                checked={provider === p}
                onChange={() => setProvider(p)}
                className="sr-only"
              />
              <span className="block text-sm font-medium">{PROVIDER_LABEL[p]}</span>
              <span className="mt-0.5 block text-xs text-ink-muted">{PROVIDER_NOTE[p]}</span>
            </label>
          ))}
        </div>
        {fieldErrors.provider && <span className="mt-1 block text-xs text-failed">{fieldErrors.provider}</span>}
      </fieldset>

      <label className="block text-sm font-medium">
        Number of mailboxes
        <input
          name="mailboxCount"
          type="number"
          inputMode="numeric"
          min={MIN_MAILBOXES}
          max={MAX_MAILBOXES}
          defaultValue={5}
          aria-invalid={Boolean(fieldErrors.mailboxCount)}
          className={`${field} w-32 tabular-nums`}
        />
        <span className="mt-1 block text-xs font-normal text-ink-muted">
          {MIN_MAILBOXES} to {MAX_MAILBOXES} per order.
        </span>
        {fieldErrors.mailboxCount && <span className="mt-1 block text-xs text-failed">{fieldErrors.mailboxCount}</span>}
      </label>

      {formError && (
        <p role="alert" className="rounded-md bg-failed-soft px-3 py-2 text-sm text-failed">
          {formError}
        </p>
      )}

      <div className="flex items-center gap-4 border-t border-line pt-5">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {busy ? "Placing order…" : "Place order"}
        </button>
        <span className="text-xs text-ink-faint">Provisioning starts as soon as a worker is free.</span>
      </div>
    </form>
  );
}
