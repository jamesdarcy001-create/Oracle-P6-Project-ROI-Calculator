import { STATES, PRESETS, DEFAULTS } from "./constants.js";

export function defaultPlatformCost(projectValue) {
  const pv = Number(projectValue) || 0;
  const sw =
    pv <= 50
      ? 12000
      : pv <= 200
        ? 12000 + ((pv - 50) / 150) * 12000
        : 24000 + ((Math.min(pv, 500) - 200) / 300) * 24000;
  return Math.round(sw / 1000) * 1000;
}

export function resolvePlatformCost(i) {
  const pv = Number(i.projectValue) || 0;
  if (i.platformCost != null && Number(i.platformCost) >= 0 && i.platformCostAuto === false) {
    return Math.round(Number(i.platformCost) / 1000) * 1000;
  }
  if (i.platformCost != null && Number(i.platformCost) >= 0) {
    return Math.round(Number(i.platformCost) / 1000) * 1000;
  }
  return defaultPlatformCost(pv);
}

/** @param {Record<string, unknown>} i */
export function calc(i) {
  const {
    projectValue: pv,
    duration: dur,
    permits,
    workers,
    inspections,
    incidents,
    siteVisits,
    staffRate,
    state,
  } = i;

  const s = Math.max(0.2, Math.min(3, pv / 100));
  const d = Math.max(0.4, Math.min(1.8, dur / 24));
  const turnover = Math.max(1, 1 + (dur - 12) * 0.02);

  const t = {
    permits: Math.round(permits * 12 * 1.5 * staffRate * d) || 0,
    inductions: Math.round(workers * 0.5 * staffRate * turnover) || 0,
    inspections: Math.round(inspections * 0.25 * staffRate * d) || 0,
    incidents: Math.round(incidents * 1 * staffRate * d) || 0,
    dashboards:
      Math.round(48 * 8 * staffRate * d * Math.min(1, (permits + inspections + incidents) / 800)) || 0,
    paperless: Math.round(15000 * s * d * Math.min(1, (permits + inspections) / 1000)) || 0,
  };
  t.total = Object.values(t).reduce((a, b) => a + b, 0);

  const hrs =
    Math.round((permits * 12 * 90 + workers * 30 + inspections * 15 + incidents * 60) / 60) || 0;

  const c = {
    travel: Math.round(siteVisits * 12 * 0.6 * 200 * d) || 0,
    insurance: Math.round(pv * 1e6 * 0.005 * 0.035 * Math.min(1, incidents / 50)) || 0,
    regulatory: Math.round(25000 * s * d * Math.min(1, (incidents + inspections) / 500)) || 0,
  };
  c.total = Object.values(c).reduce((a, b) => a + b, 0);

  const p = {
    downtime: Math.round(375000 * s * d * Math.min(1.4, incidents / 70)) || 0,
    workforce: Math.round(120000 * s * d * Math.min(1, workers / 400)) || 0,
    disputes: Math.round(50000 * s * Math.min(1, (incidents + inspections) / 600)) || 0,
  };
  p.total = Object.values(p).reduce((a, b) => a + b, 0);

  let total = t.total + c.total + p.total;
  const stateFactor = (state && STATES[state]?.factor) || 1;
  total = Math.round(total * stateFactor);

  if (stateFactor !== 1) {
    const f = stateFactor;
    t.total = Math.round(t.total * f);
    c.total = Math.round(c.total * f);
    p.total = Math.round(p.total * f);
    Object.keys(t).forEach((k) => {
      if (k !== "total") t[k] = Math.round(t[k] * f);
    });
    Object.keys(c).forEach((k) => {
      if (k !== "total") c[k] = Math.round(c[k] * f);
    });
    Object.keys(p).forEach((k) => {
      if (k !== "total") p[k] = Math.round(p[k] * f);
    });
  }

  const swSuggested = defaultPlatformCost(pv);
  const swRound = resolvePlatformCost(i);
  const net = total - swRound;
  const roiX = Math.round((total / Math.max(swRound, 1)) * 10) / 10;
  const payback = total > 0 ? Math.max(0.3, Math.round((swRound / total) * 12 * 10) / 10) : 99;
  const yr3 = Math.round(total + total * 1.1 + total * 1.2);
  const dailyLoss = Math.round(total / 260);

  return {
    t,
    c,
    p,
    total,
    sw: swRound,
    swSuggested,
    net,
    roiX,
    payback,
    yr3,
    hrs,
    neg: net < 0,
    dailyLoss,
    stateFactor,
  };
}

export function buildInputsFromSector(sector, overrides = {}) {
  const preset = PRESETS[sector] || PRESETS.infrastructure;
  const pv = Number(overrides.projectValue) || DEFAULTS.projectValue;
  const num = (key, fallback) => {
    if (overrides[key] != null && overrides[key] !== "") return Number(overrides[key]);
    return fallback;
  };
  return {
    projectValue: pv,
    duration: num("duration", DEFAULTS.duration),
    permits: num("permits", preset.permits),
    workers: num("workers", preset.workers),
    inspections: num("inspections", preset.inspections),
    incidents: num("incidents", preset.incidents),
    siteVisits: num("siteVisits", preset.siteVisits),
    staffRate: num("staffRate", preset.staffRate),
    state: overrides.state || DEFAULTS.state,
    platformCost:
      overrides.platformCost != null ? Number(overrides.platformCost) : defaultPlatformCost(pv),
    platformCostAuto: overrides.platformCostAuto !== false,
  };
}
