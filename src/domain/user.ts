import type { Actor, Role } from "./order";

/** The signed-in user, as resolved from the session cookie. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export function actorFor(user: SessionUser): Actor {
  return { type: user.role, id: user.id };
}
