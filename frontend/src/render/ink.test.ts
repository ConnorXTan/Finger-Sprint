import { describe, expect, it } from "vitest";
import {
  BOIL_HZ_IDLE,
  BOIL_HZ_PLAY,
  BOIL_VARIANTS,
  boilFrame,
  hashJitter,
  MIDNIGHT_PALETTE,
  PAPER_PALETTE,
  STAMP_SPEC,
  VARIANT_SEEDS,
  variantGenerator,
  withAlpha,
} from "./ink";

describe("boilFrame", () => {
  it("cycles through exactly BOIL_VARIANTS frames at 10Hz", () => {
    // 10Hz -> a new frame every 100ms, wrapping every 300ms.
    expect(boilFrame(0, BOIL_HZ_PLAY)).toBe(0);
    expect(boilFrame(99, BOIL_HZ_PLAY)).toBe(0);
    expect(boilFrame(100, BOIL_HZ_PLAY)).toBe(1);
    expect(boilFrame(200, BOIL_HZ_PLAY)).toBe(2);
    expect(boilFrame(300, BOIL_HZ_PLAY)).toBe(0);
  });

  it("runs at half rate for the idle scene (5Hz)", () => {
    expect(boilFrame(0, BOIL_HZ_IDLE)).toBe(0);
    expect(boilFrame(199, BOIL_HZ_IDLE)).toBe(0);
    expect(boilFrame(200, BOIL_HZ_IDLE)).toBe(1);
    expect(boilFrame(400, BOIL_HZ_IDLE)).toBe(2);
    expect(boilFrame(600, BOIL_HZ_IDLE)).toBe(0);
  });

  it("never leaves the [0, BOIL_VARIANTS) range", () => {
    for (let t = 0; t < 5000; t += 37) {
      const f = boilFrame(t, BOIL_HZ_PLAY);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(BOIL_VARIANTS);
    }
  });
});

describe("hashJitter", () => {
  it("is deterministic: same inputs, same jitter", () => {
    expect(hashJitter(5, 1)).toBe(hashJitter(5, 1));
    expect(hashJitter(5, 1, 42)).toBe(hashJitter(5, 1, 42));
  });

  it("differs across boil frames for the same vertex", () => {
    expect(hashJitter(5, 0)).not.toBe(hashJitter(5, 1));
    expect(hashJitter(5, 1)).not.toBe(hashJitter(5, 2));
  });

  it("differs across vertices within a frame", () => {
    expect(hashJitter(1, 0)).not.toBe(hashJitter(2, 0));
  });

  it("stays within [-1, 1]", () => {
    for (let i = 0; i < 200; i++) {
      for (let f = 0; f < BOIL_VARIANTS; f++) {
        const j = hashJitter(i, f);
        expect(Math.abs(j)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("variant generators", () => {
  it("has one fixed seed per boil variant", () => {
    expect(VARIANT_SEEDS).toHaveLength(BOIL_VARIANTS);
    expect(new Set(VARIANT_SEEDS).size).toBe(BOIL_VARIANTS);
  });

  it("draws identically for the same variant (cache-safe)", () => {
    const a = variantGenerator(0).rectangle(0, 0, 100, 50);
    const b = variantGenerator(0).rectangle(0, 0, 100, 50);
    expect(JSON.stringify(a.sets)).toBe(JSON.stringify(b.sets));
  });

  it("draws differently across variants (that IS the boil)", () => {
    const a = variantGenerator(0).rectangle(0, 0, 100, 50);
    const b = variantGenerator(1).rectangle(0, 0, 100, 50);
    expect(JSON.stringify(a.sets)).not.toBe(JSON.stringify(b.sets));
  });
});

describe("palettes", () => {
  it("each palette carries its scheme's signal red (midnight is lightened for AA contrast)", () => {
    // Same red concept, different hex: #C0392B is ~3.5:1 on midnight paper,
    // so dark mode uses #E25B4D (>=4.5:1) — must stay in sync with styles.css.
    expect(PAPER_PALETTE.signal).toBe("#C0392B");
    expect(MIDNIGHT_PALETTE.signal).toBe("#E25B4D");
  });

  it("withAlpha produces valid rgba from hex", () => {
    expect(withAlpha("#1a1a1a", 0.28)).toBe("rgba(26,26,26,0.28)");
    expect(withAlpha("#C0392B", 1)).toBe("rgba(192,57,43,1)");
  });
});

describe("STAMP_SPEC", () => {
  it("is the single stamp identity both renderers consume", () => {
    expect(STAMP_SPEC.rotationDeg).toBe(-7);
    expect(STAMP_SPEC.dash.length).toBeGreaterThan(0);
    expect(STAMP_SPEC.strokeWidth).toBeGreaterThan(0);
  });
});
