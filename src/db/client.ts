import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/config/env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
/** Either the root db or a transaction handle; repositories accept both. */
export type DbExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

// Reuse one pool across Next.js dev hot reloads instead of leaking a new one per reload.
const globalForDb = globalThis as unknown as { __mailboxPool?: Pool; __mailboxDb?: Database };

export function getDb(): Database {
  if (!globalForDb.__mailboxDb) {
    globalForDb.__mailboxPool = new Pool({ connectionString: env().DATABASE_URL, max: 10 });
    globalForDb.__mailboxDb = drizzle(globalForDb.__mailboxPool, { schema });
  }
  return globalForDb.__mailboxDb;
}

export async function closeDb(): Promise<void> {
  await globalForDb.__mailboxPool?.end();
  globalForDb.__mailboxPool = undefined;
  globalForDb.__mailboxDb = undefined;
}
