# Testing

100% test coverage is the key to great vibe coding. Tests let you move fast,
trust your instincts, and ship with confidence — without them, vibe coding is
just yolo coding. With tests, it's a superpower.

## Framework

[Vitest](https://vitest.dev) 4.x, configured at the repo root
(`vitest.config.ts`) and covering all three workspaces. Component tests can use
`@testing-library/react` (installed, opt into jsdom per-file with
`// @vitest-environment jsdom`).

## Running tests

```bash
npm test          # run the whole suite once
npm run test:watch  # watch mode
```

## Test layers

- **Unit tests** — pure logic, colocated next to the source as
  `<name>.test.ts` (e.g. `frontend/src/game/stepCounter.test.ts`,
  `backend/src/game/engine.test.ts`). This is where most tests live: the step
  detector and the game engine are deterministic and fast to test.
- **Integration tests** — REST + WebSocket flows against a running backend.
  Currently exercised ad hoc (see the QA reports); promote recurring checks
  into `backend/src/**/*.test.ts` using fake timers.
- **E2E** — browser-level checks are run via `/qa` (headless Chromium).
  The webcam/hand-tracking loop needs a real hand, so keep its logic unit-
  tested with synthetic landmarks instead (see `stepCounter.test.ts`).

## Conventions

- Colocate: `foo.test.ts` next to `foo.ts`.
- `describe` block per unit, behavior-named `it` strings.
- Test what the code DOES — assert real values, never just "it's defined".
- Time-dependent code uses `vi.useFakeTimers()` + `vi.setSystemTime(...)`.
- Synthetic hand landmarks: build the 21-point array with the helper pattern
  in `stepCounter.test.ts` (wrist at (0.5, 0.9), knuckle at (0.5, 0.7)).
- Never import secrets or credentials into tests.
