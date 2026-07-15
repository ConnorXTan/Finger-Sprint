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

## Design

An approved ink-on-paper frontend redesign lives at
`~/.gstack/projects/ConnorXTan-glova/connortan-main-design-20260715-171520.md` —
read it before frontend/visual work. Multiple Claude Code sessions may work this
repo concurrently (tmux `cc` bridge); re-check `git log` before relying on
earlier file reads.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
