# Mailbox Order Manager

> **Demo video (2–3 min):** _link goes here_

Internal tool for a company selling pre-warmed Google Workspace and Microsoft 365 mailboxes.
Customers place orders, a background worker provisions the mailboxes through (mocked) provider APIs,
and admins watch every order, read its audit log and retry failures.

**Stack:** Next.js 16 (App Router, strict TypeScript) · PostgreSQL 17 · Drizzle ORM · zod · Vitest · Tailwind CSS 4

- How it is built and why: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- How it was built with Claude Code: [`docs/AI_WORKLOG.md`](docs/AI_WORKLOG.md)
- Rules for agents working in this repo: [`CLAUDE.md`](CLAUDE.md)

## Quick start (about 5 minutes)

Requires **Node.js 20.9+** (22 recommended) and **Docker** (Docker Desktop on macOS/Windows).

```bash
git clone https://github.com/zohaib-9323/mailbox-order-manager.git
cd mailbox-order-manager
npm install
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
npm run db:up                 # Postgres 17 on localhost:5432, waits until healthy
npm run setup                 # runs migrations, then seeds users + 3 demo orders
```

Then, in two terminals:

```bash
npm run dev                   # web app → http://localhost:3000
npm run worker                # provisioning worker
```

Start a second `npm run worker` in a third terminal to see two workers share the queue without
ever claiming the same order.

### Logins (development only)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@mailbox.test` | `admin1234` |
| Customer | `alice@acme.test` | `customer1234` |
| Customer | `bob@globex.test` | `customer1234` |

The seed creates three orders through the real service code: one `ACTIVE` and one `FAILED` for Alice
(ready for an admin retry), and one `PENDING` for Bob that the worker picks up as soon as it starts.

### Things to try
- As Alice, place an order. The order page refreshes itself while the worker runs (1–3 s per mailbox, 20% random failure per mailbox).
- Use a domain starting with `fail-` (e.g. `fail-demo.com`) for a guaranteed failure.
- As the admin, filter by status/provider, open a failed order, read the audit log, press **Retry**.
  Only the mailboxes that failed are provisioned again.
- Idempotency from the command line (sign in first, copy the `mom_session` cookie):
  ```bash
  curl -i -X POST localhost:3000/api/orders -H "Cookie: mom_session=..." \
    -H "Content-Type: application/json" -H "Idempotency-Key: demo-key-0001" \
    -d '{"domain":"acme.com","provider":"google","mailboxCount":3}'
  ```
  Run it twice: `201` first, then `200` with `Idempotent-Replayed: true` and the same order.
  Change the body with the same key: `422 IDEMPOTENCY_KEY_REUSED`.

## Tests

```bash
npm run test:unit          # state machine (exhaustive), validation, mock providers — no DB needed
npm run test:integration   # real Postgres (database mailbox_test, created by docker-compose)
npm test                   # both
npm run typecheck && npm run lint
```

Integration tests rebuild the `mailbox_test` schema from the real migrations on each run. They cover:
- **Order creation:** order + mailboxes + audit row; replay with the same key; 10 concurrent identical
  requests → exactly one order; same key with a different payload → 422; keys are per user.
- **Worker:** two workers draining 12 orders concurrently → every order claimed exactly once and every
  mailbox created once; failure → admin retry → only failed mailboxes re-provisioned, with the full audit
  trail; invalid retries rejected; a crashed worker's lease is reaped, and when it wakes up its writes
  are fenced off from the newer attempt.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, unit + integration tests against Postgres, and a build.

## API

All errors use one shape: `{ "error": { "code": "...", "message": "...", "details"?: ... } }`.

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | anyone | `{ email, password }` → sets httpOnly session cookie |
| POST | `/api/auth/logout` | signed in | 204 |
| GET | `/api/orders?status=&provider=&page=&pageSize=` | signed in | customers: own orders only; admins: all |
| POST | `/api/orders` | customer | header `Idempotency-Key` (8–128 chars); body `{ domain, provider, mailboxCount }` |
| GET | `/api/orders/:id` | owner or admin | order + mailboxes + audit log |
| POST | `/api/orders/:id/retry` | admin | `FAILED → PENDING`; anything else is 409 `INVALID_TRANSITION` |

## Configuration

See [`.env.example`](.env.example). Useful knobs: `PROVIDER_FAILURE_RATE` (default `0.2`),
`PROVIDER_MIN_LATENCY_MS` / `PROVIDER_MAX_LATENCY_MS` (1000–3000), `WORKER_LEASE_MS` (60000),
`WORKER_MAILBOX_CONCURRENCY` (5).

## Project layout

```
src/
  domain/         pure TS: state machine, errors, types (no I/O)
  server/
    services/     business logic + transactions (orders, auth, provisioning)
    repositories/ SQL (Drizzle)
    providers/    MailboxProvider strategy + Google/Microsoft mocks
    validation/   zod schemas
    http/         route error envelope
    auth/         session cookie helpers
  worker/         worker process entry point
  app/            Next.js pages + /api route handlers (thin)
  components/     UI
  db/             schema, migrate, seed
drizzle/          SQL migrations (committed)
tests/unit, tests/integration
```

## Known limitations

- Providers are mocks. Their in-memory idempotency map resets when the worker restarts.
- One failed mailbox fails the whole order; there is no automatic per-mailbox retry with backoff yet
  (an admin retry resumes where it stopped).
- Workers poll every second (`WORKER_POLL_INTERVAL_MS`) instead of `LISTEN/NOTIFY`; the UI polls every 2 s
  while an order is in flight instead of using SSE.
- No rate limiting on login or order creation; no password reset or user management (seeded users only).
- Idempotency keys never expire.
- Times are shown in UTC.

## Troubleshooting

- **Port 5432 already in use:** stop your local Postgres, or change the port in `docker-compose.yml`
  and in both URLs in `.env`.
- **`mailbox_test` does not exist:** the init script only runs when the Docker volume is first created.
  Run `docker compose down -v && npm run db:up && npm run setup`.
