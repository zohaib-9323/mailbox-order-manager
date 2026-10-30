import { describe, expect, it } from "vitest";
import { MockGoogleWorkspaceProvider, MockMicrosoft365Provider } from "@/server/providers/mock-provider";
import { ProviderError } from "@/server/providers/types";

const noSleep = async () => {};
/** Returns the given numbers in order, then repeats the last one. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] as number;
};

describe("mock providers (Strategy implementations)", () => {
  it("succeeds when the roll is above the failure rate", async () => {
    const p = new MockGoogleWorkspaceProvider({ failureRate: 0.2, minLatencyMs: 0, maxLatencyMs: 0, random: sequence(0, 0.5), sleep: noSleep });
    const res = await p.createMailbox({ address: "alex@acme.com", idempotencyKey: "k1" });
    expect(res.externalId).toMatch(/^gws_[0-9a-f]{16}$/);
  });

  it("fails with a vendor-flavoured ProviderError when the roll is below the failure rate", async () => {
    const p = new MockMicrosoft365Provider({ failureRate: 0.2, minLatencyMs: 0, maxLatencyMs: 0, random: sequence(0, 0.1), sleep: noSleep });
    const err = await p.createMailbox({ address: "alex@acme.com", idempotencyKey: "k1" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).message).toContain("Microsoft Graph");
  });

  it("always fails domains starting with fail- (deterministic demo)", async () => {
    const p = new MockGoogleWorkspaceProvider({ failureRate: 0, minLatencyMs: 0, maxLatencyMs: 0, sleep: noSleep });
    await expect(p.createMailbox({ address: "alex@fail-demo.com", idempotencyKey: "k1" })).rejects.toBeInstanceOf(ProviderError);
  });

  it("is idempotent per key: a repeated call returns the same mailbox", async () => {
    const p = new MockGoogleWorkspaceProvider({ failureRate: 0, minLatencyMs: 0, maxLatencyMs: 0, sleep: noSleep });
    const a = await p.createMailbox({ address: "alex@acme.com", idempotencyKey: "same" });
    const b = await p.createMailbox({ address: "alex@acme.com", idempotencyKey: "same" });
    expect(b).toEqual(a);
  });

  it("waits between min and max latency", async () => {
    const waits: number[] = [];
    const p = new MockGoogleWorkspaceProvider({
      failureRate: 0,
      minLatencyMs: 1000,
      maxLatencyMs: 3000,
      random: sequence(0.5),
      sleep: async (ms) => void waits.push(ms),
    });
    await p.createMailbox({ address: "alex@acme.com", idempotencyKey: "k" });
    expect(waits).toEqual([2000]);
  });
});
