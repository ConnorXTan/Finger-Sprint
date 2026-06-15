# 🏃✋ Finger Sprint

A webcam finger-speed running game. Wiggle your fingers in front of the camera as
fast as you can — faster finger motion makes an on-screen character sprint. Cover
the most distance (or reach the finish line) before the timer runs out, then put
your name on the leaderboard.

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
| Movement-intensity metric | ✅ computes & smooths | — |
| Game physics (speed, distance, decay) | — | ✅ authoritative |
| Scoring & validation | — | ✅ single source of truth |
| Rendering (character, meters, timer) | ✅ visualizes server state | — |
| Leaderboard persistence | — | ✅ SQLite |

The frontend is deliberately **"dumb" about scoring**: it sends a movement metric
and renders whatever state the server says is true. Scores are computed and
clamped server-side so they can't be trivially faked from the client.

---

## Data flow

```
 Webcam ─▶ MediaPipe Hands ─▶ 21 landmarks/frame
                                   │
                                   ▼
                    movementIntensity.ts  (velocity of fingertips,
                    normalized by hand size, exponentially smoothed)
                                   │  every ~100ms (NOT every frame)
                                   ▼
        WebSocket  { type:"movement", sessionId, intensity, timestamp }
                                   │
                                   ▼
   ┌──────────────────────── BACKEND ────────────────────────┐
   │  game loop @100ms: intensity → target speed → accel/decay │
   │  → distance += speed·dt → score → win/lose checks         │
   └──────────────────────────────────────────────────────────┘
                                   │  every tick
                                   ▼
        WebSocket  { type:"state", position, speed, distance,
                     score, timeRemaining, finished }
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

Game tuning (round length, speed curve, scoring) lives in
[`backend/src/config.ts`](backend/src/config.ts). The movement-intensity
sensitivity lives in
[`frontend/src/game/movementIntensity.ts`](frontend/src/game/movementIntensity.ts)
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

**client → server** (send on a fixed ~100ms tick, *not* every frame):

```jsonc
{ "type": "movement", "sessionId": "uuid", "intensity": 73.4, "timestamp": 1700000000000 }
```

**server → client** (one per game tick):

```jsonc
{
  "type": "state",
  "position": 0.42,        // 0..1 progress along the track
  "speed": 410,            // current speed (units/s)
  "distance": 7560,        // distance covered
  "score": 14820,          // banked, combo-weighted score
  "multiplier": 2.3,       // live sustained-effort combo (>= 1)
  "timeRemaining": 52400,  // ms left
  "finished": false
}
```

The server may also send `{ "type": "error", "message": "..." }` (e.g. unknown
session). Malformed frames are ignored.

---

## How the movement metric works

Per video frame, [`movementIntensity.ts`](frontend/src/game/movementIntensity.ts):

1. Looks at the **five fingertips** (landmarks 4, 8, 12, 16, 20).
2. Measures how far they moved since the previous frame.
3. **Normalizes by hand size** (wrist → middle-knuckle distance), so being close
   to or far from the camera doesn't change the metric.
4. Divides by elapsed time → a **velocity** (independent of webcam frame rate).
5. **Exponentially smooths** the result so it doesn't jitter.

When no hand is detected, the value decays toward 0 so the runner coasts to a stop
rather than freezing. Every knob (`emaAlpha`, `scale`, which landmarks count) is a
documented constant in `DEFAULT_TUNING`.

---

## Scoring

All scoring is server-side ([`backend/src/game/engine.ts`](backend/src/game/engine.ts),
tuned in [`backend/src/config.ts`](backend/src/config.ts)). A 90-second round works
like this:

- **Banked distance points.** Every tick you bank the ground covered × a points
  rate. Because faster fingers cover more ground, speed is rewarded automatically.
- **Sustained-effort combo (×1 → ×3).** A multiplier **builds** while you hold the
  runner above a speed threshold and **decays ~2× faster** when you drop below it.
  Banked points are weighted by the live multiplier, so consistent fast wiggling
  scores far more than one-off bursts. The current combo streams in the `state`
  message (`multiplier`) and shows live in the HUD.
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
