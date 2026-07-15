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

`--signal` appears in exactly three places: the combo stamp, the finish flag,
and the player's own leaderboard row. Never for status, errors, buttons, or
decoration. Errors are ink with a heavy hand-drawn double underline.

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

## Do / Don't

- DO draw the HUD in-canvas, hand-lettered, loud — the numbers are the drama.
- DO design empty states (empty leaderboard = runner doodle + "nobody has run
  yet — be the first name here").
- DON'T reintroduce color for convenience; shape and weight carry meaning.
- DON'T boil body text, ever.
- DON'T add drop shadows, gradients, or glass effects.
