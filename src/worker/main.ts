import "dotenv/config";
import { hostname } from "node:os";
import { randomBytes } from "node:crypto";
import { env } from "@/config/env";
import { closeDb } from "@/db/client";
import { createProviderRegistry } from "@/server/providers/registry";
import { ProvisioningService } from "@/server/services/provisioning-service";

/**
 * Long-running provisioning worker: `npm run worker`. Start several to scale out;
 * the claim query guarantees they never pick the same order.
 */
const config = env();
const workerId = `worker-${hostname()}-${process.pid}-${randomBytes(2).toString("hex")}`;
const log = (msg: string) => console.log(`${new Date().toISOString()} [${workerId}] ${msg}`);

const service = new ProvisioningService({
  providers: createProviderRegistry(),
  workerId,
  leaseMs: config.WORKER_LEASE_MS,
  mailboxConcurrency: config.WORKER_MAILBOX_CONCURRENCY,
  log,
});

let stopping = false;
let wake: (() => void) | undefined;

function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log(`${signal} received: finishing the current order, then exiting`);
  wake?.();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const idle = (ms: number) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    wake = () => {
      clearTimeout(t);
      resolve();
    };
  });

async function main() {
  log(
    `started (poll ${config.WORKER_POLL_INTERVAL_MS}ms, lease ${config.WORKER_LEASE_MS}ms, ` +
      `failure rate ${config.PROVIDER_FAILURE_RATE})`,
  );
  while (!stopping) {
    try {
      const didWork = await service.runOnce();
      if (!didWork) await idle(config.WORKER_POLL_INTERVAL_MS);
    } catch (err) {
      // A crash mid-order leaves it PROVISIONING; its lease expires and the reaper fails it.
      log(`tick failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
      await idle(config.WORKER_POLL_INTERVAL_MS);
    }
  }
  await closeDb();
  log("stopped");
}

void main();
