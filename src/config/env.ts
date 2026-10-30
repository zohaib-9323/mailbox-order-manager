import { z } from "zod";

/**
 * Single source of truth for runtime configuration. Parsed lazily so that
 * importing a module never throws at build time; the first real use fails fast
 * with a readable message if something is missing.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  WORKER_LEASE_MS: z.coerce.number().int().positive().default(60_000),
  WORKER_MAILBOX_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
  PROVIDER_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.2),
  PROVIDER_MIN_LATENCY_MS: z.coerce.number().int().min(0).default(1000),
  PROVIDER_MAX_LATENCY_MS: z.coerce.number().int().min(0).default(3000),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\nDid you copy .env.example to .env?`);
  }
  cached = parsed.data;
  return cached;
}
