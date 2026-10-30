import { and, eq, gt, sql } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { sessions, users } from "@/db/schema";

export async function findUserByEmail(db: DbExecutor, email: string) {
  const [row] = await db.select().from(users).where(eq(users.email, email));
  return row ?? null;
}

export async function insertSession(db: DbExecutor, s: { tokenHash: string; userId: string; expiresAt: Date }) {
  await db.insert(sessions).values(s);
}

export async function findUserBySessionHash(db: DbExecutor, tokenHash: string) {
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, sql`now()`)));
  return row ?? null;
}

export async function deleteSession(db: DbExecutor, tokenHash: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}
