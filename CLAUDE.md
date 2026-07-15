# Finger Sprint

Webcam finger-walking game. Three npm workspaces: `shared` (API types only),
`backend` (Express + ws, authoritative game loop), `frontend` (React + Vite +
MediaPipe). See README.md for architecture.

- Dev: `npm run dev` (backend :4000, frontend :5173, Vite proxies /api + /ws)
- Typecheck: `npm run typecheck`

## Testing

- Run: `npm test` (Vitest, root config covers all workspaces). Details: TESTING.md.
- Tests colocate with source as `<name>.test.ts`.
- Expectations:
  - 100% test coverage is the goal — tests make vibe coding safe
  - When writing new functions, write a corresponding test
  - When fixing a bug, write a regression test
  - When adding error handling, write a test that triggers the error
  - When adding a conditional (if/else, switch), write tests for BOTH paths
  - Never commit code that makes existing tests fail
