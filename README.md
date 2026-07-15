# 🏃✋ Finger Sprint

A webcam finger-walking running game. "Walk" your index and middle fingers in
front of the camera like two little legs — every time the two fingertips cross
each other counts as one step, and every step moves your runner one fixed
stride. Rack up the most steps (or reach the finish line) before the timer runs
out, then put your name on the leaderboard.

Inspired by viral gesture-counting hand challenges. All hand tracking runs **in
your browser** — video frames never leave your device.

---

## Architecture at a glance

Three packages in one repo, with a hard frontend ⇄ backend split. They share
**only** a tiny TypeScript types package and talk **only** over a documented API
(REST for session lifecycle, WebSocket for live gameplay).

```
finger-sprint/
├── shared/     # @finger-sprint/shared — TS types for the API contract (no runtime code)
├── backend/    # Node + Express + ws — sessions, authoritative game loop, scoring, SQLite
├── frontend/   # React + Vite — webcam, MediaPipe hand tracking, Canvas rendering
└── README.md
```

### Who owns what

| Concern | Frontend (client) | Backend (server) |
| --- | --- | --- |
| Webcam capture (`getUserMedia`) | ✅ | — |
| Hand tracking (MediaPipe, client-side) | ✅ | — |
| Step counting (fingertip crossings) | ✅ detects & counts | — |
| Steps → distance & scoring | — | ✅ authoritative |
| Scoring & validation | — | ✅ single source of truth |
| Rendering (character, meters, timer) | ✅ visualizes server state | — |
| Leaderboard persistence | — | ✅ SQLite |

The frontend is deliberately **"dumb" about scoring**: it reports its flat step
count and renders whatever state the server says is true. Scores are computed
and rate-capped server-side so they can't be trivially faked from the client.

---

## Data flow

```
 Webcam ─▶ MediaPipe Hands ─▶ 21 landmarks/frame
                                   │
                                   ▼
             fingerLegs.ts + stepCounter.ts  (raw index/middle tip
             positions in the hand frame; +1 step per genuine crossing)
                                   │  every ~100ms (NOT every frame)
                                   ▼
        WebSocket  { type:"movement", sessionId, steps, timestamp }
                                   │  (steps = flat cumulative total)
                                   ▼
   ┌──────────────────────── BACKEND ─────────────────────────┐
   │  game loop @100ms: accepted steps (rate-capped) → distance │
   │  += steps · stride → score → win/lose checks               │
   └────────────────────────────────────────────────────────────┘
                                   │  every tick
                                   ▼
        WebSocket  { type:"state", position, speed, distance,
                     steps, score, timeRemaining, finished }
                                   │
                                   ▼
              Canvas renderer  (runner, parallax, finish line, HUD)
```

Session lifecycle uses REST; the live loop uses one WebSocket per session.

---

## Running it

Requires **Node 20+** (built and tested on Node 24). SQLite uses Node's built-in
`node:sqlite`, so there's **no native build step** — a plain install just works.

```bash
# from the repo root — installs all three workspaces
npm install
```

### Run both sides together

```bash
npm run dev
```

- Backend → http://localhost:4000
- Frontend → http://localhost:5173  ← **open this**

Vite proxies `/api` and `/ws` to the backend, so the browser uses same-origin URLs.

### Run each side independently

```bash
npm run dev:backend     # just the API + WebSocket server (port 4000)
npm run dev:frontend    # just the Vite dev server (port 5173)
```

Each workspace is self-contained and can be developed on its own:

```bash
npm run dev    -w @finger-sprint/backend
npm run dev    -w @finger-sprint/frontend
npm run build  -w @finger-sprint/frontend   # production bundle
npm run typecheck                            # typecheck both sides
```

> **First run:** the browser will ask for camera permission, and MediaPipe
> downloads its model + WASM from a CDN the first time (a few MB). Use the app
> over `http://localhost` or `https://` — `getUserMedia` requires a secure context.

### Configuration

Backend (all optional — see [`backend/.env.example`](backend/.env.example)):

| Var | Default | Meaning |
| --- | --- | --- |
| `PORT` | `4000` | HTTP + WebSocket port |
| `DB_PATH` | `./data/leaderboard.db` | SQLite file (auto-created) |

Game tuning (round length, stride distance, scoring) lives in
[`backend/src/config.ts`](backend/src/config.ts). Step-detection sensitivity
(the crossing margin) lives in
[`frontend/src/game/stepCounter.ts`](frontend/src/game/stepCounter.ts)
— both are isolated and commented for easy tweaking.

---

## API contract

Base URL: `http://localhost:4000`. All bodies are JSON. Types are defined once in
[`shared/src/index.ts`](shared/src/index.ts) and imported by both sides.

### REST

#### `POST /api/session`
Create a new session.

```jsonc
// 201 Created
{
  "sessionId": "uuid",
  "durationMs": 90000,     // round length (authoritative)
  "trackLength": 18000,    // distance units to the finish line
  "serverTimeMs": 1700000000000
}
```

#### `POST /api/session/:id/end`
Finalize a session and return its score + provisional rank. Idempotent.

```jsonc
// 200 OK
{
  "sessionId": "uuid",
  "score": 9588,
  "distance": 4032,
  "finished": true,
  "rank": 1,               // 1-based rank vs the persisted leaderboard
  "durationMs": 90000
}
// 404 if the session doesn't exist
```

#### `GET /api/leaderboard?limit=N`
Top `N` scores (default 10, max 100), highest first.

```jsonc
// 200 OK
{
  "entries": [
    { "id": 1, "name": "Ada", "score": 14820, "distance": 7560,
      "createdAt": "2026-06-13T18:19:29.606Z", "rank": 1 }
  ]
}
```

#### `POST /api/leaderboard`
Attach a name to a **finished** session's score (server reads the score from the
session — the client can't supply it).

```jsonc
// request
{ "sessionId": "uuid", "name": "Ada" }

// 201 Created
{ "entry": { "id": 1, "name": "Ada", "score": 14820, "distance": 7560,
             "createdAt": "...", "rank": 1 } }

// 400 if name is empty / missing
// 404 if the session doesn't exist
// 409 if the session isn't finished yet
```

### WebSocket — `ws://localhost:4000/ws?sessionId=<id>`

Open one socket per session (pass the id as a query param). The server starts the
authoritative clock on connect and streams state until the round is `finished`.

**client → server** (send on a fixed ~100ms tick, *not* every frame). `steps`
is the flat, cumulative total of fingertip crossings this round — a count, not
a rate — so lost or reordered messages self-heal via the delta:

```jsonc
{ "type": "movement", "sessionId": "uuid", "steps": 42, "timestamp": 1700000000000 }
```

**server → client** (one per game tick):

```jsonc
{
  "type": "state",
  "position": 0.42,        // 0..1 progress along the track
  "speed": 210,            // display pace derived from stepping (units/s)
  "distance": 7560,        // distance covered (steps × stride)
  "steps": 108,            // total steps the server has accepted
  "score": 14820,          // banked, combo-weighted score
  "multiplier": 2.3,       // live sustained-effort combo (>= 1)
  "timeRemaining": 52400,  // ms left
  "finished": false
}
```

The server may also send `{ "type": "error", "message": "..." }` (e.g. unknown
session). Malformed frames are ignored.

---

## How step counting works

A step has exactly one definition: **the pointer/index fingertip (MediaPipe
landmark 8) and the middle fingertip (landmark 12) physically pass each other.**
Per video frame, [`fingerLegs.ts`](frontend/src/game/fingerLegs.ts) +
[`stepCounter.ts`](frontend/src/game/stepCounter.ts):

1. Project both fingertips onto the **hand axis** (wrist → middle knuckle),
   normalized by hand size — so moving, rotating, or zooming the whole hand
   changes nothing; only real finger motion does.
2. Compare the two **raw** tip positions: whichever reaches further is "in
   front". A tip only counts as clearly in front once it's past the other by a
   margin (`crossMargin`) — the clear boundary between "pointer leads" and
   "middle leads"; jitter inside that dead band is ignored.
3. Count **one step each time the leading tip flips** from one finger to the
   other — i.e. the tips genuinely crossed. Wiggling a single finger without
   its tip passing the other can never flip the leader, so it never counts.

The result is a **flat cumulative count** — no velocity, no smoothing, no decay.
One crossing = one step, always.

---

## Scoring

All scoring is server-side ([`backend/src/game/engine.ts`](backend/src/game/engine.ts),
tuned in [`backend/src/config.ts`](backend/src/config.ts)). A 90-second round works
like this:

- **Flat steps → distance.** Every accepted step advances the runner exactly
  `distancePerStep` units (one stride), and each tick you bank the ground covered
  × a points rate. N steps is always N strides — there is no speed curve to game.
  A server-side rate cap (`maxStepsPerSecond`, far above real finger speed)
  discards impossible bursts instead of banking them.
- **Sustained-effort combo (×1 → ×3).** A multiplier **builds** while your
  stepping pace stays above a threshold and **decays ~2× faster** when you drop
  below it. Banked points are weighted by the live multiplier, so consistent
  stepping scores far more than one-off bursts. The current combo streams in the
  `state` message (`multiplier`) and shows live in the HUD.
- **Finish bonus.** Reaching the finish line (`trackLength`, ~18k units — an
  endurance goal that takes most of the round) adds a bonus per second left on the
  clock. It's kept modest so it rewards a strong finish without dominating.

This makes the leaderboard skill-expressive: distance, consistency, and a clean
finish all matter. Tune any of it via the `game` block in `config.ts`.

---

## Graceful states

The client handles, with dedicated UI: webcam **unsupported**, permission
**denied**, **no camera found**, model **load failure** (retryable), and **no hand
detected** (the "Start sprint" button stays disabled until a hand appears, and the
runner decays to a stop mid-round if tracking is lost).

---

## Tech stack

- **Frontend:** React + TypeScript + Vite, [`@mediapipe/tasks-vision`](https://www.npmjs.com/package/@mediapipe/tasks-vision) (Hand Landmarker), Canvas 2D.
- **Backend:** Node.js + TypeScript + Express (REST) + `ws` (WebSocket), run with `tsx`.
- **DB:** SQLite via built-in `node:sqlite`, behind a `LeaderboardRepo` interface so it can be swapped for Postgres/etc. without touching game code.
- **Shared:** a types-only TypeScript package — the entire cross-boundary surface.

> Note: `npm audit` reports advisories in **dev-only** tooling (Vite/esbuild,
> concurrently). These do not ship in the running app. Bumping Vite to v8 clears
> the esbuild ones if desired.
