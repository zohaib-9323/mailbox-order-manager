# CLAUDE.md

Guidance for Claude Code (and humans) working in this repo. Read `AGENTS.md` too: it points at the
Next.js 16 docs bundled in `node_modules/next/dist/docs/`. Next 16 differs from older versions
(`proxy.ts` replaces `middleware.ts`; `params`, `searchParams` and `cookies()` are async only).

## What this is
Internal tool for ordering pre-warmed Google / Microsoft mailboxes. Customers create orders, a
background worker provisions the mailboxes through mocked providers, admins watch and retry failures.

## Commands
```bash
npm run db:up             # Postgres in Docker (waits until healthy)
npm run setup             # migrate + seed
npm run dev               # web app on :3000
npm run worker            # background provisioning worker (run 2 to see safe concurrency)
npm run typecheck && npm run lint
npm run test:unit         # no DB needed
npm run test:integration  # needs TEST_DATABASE_URL (docker compose creates mailbox_test)
npm run db:generate -- --name <change>   # after editing src/db/schema.ts
```

## Architecture rules (do not break these)
Layering, top to bottom. A layer may only import from layers below it.

| Layer | Path | Allowed to |
|---|---|---|
| UI | `src/app/**/page.tsx`, `src/components/**` | render, call services for reads, call the API for writes |
| HTTP | `src/app/api/**/route.ts` | parse input with zod, resolve the session, call ONE service function, map the result. **No business logic.** |
| Services | `src/server/services/*` | business rules, authorization, transactions |
| Domain | `src/domain/*` | pure TypeScript: types, state machine, errors. **No I/O, no imports from outside `src/domain`.** |
| Repositories | `src/server/repositories/*` | SQL only. No business decisions. |
| Providers | `src/server/providers/*` | Strategy implementations of `MailboxProvider` |
| Worker | `src/worker/*` | process loop; calls the provisioning service |

- Every order status change goes through `transitionOrder()` in `order-repository.ts`, which checks
  `assertTransition()` from the domain state machine, does a conditional `UPDATE ... WHERE status = <from>`
  and writes the `order_events` audit row in the same transaction. Never `UPDATE orders SET status` anywhere else.
- Errors: throw an `AppError` subclass from `src/domain/errors.ts`. Route handlers wrap with
  `handleRoute()` which renders `{ error: { code, message, details? } }`. Do not build error JSON by hand.
- Validation lives in `src/server/validation/*` (zod). Route handlers and services share these schemas.
- Strict TypeScript: no `any`, no non-null `!` unless commented with why it is safe.

## Correctness invariants (tests cover these; keep them green)
1. Order creation is idempotent per `(user_id, Idempotency-Key)`; same key + different payload → 422.
2. Only the worker claims orders, using `FOR UPDATE SKIP LOCKED`; two workers never claim the same order.
3. A worker writes results only while `orders.attempt` still equals the attempt it claimed (fencing token).
   A worker that lost its lease must not overwrite a newer attempt.
4. Retry re-provisions only mailboxes that are not already `ACTIVE`.

## Conventions
- Small commits, one concern each, imperative subject (`feat(worker): ...`, `test: ...`, `docs: ...`).
- New behaviour comes with a test. Integration tests hit a real Postgres, not mocks.
- UI: Tailwind only, no component library. Keep the palette in `globals.css` tokens.
