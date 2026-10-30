# AI worklog

How this project was built with Claude Code (CLI, model Claude Opus 5.5), including where it was wrong.

> Sections marked **TODO(me)** are mine to finish before submitting. Everything else is a factual
> record of the session.

## Planning approach

1. **Read the brief for the grading, not just the features.** The review weights (25% steering,
   20% architecture, 20% correctness) and the red flags shaped the plan: correctness of idempotency
   and the worker first, UI last, small commits throughout.
2. **Check the toolchain before choosing it.** `npm view` showed Prisma's `latest` tag pointing at an
   8.0 release candidate, so Drizzle (stable 0.45) was chosen: plain SQL for `FOR UPDATE SKIP LOCKED`
   and no client-generation step to break a clean clone. Next.js 16 ships its own docs in
   `node_modules/next/dist/docs`; Claude was told (via `AGENTS.md`) to read them before writing code,
   which caught `middleware.ts → proxy.ts`, async `params`/`cookies()`, and `cacheComponents` being on by default.
3. **Build order = the brief's priority order:** state machine (pure, unit tested) → schema + migrations
   → idempotent order creation → provider Strategy + worker (claim / lease / fencing) → API → UI → docs/CI.
4. **Write the invariants down first** (`CLAUDE.md` → "Correctness invariants") and make each one a test.

## Key prompts

1. The kickoff: the full PDF brief plus *"you have to complete it in a way that I stand out"*.
   Claude proposed the plan above and the stack choice before writing any code.
2. *"This is my Claude setup, set this Claude accordingly"* (a settings/memory handoff file). It made
   Claude follow my rules: never push, honest test reporting, UI that does not look generated.
3. *"You won't be pushing the code, I will … Red flags: one giant commit, business logic in route
   handlers, no sign the AI output was reviewed, a README that fails on a clean machine. So you have
   to manage the commits properly … you will ask me to push and commit."*
   From then on Claude proposed commit groups and I reviewed and ran each `git commit` myself.
4. *"Did you run the application?"* Claude answered honestly that only typecheck and unit tests had
   run, because Postgres was not available yet, and did not claim more.
5. **TODO(me):** add the prompts I use while reviewing (e.g. asking for changes after reading a file).

## Times Claude Code was wrong, and how it was fixed

1. **Fake bcrypt constant (security bug).** For timing-safe login it hard-coded a "dummy" bcrypt hash
   string it made up. That string is not guaranteed to be a valid hash, so `compare()` can fail fast,
   which is exactly the timing leak it was meant to prevent. Fixed: generate a real hash of random bytes
   once on first use (`src/server/services/auth-service.ts`).
2. **Business rule in the repository.** The first draft (and the first `CLAUDE.md`) put
   `transitionOrder()`, which calls the state machine, inside `order-repository.ts`. That breaks the
   layering it had just written down. Moved to `src/server/services/order-transitions.ts`; the
   repository keeps only the compare-and-set `updateStatusIf()`.
3. **A clean clone would fail typecheck.** `npm run typecheck` was plain `tsc --noEmit`, but Next 16's
   `PageProps`/`RouteContext` types are generated into `.next/` (gitignored). Caught while writing CI.
   Fixed to `next typegen && tsc --noEmit` and verified after deleting `.next`.
4. **Docs claimed a protection the code didn't have.** `ARCHITECTURE.md` said the API was "JSON-only"
   as a CSRF defence, but `readJson()` accepted any content type. Fixed the code (415 for non-JSON
   bodies) so the doc is true.
5. **UI copy promised a feature that doesn't exist.** The failed-order banner told customers "our team
   has been notified"; nothing notifies anyone. Replaced with factual copy.
6. Smaller ones: tried to install a non-existent `embedded-postgres@17` version; the scaffold's
   `@types/node@20` conflicted with Vitest 5's peer range (pinned `@types/node@22`).

## What I changed by hand

**TODO(me):** list real edits I made myself after reviewing, e.g. copy, naming, a query, a test case.

## Review checklist I applied to Claude's output

- Is any business rule in a route handler or component? (Every handler is parse → session → one service call.)
- Can any code path change `orders.status` without `transitionOrder()`? (`grep "status:"` in repositories.)
- Does each correctness claim in the README/ARCHITECTURE have a test that would fail if it broke?
- Does every write by the worker carry the fencing condition?

## Time per phase

Wall-clock from the session (start 20:32).

| Phase | Time |
|---|---|
| Reading the brief, environment checks, stack decision, scaffold | ~15 min |
| Domain state machine + tests, schema + migration, first commits | ~15 min |
| Services, repositories, providers, worker, integration tests | ~25 min |
| API routes, UI | ~20 min |
| Docs, CI | ~15 min |
| Local Postgres/Docker setup on Windows (blocked: VC++ runtime missing, then Docker needed WSL) | **TODO(me)** |
| Running the app end to end, fixing what it shows, demo video | **TODO(me)** |
| **Total** | **TODO(me)** |
