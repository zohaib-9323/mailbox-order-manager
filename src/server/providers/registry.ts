import { env } from "@/config/env";
import {
  MockGoogleWorkspaceProvider,
  MockMicrosoft365Provider,
  type MockProviderOptions,
} from "./mock-provider";
import type { ProviderRegistry } from "./types";

/**
 * Builds the provider-name → strategy map. Swapping a mock for a real vendor
 * client is a one-line change here; nothing else in the app knows which is which.
 */
export function createProviderRegistry(overrides: Partial<MockProviderOptions> = {}): ProviderRegistry {
  const e = env();
  const opts: MockProviderOptions = {
    failureRate: e.PROVIDER_FAILURE_RATE,
    minLatencyMs: e.PROVIDER_MIN_LATENCY_MS,
    maxLatencyMs: e.PROVIDER_MAX_LATENCY_MS,
    ...overrides,
  };
  return {
    google: new MockGoogleWorkspaceProvider(opts),
    microsoft: new MockMicrosoft365Provider(opts),
  };
}
