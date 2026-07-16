import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted fonts (font-display: swap built in — no FOUT gate needed).
import "@fontsource/caveat/700.css";
import "@fontsource/patrick-hand/400.css";
import App from "./App";
import "./styles.css";
import { makeGrainTileDataUri, MIDNIGHT_PALETTE, PAPER_PALETTE } from "./render/ink";

// Paper grain: one deterministic 256px tile at boot, zero per-frame cost.
// Regenerated when the OS theme flips (the midnight tile inverts the noise).
function applyGrain() {
  const dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const tile = makeGrainTileDataUri(dark ? MIDNIGHT_PALETTE : PAPER_PALETTE);
  if (tile) {
    document.body.style.setProperty("--grain-tile", `url(${tile})`);
    document.body.classList.add("grained");
  }
}
applyGrain();
window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", applyGrain);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
