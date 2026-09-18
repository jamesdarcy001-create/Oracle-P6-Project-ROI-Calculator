export const MODEL_VERSION = "1.0.0";

export const STATES = {
  NSW: { label: "NSW", full: "NEW SOUTH WALES", factor: 1.10 },
  VIC: { label: "VIC", full: "VICTORIA", factor: 1.06 },
  QLD: { label: "QLD", full: "QUEENSLAND", factor: 1.04 },
  WA: { label: "WA", full: "WESTERN AUSTRALIA", factor: 1.12 },
  SA: { label: "SA", full: "SOUTH AUSTRALIA", factor: 1.00 },
  TAS: { label: "TAS", full: "TASMANIA", factor: 0.96 },
  ACT: { label: "ACT", full: "AUSTRALIAN CAPITAL TERRITORY", factor: 1.08 },
  NT: { label: "NT", full: "NORTHERN TERRITORY", factor: 1.14 },
};

export const STATE_ORDER = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

export const PRESETS = {
  infrastructure: { label: "INFRA", permits: 500, workers: 500, inspections: 1000, incidents: 100, siteVisits: 80, staffRate: 155 },
  commercial: { label: "COMMERCIAL", permits: 300, workers: 350, inspections: 600, incidents: 60, siteVisits: 50, staffRate: 140 },
  residential: { label: "RESIDENTIAL", permits: 200, workers: 250, inspections: 400, incidents: 40, siteVisits: 30, staffRate: 125 },
  industrial: { label: "INDUSTRIAL", permits: 400, workers: 600, inspections: 800, incidents: 120, siteVisits: 100, staffRate: 160 },
  utilities: { label: "UTILITIES", permits: 450, workers: 450, inspections: 900, incidents: 90, siteVisits: 70, staffRate: 150 },
};

export const DEFAULTS = { projectValue: 150, duration: 24, state: "NSW" };

export const DEFAULT_SCENARIO_NAMES = ["BASELINE", "OPTION A", "OPTION B"];
/** Future Oracle P6 fork: add preset slots e.g. P6_ONLY vs P6_NOVADE without changing Novade defaults. */

export const TIPS = {
  projectValue: "Total contract value in AUD millions",
  duration: "Project duration in months",
  permits: "Permits to work per month",
  workers: "Workforce requiring inductions",
  inspections: "Inspections per year",
  incidents: "Incidents and near-misses per year",
  siteVisits: "Management site visits per month",
  staffRate: "Fully-loaded hourly cost (AUD)",
  platformCost: "Annual platform + implementation cost (AUD). Reset applies contract-size estimate.",
  state: "Adjusts labour + regulatory benchmarks by state",
};

export function guessState() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.includes("Sydney")) return "NSW";
    if (tz.includes("Melbourne")) return "VIC";
    if (tz.includes("Brisbane")) return "QLD";
    if (tz.includes("Perth")) return "WA";
    if (tz.includes("Adelaide")) return "SA";
    if (tz.includes("Hobart")) return "TAS";
    if (tz.includes("Darwin")) return "NT";
    if (tz.includes("Canberra") || tz.includes("Currie")) return "ACT";
  } catch {
    /* ignore */
  }
  return "NSW";
}
