import { describe, expect, it } from "vitest";
import { calc, defaultPlatformCost, buildInputsFromSector } from "./calc.js";
import { PRESETS } from "./constants.js";

const base = buildInputsFromSector("infrastructure", { projectValue: 150, duration: 24, state: "NSW" });

describe("defaultPlatformCost", () => {
  it("tiers by contract value", () => {
    expect(defaultPlatformCost(30)).toBe(12000);
    expect(defaultPlatformCost(150)).toBe(20000);
    expect(defaultPlatformCost(500)).toBe(48000);
  });
});

describe("calc", () => {
  it("matches infrastructure NSW snapshot", () => {
    const r = calc(base);
    expect(r.total).toBe(3_080_847);
    expect(r.sw).toBe(20000);
    expect(r.roiX).toBe(154);
    expect(r.payback).toBe(0.3);
    expect(r.hrs).toBeGreaterThan(1000);
  });

  it("applies state factor", () => {
    const nsw = calc({ ...base, state: "NSW" });
    const tas = calc({ ...base, state: "TAS" });
    expect(nsw.total).toBeGreaterThan(tas.total);
    expect(nsw.stateFactor).toBe(1.1);
    expect(tas.stateFactor).toBe(0.96);
  });

  it("uses custom platform cost for ROI", () => {
    const auto = calc(base);
    const manual = calc({ ...base, platformCost: 60000, platformCostAuto: false });
    expect(manual.sw).toBe(60000);
    expect(manual.net).toBe(auto.net - (60000 - auto.sw));
    expect(manual.roiX).toBeLessThan(auto.roiX);
  });

  it("handles zero operational inputs", () => {
    const r = calc({
      ...base,
      permits: 0,
      workers: 0,
      inspections: 0,
      incidents: 0,
      siteVisits: 0,
    });
    expect(r.total).toBeGreaterThanOrEqual(0);
    expect(r.t.total).toBe(0);
  });

  it("scales with sector presets via buildInputsFromSector", () => {
    const res = buildInputsFromSector("residential");
    expect(res.permits).toBe(PRESETS.residential.permits);
    const r = calc(res);
    expect(r.total).toBeGreaterThan(0);
  });

  it("payback increases when platform cost increases", () => {
    const low = calc(base);
    const high = calc({ ...base, platformCost: 96000, platformCostAuto: false });
    expect(high.payback).toBeGreaterThan(low.payback);
  });
});
