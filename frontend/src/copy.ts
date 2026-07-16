/**
 * All user-facing strings. The ink-on-paper voice is lowercase and handwritten
 * (see DESIGN.md → Copy voice) — keeping every string here makes the voice
 * enforceable in one file.
 */
export const COPY = {
  title: "finger sprint",
  tagline: "wiggle your fingers. the pen does the rest.",

  home: {
    heading: "ready to sprint?",
    lede: "walk your index and middle fingers in front of the webcam — like two little legs. a step counts each time your fingertips cross, and every step moves your runner one stride.",
    howtoToggle: "how it works",
    howto: [
      "allow camera access — video never leaves your device.",
      "hold one hand up so the ink hand appears.",
      "walk your index + middle fingers; a step counts when the tips cross.",
    ],
    start: "start running",
    trust: "uses your camera — video never leaves your device.",
    mobileCard: "finger sprint runs best on a laptop — open this on one!",
  },

  loading: {
    requesting: "asking for the camera…",
    model: "loading the hand-tracking model…",
    ready: "getting things ready…",
    note: "first load downloads the model (~a few MB).",
  },

  calibrate: {
    heading: "warm up",
    handPrompt: "hold your hand up so the ink hand appears.",
    handSeen: "there you are. walk those fingers to take practice steps.",
    coaching: "walk them — cross your fingertips like little legs.",
    stepsLabel: "steps",
    badgeOn: "tracking",
    badgeOff: "no hand",
    start: "start the sprint",
    startLocked: (n: number) => `take ${n} more ${n === 1 ? "step" : "steps"} first`,
  },

  hud: {
    time: "time left",
    score: "score",
    combo: "combo",
    pace: "pace",
    steps: (n: number) => `${n} steps`,
  },

  play: {
    disconnected: "lost the thread — wrapping up…",
  },

  results: {
    win: "you made it",
    timeout: "out of time",
    pointsLabel: "points",
    stats: (distance: number, rank: number | string) => `distance ${distance} · rank #${rank}`,
    namePlaceholder: "your name",
    nameLabel: "name for the board",
    submit: "put me on the board",
    submitting: "inking it in",
    saved: "you're on the board",
    gapToTop: (gap: number) => `${gap} to catch #10`,
    again: "run again",
  },

  leaderboard: {
    heading: "leaderboard",
    refresh: "refresh",
    loading: "reading the board…",
    error: "couldn't load scores",
    empty: "nobody has run yet — be the first name here",
  },

  errors: {
    denied: {
      title: "camera permission denied",
      body: "finger sprint needs your webcam to see your fingers run. enable camera access for this site, then try again — video never leaves your device.",
    },
    notfound: {
      title: "no camera found",
      body: "we couldn't find a webcam. plug one in (or enable it) and try again.",
    },
    busy: {
      title: "camera unavailable",
      body: "your camera looks busy in another app, or the OS is blocking it. close whatever's using it and try again.",
    },
    unsupported: {
      title: "webcam not supported",
      body: "this browser doesn't support getUserMedia. try a recent chrome, edge, or firefox over https or localhost.",
    },
    generic: {
      title: "the pen slipped",
      body: "an unexpected error occurred. please try again.",
    },
    retry: "try again",
  },

  thumb: {
    caption: "your hand",
  },
} as const;
