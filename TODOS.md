# TODOs

Design debt deferred from the 2026-07-15 ink-on-paper design review
(doc: `~/.gstack/projects/ConnorXTan-glova/connortan-main-design-20260715-171520.md`).

- [ ] **Mobile pass** — real touch-era layouts + MediaPipe perf testing on phones.
  Why: v1 ships desktop-first with a designed "runs best on a laptop" card below 820px;
  phones have front cameras, so a true mobile game is possible but is a perf project,
  not a reskin. Depends on: ink redo shipped. (human: ~2 days / CC: ~1h + device testing)
- [ ] **Approach C: "the pen that can't keep up"** — speed-modulated stroke roughness,
  boil rate 8→14Hz with speed, ghost gesture-line smears. Why: the biggest "whoa,"
  staged deliberately after B ships so tuning happens against a finished game.
  Depends on: ink kernel landed. (human: weekend evenings / CC: ~2-3h + tuning passes)
- [ ] **Midnight-ink variant** — inverted theme (near-black paper, white ink, same red)
  for dark rooms. Why: paper glare in dim party rooms; token-file-only change once the
  system exists. Depends on: ink redo shipped. (human: ~2h / CC: ~10min)
