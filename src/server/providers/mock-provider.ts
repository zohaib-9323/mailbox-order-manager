import { randomUUID } from "node:crypto";
import type { Provider } from "@/domain/order";
import {
  ProviderError,
  type CreateMailboxRequest,
  type CreateMailboxResult,
  type MailboxProvider,
} from "./types";

export interface MockProviderOptions {
  /** Probability (0..1) that a single createMailbox call fails. */
  failureRate: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  /** Injected for deterministic tests. Defaults to Math.random. */
  random?: () => number;
  /** Injected for fast tests. Defaults to a real setTimeout sleep. */
  sleep?: (ms: number) => Promise<void>;
}

/** Domains whose first label starts with this always fail: makes the demo deterministic. */
export const FORCED_FAILURE_PREFIX = "fail-";

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Shared behaviour of the fake vendors: latency, random failures, and
 * idempotency (same key returns the same mailbox instead of creating another).
 * Subclasses only supply vendor flavour: id format and error messages.
 */
export abstract class MockMailboxProvider implements MailboxProvider {
  abstract readonly id: Provider;
  abstract readonly displayName: string;

  private readonly created = new Map<string, CreateMailboxResult>();
  private readonly random: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: MockProviderOptions) {
    this.random = opts.random ?? Math.random;
    this.sleep = opts.sleep ?? realSleep;
  }

  protected abstract newExternalId(): string;
  protected abstract failureMessage(address: string): string;

  async createMailbox(req: CreateMailboxRequest): Promise<CreateMailboxResult> {
    const previous = this.created.get(req.idempotencyKey);
    if (previous) return previous;

    const { minLatencyMs, maxLatencyMs } = this.opts;
    await this.sleep(minLatencyMs + Math.floor(this.random() * Math.max(0, maxLatencyMs - minLatencyMs)));

    const domain = req.address.split("@")[1] ?? "";
    if (domain.startsWith(FORCED_FAILURE_PREFIX) || this.random() < this.opts.failureRate) {
      throw new ProviderError(this.id, this.failureMessage(req.address));
    }

    const result = { externalId: this.newExternalId() };
    this.created.set(req.idempotencyKey, result);
    return result;
  }
}

export class MockGoogleWorkspaceProvider extends MockMailboxProvider {
  readonly id = "google" as const;
  readonly displayName = "Google Workspace";

  protected newExternalId(): string {
    return `gws_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  }

  protected failureMessage(address: string): string {
    return `Google Admin SDK 503 backendError while creating ${address}`;
  }
}

export class MockMicrosoft365Provider extends MockMailboxProvider {
  readonly id = "microsoft" as const;
  readonly displayName = "Microsoft 365";

  protected newExternalId(): string {
    return `m365_${randomUUID()}`;
  }

  protected failureMessage(address: string): string {
    return `Microsoft Graph 429 TooManyRequests while creating ${address}`;
  }
}
