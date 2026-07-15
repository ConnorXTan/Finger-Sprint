# Finger Sprint — Design System (Ink on Paper)

Source of truth for all visual work. Full design doc:
`~/.gstack/projects/ConnorXTan-glova/connortan-main-design-20260715-171520.md`
(wireframe: `~/.gstack/projects/ConnorXTan-glova/designs/mockup-20260715/ink-sketch.png`).

## Tokens

```css
--paper:     #FAF7F0;  /* background everywhere */
--ink:       #1a1a1a;  /* every stroke, every glyph */
--ink-muted: #595959;  /* the ONLY muted text color (≈5.9:1 on paper) */
--signal:    #C0392B;  /* the ONLY accent — see red budget */
```

Opacity-based muting is for decorative strokes only, never text. Below 820px,
home/leaderboard/results render fully; the play path shows the designed
"runs best on a laptop" ink card — no half-working mobile game.

`--good` / `--bad` / navy / yellow / coral are retired. No gradients, no glassy
panels, no drop shadows, no `shadowBlur`.

## The red budget

`--signal` appears in exactly three places: the combo stamp, the finish flag
(including the red flag glyph on a WON round's results — a timeout gets an ink
stopwatch instead), and the player's own leaderboard row (pinned below the
top-10 with rank + gap caption when the player lands off-board). Never for
status, errors, buttons, or decoration. Errors are ink with a scratchy single
strike-underline + drawn asterisk — the double underline is reserved for the
title's signature treatment.

## Ink tint scale

ink-100 `#1a1a1a` (primary strokes/text) · ink-55 `#595959` (muted text, the
only allowed) · ink-28 (28% opacity — decorative strokes only, never text) ·
hairline (20%, 1px rules).

## Play HUD slots

Timer top-left. **Score is the top-right hero** (the game ranks by score);
red combo stamp overlaps the score block's corner; distance readout small
beneath score (primary distance carrier = the top progress line). Pace gauge
bottom-left (180° arc, radius ≈56px @ 960w) with small steps readout beside
it. Runner band below 35% canvas height; HUD above 22%. Wireframe:
`~/.gstack/projects/ConnorXTan-glova/designs/mockup-20260715/ink-sketch.png`.

## Motion timings

Combo stamp: two-frame slam per integer multiplier increase, then still.
Results: score draws on ~600ms → red own-row settles into leaderboard → form
fades in ~400ms later (never dump the player into an input at the peak); red
hanko stamp slams once, then still. DOM feedback 160ms ease-out; screen fades
200ms; check draw-on 400ms. rough.js: roughness 1.5 / bowing 1 (UI), 2.0
(hills). Idle home scene boils at 5Hz; play at 10Hz.

## Copy voice

Lowercase handwritten everywhere. Locked labels: "start running" (home),
"start the sprint" (calibration — enabled after ≥3 practice steps), "run
again" (results). Trust line under start CTA and on loading: "uses your
camera — video never leaves your device."

## Typography

- Display (title): Caveat 700, clamp(40px, 5vw, 56px)
- HUD numerals (in-canvas): Caveat 700, 52px @ 960px canvas width, ±1px boil jitter
- Headings (h2): Caveat 700, 22px
- Body/lede: Patrick Hand 400, 16px min, line-height 1.6
- Labels: Patrick Hand 400, 13px, 0.12em letter-spacing, uppercase, muted ink
- Fonts are self-hosted; gate first canvas text draw on `document.fonts.ready`.

## Spacing

8px grid (8/16/24/32). Panels pad 24px. Screen gutter 28px.

## Strokes & line boil

- All drawn shapes go through the ink kernel (`frontend/src/render/ink.ts`,
  rough.js underneath). Boil: `boilFrame = floor(t*10) % 3`, 3 cached Path2D
  variants per static shape; dynamic geometry uses `hash(vertexIndex, boilFrame)`.
- Never `Math.random()` in the render loop.
- DOM borders (buttons, panels) are static rough.js SVG, generated once — the
  canvas boils, the DOM does not. Sole exception: the loading spinner (3
  pre-rendered SVG frames cycled ~10Hz).
- `prefers-reduced-motion: reduce` → boil freezes on variant 0 (scene stays
  fully ink, nothing jitters).

## Interaction states

- Button hover: heavier pre-rendered border variant. Active: 1px down-right
  translate. Focus/:focus-visible: hand-drawn double-ring outline. Disabled:
  40% ink opacity.
- Input focus: underline stroke doubles.
- Touch targets ≥ 44px.
- Canvas HUD: visually-hidden `aria-live="polite"` mirror for time/score/result;
  canvas is devicePixelRatio-aware (`ctx.scale(dpr, dpr)`) or numerals blur.
- Calibration coaching: hand detected but no steps for ~3s → "walk them —
  cross your fingertips" instruction + gesture animation.

## Do / Don't

- DO draw the HUD in-canvas, hand-lettered, loud — the numbers are the drama.
- DO design empty states (empty leaderboard = runner doodle + "nobody has run
  yet — be the first name here").
- DON'T reintroduce color for convenience; shape and weight carry meaning.
- DON'T boil body text, ever.
- DON'T add drop shadows, gradients, or glass effects.
