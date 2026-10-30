import { createHash, randomBytes } from "node:crypto";
import { getDb } from "@/db/client";
import { UnauthorizedError } from "@/domain/errors";
import type { SessionUser } from "@/domain/user";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import * as userRepo from "@/server/repositories/user-repository";
import type { LoginInput } from "@/server/validation/auth-schemas";

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Real bcrypt hash of a random secret. Comparing against it when the email is
// unknown keeps response time the same, so login timing does not reveal which
// emails exist. Generated once on first use: a hand-written constant may not be a valid
// bcrypt string, and compare() would then fail fast and defeat the purpose.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(16).toString("hex")));

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function login(input: LoginInput): Promise<{ token: string; expiresAt: Date; user: SessionUser }> {
  const user = await userRepo.findUserByEmail(getDb(), input.email);
  const ok = await verifyPassword(input.password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok) throw new UnauthorizedError("Email or password is incorrect.");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await userRepo.insertSession(getDb(), { tokenHash: hashToken(token), userId: user.id, expiresAt });
  return { token, expiresAt, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
}

export async function userForSessionToken(token: string): Promise<SessionUser | null> {
  return userRepo.findUserBySessionHash(getDb(), hashToken(token));
}

export async function logout(token: string): Promise<void> {
  await userRepo.deleteSession(getDb(), hashToken(token));
}
