import { describe, expect, it } from "vitest";
import { statusForGetUserMediaError } from "./useWebcam";

// Regression: ISSUE-002 — NotSupportedError (headless/limited browsers) fell
// through to the generic "Something went wrong / Not supported" screen, and
// busy-camera errors (NotReadableError) had no guidance at all.
// Found by /qa on 2026-07-15
// Report: .gstack/qa-reports/qa-report-localhost-2026-07-15.md
describe("statusForGetUserMediaError", () => {
  const named = (name: string) => ({ name, message: name });

  it("maps permission rejections to denied", () => {
    expect(statusForGetUserMediaError(named("NotAllowedError"))).toBe("denied");
    expect(statusForGetUserMediaError(named("SecurityError"))).toBe("denied");
  });

  it("maps missing-camera errors to notfound", () => {
    expect(statusForGetUserMediaError(named("NotFoundError"))).toBe("notfound");
    expect(statusForGetUserMediaError(named("OverconstrainedError"))).toBe("notfound");
  });

  it("maps in-use / hardware errors to busy", () => {
    expect(statusForGetUserMediaError(named("NotReadableError"))).toBe("busy");
    expect(statusForGetUserMediaError(named("AbortError"))).toBe("busy");
  });

  it("maps unsupported-capture errors to unsupported", () => {
    expect(statusForGetUserMediaError(named("NotSupportedError"))).toBe("unsupported");
    expect(statusForGetUserMediaError(named("TypeError"))).toBe("unsupported");
  });

  it("falls back to error for anything unknown", () => {
    expect(statusForGetUserMediaError(named("SomethingWeird"))).toBe("error");
    expect(statusForGetUserMediaError(undefined)).toBe("error");
    expect(statusForGetUserMediaError("string error")).toBe("error");
  });
});
