# Architecture

## Shape of the system

```
 Browser ──HTTP──▶ Next.js (App Router)                         Worker process (npm run worker)
                   ├─ pages (server components)  ─┐              ├─ loop: reap → claim → provision
                   └─ /api route handlers ────────┤              │
                                                  ▼              ▼
                                   services  (order, auth, provisioning, order-transitions)
                                        │            │                     │
                                   domain (state machine, errors, types — pure TS)
                                        │                                  │
                                   repositories (Drizzle SQL)        providers (Strategy)
                                        │                            google / microsoft (mocked)
                                        ▼
                                   PostgreSQL  ← also the job queue (orders.status = PENDING)
```

Two processes share one database. The web app never calls a provider; the worker never serves HTTP.
Postgres is the only coordination point between them and between multiple workers.

## Request flow: "customer creates an order"

1. `POST /api/orders` (`src/app/api/orders/route.ts`): reads the session, validates the
   `Idempotency-Key` header and the JSON body with zod, calls `createOrder()`. That is all it does.
2. `createOrder()` (`src/server/services/order-service.ts`), in one transaction:
   `INSERT ... ON CONFLICT (user_id, idempotency_key) DO NOTHING RETURNING`, then the mailbox rows,
   then the `∅ → PENDING` audit event.
3. If the insert returned nothing, another request with the same key won. We read that order and
   compare the stored `request_hash`: same payload → replay (HTTP 200 + `Idempotent-Replayed: true`),
   different payload → 422 `IDEMPOTENCY_KEY_REUSED`.

## Design patterns

| Pattern | Where | Why | Alternative rejected |
|---|---|---|---|
| **State machine (table-driven)** | `src/domain/order-state-machine.ts` | The lifecycle is data: `from → to → allowed actors`. One place answers "is this legal?", it is pure so it is unit-tested exhaustively (64 combinations), and the actor column means "only admins retry" is a domain rule, not an `if` in a route. | A `switch` per action (`retry()`, `markActive()`…) scattered across services: easy to add an edge in one place and forget the check in another; hard to test exhaustively. A state-machine library (XState) is too heavy for four states. |
| **Single transition choke point + audit log** | `src/server/services/order-transitions.ts` | `transitionOrder()` is the only code that changes `orders.status`: domain check → compare-and-set `UPDATE … WHERE status = from` → insert `order_events`, all in the caller's transaction. So no transition can skip validation or the audit log, and a lost race becomes a clean 409 instead of a silent overwrite. | Postgres trigger writing the audit row: invisible to readers of the TypeScript, cannot record *who* (actor) without session variables. |
| **Service layer** | `src/server/services/*` | Business rules, authorization and transactions in one testable layer; route handlers and pages stay thin (validate → call → respond). The worker and the seed script reuse the same services as the API. | Next.js Server Actions holding the logic: ties business rules to the UI framework and is awkward to reuse from the worker process. |
| **Repository** | `src/server/repositories/*` | All SQL in one place per aggregate, typed by Drizzle. Services read like business logic, not query building. The locking queries (`FOR UPDATE SKIP LOCKED`) are named and documented once. | Generic repository base class (`Repository<T>`): hides the specific queries (locking, fencing) that are the interesting part. |
| **Strategy** | `src/server/providers/*` (`MailboxProvider` interface, `MockGoogleWorkspaceProvider`, `MockMicrosoft365Provider`, `registry.ts`) | The worker picks a provider by `order.provider` from a registry and only knows the interface. Swapping a mock for a real Google Admin SDK client touches `registry.ts` only. Tests inject a deterministic `FakeProvider` the same way. | `if (provider === "google") … else …` inside the worker: every new provider edits the worker. |
| **Template Method** | `MockMailboxProvider` base class | Latency, failure injection and idempotency are shared; subclasses supply only vendor flavour (id format, error text). | Copy-pasting the mock per vendor. |
| **Queue + worker (Postgres as the queue)** | `src/server/services/provisioning-service.ts`, `src/worker/main.ts` | `SELECT … FOR UPDATE SKIP LOCKED LIMIT 1` + status flip in one transaction = an atomic claim; N workers never claim the same order. No extra infrastructure, and the job state *is* the order state, so they cannot drift. | Redis/BullMQ: a second source of truth that can disagree with the orders table, plus another service in docker-compose for a 4-hour task. `pg-boss`: good, but hides the locking we are being asked to reason about. |
| **Lease + fencing token** | `orders.attempt`, `orders.lease_expires_at` | A claim increments `attempt` and sets a lease (renewed after every mailbox call). Every later write is conditional on `status = PROVISIONING AND attempt = <mine>`. A worker that froze past its lease, while the order was reaped and retried, cannot overwrite the newer attempt. The reaper moves expired leases to `FAILED` (actor `system`) so crashed work surfaces for an admin retry. | Holding a row lock for the whole provisioning run: a 50-mailbox order keeps a transaction open for minutes, and a crashed worker's lock is only released when the TCP connection dies. |
| **Idempotency key** | `orders_user_idempotency_key_uq` + `request_hash` | Client generates a UUID per form instance and sends it as `Idempotency-Key`; double clicks and network retries return the same order. The unique index makes it race-safe, the hash catches key reuse with a different payload. | Dedupe on `(user, domain, provider, count)`: blocks a customer who really wants two identical orders. |
| **Error envelope** | `src/domain/errors.ts`, `src/server/http/handle-route.ts` | Every failure is an `AppError` subclass with `status` + `code`; one wrapper renders `{ error: { code, message, details? } }`. Unknown errors become a generic 500 and are logged, never leaked. | Try/catch with hand-built JSON in each handler: inconsistent codes and shapes. |

## Robustness decisions worth knowing

- **Retry is incremental.** Mailbox addresses are deterministic per order, and a retry only re-provisions
  mailboxes that are not `ACTIVE`. The provider call carries the mailbox id as its idempotency key, so a
  real vendor could dedupe a call whose response we never saw.
- **Database clock for leases** (`now() + interval`), so clock skew between worker hosts does not matter.
- **Failure semantics.** One failed mailbox fails the order (with a summary in `last_error`); the admin
  retry finishes the rest. With a 20% per-call failure rate, large orders usually need a retry or two;
  that is the realistic behaviour the brief asks for. `fail-*` domains always fail, for a predictable demo.
- **Authorization** is in the services: customers are pinned to their own orders (another customer's
  order is a 404, not a 403, so ids don't leak); only customers create, only admins retry.
- **Sessions** are random 256-bit tokens in an httpOnly cookie; only the SHA-256 is stored. Login
  compares against a real dummy bcrypt hash for unknown emails to keep timing flat.
- **`proxy.ts` is only an optimistic redirect.** Real auth happens in pages and route handlers, as the
  Next.js docs recommend.

## What I would do next with more time
- Per-mailbox retry with exponential backoff inside one attempt (today: one call per mailbox per attempt).
- `LISTEN/NOTIFY` to wake workers instantly instead of polling every second.
- Server-Sent Events for the order page instead of a 2-second `router.refresh()` poll.
- Rate limiting on login and order creation; CSRF token (today: `SameSite=Lax` cookies, and request bodies must be `application/json`, which a cross-site HTML form cannot send).
- Expire idempotency keys after N days (today they live as long as the order).
