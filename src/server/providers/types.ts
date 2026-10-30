import type { Provider } from "@/domain/order";

export interface CreateMailboxRequest {
  address: string;
  /**
   * Stable per mailbox (we pass the mailbox row id). A real provider would use it
   * to dedupe, so a retried call after a timeout cannot create a second mailbox.
   */
  idempotencyKey: string;
}

export interface CreateMailboxResult {
  externalId: string;
}

/** Strategy interface: the worker only ever talks to this, never to a vendor SDK. */
export interface MailboxProvider {
  readonly id: Provider;
  readonly displayName: string;
  createMailbox(req: CreateMailboxRequest): Promise<CreateMailboxResult>;
}

export type ProviderRegistry = Readonly<Record<Provider, MailboxProvider>>;

export class ProviderError extends Error {
  constructor(
    readonly provider: Provider,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
