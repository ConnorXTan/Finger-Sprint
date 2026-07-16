import { describe, expect, it } from "vitest";
import { COPY } from "./copy";

// Regression: calibration gate copy — the pluralization branch had no coverage
// (testing specialist). Found by /qa on 2026-07-16.
describe("calibration gate copy", () => {
  it("pluralizes the locked label at the n=1 boundary", () => {
    expect(COPY.calibrate.startLocked(1)).toBe("take 1 more step first");
    expect(COPY.calibrate.startLocked(2)).toBe("take 2 more steps first");
  });
});

describe("results copy formatters", () => {
  it("formats the gap-to-top caption", () => {
    expect(COPY.results.gapToTop(35)).toBe("35 to catch #10");
  });
  it("formats the stats line with a dash rank fallback", () => {
    expect(COPY.results.stats(312, "—")).toBe("distance 312 · rank #—");
  });
});
