import { fmt } from "./format.js";

const INPUT_LABELS = {
  projectValue: "Contract value",
  duration: "Duration",
  permits: "Permits",
  workers: "Workforce",
  inspections: "Inspections",
  incidents: "Incidents",
  siteVisits: "Site visits",
  staffRate: "Staff rate",
  platformCost: "Platform cost",
};

const SECTOR_PROSE = {
  infrastructure: "infrastructure",
  commercial: "commercial",
  residential: "residential",
  industrial: "industrial",
  utilities: "utilities",
};

export function topSensitivityDrivers(sensitivity, limit = 3) {
  return Object.entries(sensitivity || {})
    .filter(([, level]) => level === "high" || level === "mid")
    .sort((a, b) => (a[1] === "high" ? 0 : 1) - (b[1] === "high" ? 0 : 1))
    .slice(0, limit)
    .map(([key]) => INPUT_LABELS[key] || key);
}

export function toTitleCase(text) {
  if (!text || !String(text).trim()) return "";
  return String(text)
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function stateNameProse(stateCode, states) {
  const full = states?.[stateCode]?.full;
  if (!full) return stateCode || "";
  return full
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function paybackPhrase(months) {
  const m = Number(months);
  if (!Number.isFinite(m) || m <= 0) return "payback timing depends on inputs";
  if (m < 1) return "payback in under a month";
  if (m < 1.5) return "payback in about one month";
  if (m < 12) {
    const rounded = Math.round(m * 10) / 10;
    return `payback in about ${rounded} months`;
  }
  const yrs = Math.round((m / 12) * 10) / 10;
  return `payback in about ${yrs} years`;
}

/** One-line narrative under the hero total (sentence case, no shouty labels). */
export function buildStorySentence({ confirmedName, sector, stateCode, states, r, fmtMoney = fmt }) {
  const total = r.total;
  const tShare = total > 0 ? r.t.total / total : 0.34;
  const cShare = total > 0 ? r.c.total / total : 0.33;
  const pShare = total > 0 ? r.p.total / total : 0.33;
  const driver =
    tShare >= cShare && tShare >= pShare
      ? "time on permits, inspections, and field workflows"
      : cShare >= pShare
        ? "travel, insurance, and regulatory cost"
        : "downtime and workforce productivity";

  const name = toTitleCase(confirmedName);
  const subject = name || `${SECTOR_PROSE[sector] || "field"} projects`;
  const place = stateNameProse(stateCode, states);

  return `For ${subject} in ${place}, roughly ${fmtMoney(r.total)} is recoverable each year, with ${paybackPhrase(r.payback)}, driven mainly by ${driver}.`;
}

export function buildExecutiveSummary({
  confirmedName,
  sectorLabel,
  stateCode,
  r,
  storySentence,
  modelVersion,
}) {
  const head = `${confirmedName || "Project"} · ${sectorLabel || "Sector"} · ${stateCode || ""}`.trim();
  const metrics = `Recoverable ${fmt(r.total)}/yr · Net ${fmt(r.net)}/yr · ROI ${r.roiX}x · Payback ${r.payback}mo · Platform ${fmt(r.sw)}/yr`;
  const foot = `Indicative AUD · Model v${modelVersion}`;
  return [head, metrics, storySentence, foot].filter(Boolean).join("\n");
}
