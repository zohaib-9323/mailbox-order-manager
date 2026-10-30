import { getDb } from "@/db/client";
import type { OrderRow } from "@/db/schema";
import { ConcurrentModificationError } from "@/domain/errors";
import type { Actor } from "@/domain/order";
import { mapWithConcurrency } from "@/server/lib/concurrency";
import type { ProviderRegistry } from "@/server/providers/types";
import * as orderRepo from "@/server/repositories/order-repository";
import { transitionOrder } from "./order-transitions";

export interface ProvisioningDeps {
  providers: ProviderRegistry;
  workerId: string;
  leaseMs: number;
  mailboxConcurrency: number;
  log?: (msg: string) => void;
}

export interface ClaimedOrder {
  order: OrderRow;
  /** Fencing token for every write this worker makes for the order. */
  attempt: number;
}

export type ProvisionOutcome = "ACTIVE" | "FAILED" | "LOST_LEASE";

const SYSTEM: Actor = { type: "system", id: null };

/**
 * Queue + worker logic, with Postgres as the queue.
 *
 * Safety model (why one order is never processed twice):
 * 1. Claim:  SELECT ... FOR UPDATE SKIP LOCKED picks a PENDING row no other worker holds,
 *            and in the same transaction moves it to PROVISIONING with attempt+1 and a lease.
 * 2. Fence:  every later write (mailbox result, lease renewal, final status) is conditional on
 *            `status = PROVISIONING AND attempt = <claimed attempt>`. A worker that stalled
 *            past its lease, while the order was failed and retried, can no longer write.
 * 3. Reap:   a PROVISIONING order whose lease expired (its worker died) is moved to FAILED by
 *            `system`, so it surfaces in the admin list for a retry instead of hanging forever.
 */
export class ProvisioningService {
  private readonly actor: Actor;
  private readonly log: (msg: string) => void;

  constructor(private readonly deps: ProvisioningDeps) {
    this.actor = { type: "worker", id: deps.workerId };
    this.log = deps.log ?? (() => {});
  }

  async claimNext(): Promise<ClaimedOrder | null> {
    return getDb().transaction(async (tx) => {
      const pending = await orderRepo.lockNextPending(tx);
      if (!pending) return null;
      const attempt = pending.attempt + 1;
      const order = await transitionOrder(tx, {
        order: pending,
        to: "PROVISIONING",
        actor: this.actor,
        reason: `Claimed by ${this.deps.workerId} (attempt ${attempt})`,
        patch: { attempt, lockedBy: this.deps.workerId, leaseExpiresAt: orderRepo.leaseFromNow(this.deps.leaseMs) },
      });
      return { order, attempt };
    });
  }

  async provision({ order, attempt }: ClaimedOrder): Promise<ProvisionOutcome> {
    const db = getDb();
    const provider = this.deps.providers[order.provider];
    // Retry-friendly: mailboxes that are already ACTIVE from an earlier attempt are skipped.
    const todo = await orderRepo.listUnprovisionedMailboxes(db, order.id);
    let lostLease = false;

    await mapWithConcurrency(
      todo,
      this.deps.mailboxConcurrency,
      async (mailbox) => {
        let result: orderRepo.MailboxResult;
        try {
          const { externalId } = await provider.createMailbox({
            address: mailbox.address,
            idempotencyKey: mailbox.id,
          });
          result = { ok: true, externalId };
        } catch (err) {
          result = { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
        const recorded = await orderRepo.recordMailboxResult(db, {
          mailboxId: mailbox.id,
          orderId: order.id,
          attempt,
          result,
        });
        // Each finished call doubles as a heartbeat.
        const renewed = recorded && (await orderRepo.extendLease(db, order.id, attempt, this.deps.leaseMs));
        if (!renewed) lostLease = true;
      },
      () => lostLease,
    );

    if (lostLease) {
      this.log(`order ${order.id}: lost lease on attempt ${attempt}, abandoning without writing a result`);
      return "LOST_LEASE";
    }
    return this.finalize(order, attempt);
  }

  private async finalize(order: OrderRow, attempt: number): Promise<ProvisionOutcome> {
    const db = getDb();
    const counts = await orderRepo.mailboxStatusCounts(db, order.id);
    const ok = counts.FAILED === 0 && counts.PENDING === 0;
    const firstError = ok ? null : await orderRepo.firstMailboxError(db, order.id);
    const summary = ok
      ? `All ${counts.ACTIVE} mailbox(es) provisioned`
      : `${counts.FAILED} of ${order.mailboxCount} mailbox(es) failed` +
        (firstError ? `. First error: ${firstError.error}` : "");

    try {
      await db.transaction((tx) =>
        transitionOrder(tx, {
          order: { id: order.id, status: "PROVISIONING" },
          to: ok ? "ACTIVE" : "FAILED",
          actor: this.actor,
          reason: summary,
          expectedAttempt: attempt,
          patch: { lastError: ok ? null : summary },
        }),
      );
    } catch (err) {
      if (err instanceof ConcurrentModificationError) {
        this.log(`order ${order.id}: attempt ${attempt} was superseded before finalizing`);
        return "LOST_LEASE";
      }
      throw err;
    }
    return ok ? "ACTIVE" : "FAILED";
  }

  /** Fails PROVISIONING orders whose worker stopped renewing its lease. Returns how many. */
  async reapExpiredLeases(): Promise<number> {
    return getDb().transaction(async (tx) => {
      const stale = await orderRepo.lockExpiredLeases(tx);
      for (const order of stale) {
        await transitionOrder(tx, {
          order,
          to: "FAILED",
          actor: SYSTEM,
          reason: `Worker ${order.lockedBy ?? "unknown"} stopped responding (lease expired on attempt ${order.attempt})`,
          expectedAttempt: order.attempt,
          patch: { lastError: "Provisioning was interrupted. Retry to resume from where it stopped." },
        });
      }
      return stale.length;
    });
  }

  /** One worker tick. Returns true if it did any work (so the loop can skip sleeping). */
  async runOnce(): Promise<boolean> {
    const reaped = await this.reapExpiredLeases();
    if (reaped) this.log(`reaped ${reaped} order(s) with an expired lease`);
    const claimed = await this.claimNext();
    if (!claimed) return reaped > 0;
    this.log(`order ${claimed.order.id}: claimed (attempt ${claimed.attempt}, ${claimed.order.provider})`);
    const outcome = await this.provision(claimed);
    this.log(`order ${claimed.order.id}: ${outcome}`);
    return true;
  }
}
