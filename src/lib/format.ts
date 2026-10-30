import type { Provider } from "@/domain/order";

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

/** Fixed locale + UTC so server-rendered times never mismatch on the client. */
export function formatDateTime(d: Date | string): string {
  return `${dateTime.format(new Date(d))} UTC`;
}

export const PROVIDER_LABEL: Record<Provider, string> = {
  google: "Google Workspace",
  microsoft: "Microsoft 365",
};

export function shortId(id: string): string {
  return id.slice(0, 8);
}
