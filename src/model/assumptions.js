import { MODEL_VERSION, STATES } from "./constants.js";
import { fmtPlain } from "./format.js";

export function getAssumptionSections(inputs, results) {
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
  } = inputs;
  const s = Math.max(0.2, Math.min(3, pv / 100));
  const d = Math.max(0.4, Math.min(1.8, dur / 24));
  const turnover = Math.max(1, 1 + (dur - 12) * 0.02).toFixed(2);
  const stateFactor = results.stateFactor ?? STATES[state]?.factor ?? 1;

  return [
    {
      title: "Time savings",
      items: [
        {
          name: "Permit workflows",
          amount: results.t.permits,
          formula: `${permits} permits/mo × 12 × 1.5 hr × $${staffRate}/hr × duration factor ${d.toFixed(2)}`,
        },
        {
          name: "Inductions & onboarding",
          amount: results.t.inductions,
          formula: `${workers} workers × 0.5 hr × $${staffRate}/hr × turnover ${turnover}`,
        },
        {
          name: "Inspections & audits",
          amount: results.t.inspections,
          formula: `${inspections}/yr × 0.25 hr × $${staffRate}/hr × duration factor ${d.toFixed(2)}`,
        },
        {
          name: "Incident reporting",
          amount: results.t.incidents,
          formula: `${incidents}/yr × 1 hr × $${staffRate}/hr × duration factor ${d.toFixed(2)}`,
        },
        {
          name: "Automated dashboards",
          amount: results.t.dashboards,
          formula: `48 wk × 8 hr × $${staffRate}/hr × duration factor, scaled by activity volume`,
        },
        {
          name: "Paperless processes",
          amount: results.t.paperless,
          formula: `$15K baseline × scope factor ${s.toFixed(2)} × duration factor, scaled by permits + inspections`,
        },
      ],
    },
    {
      title: "Cost savings",
      items: [
        {
          name: "Reduced site travel",
          amount: results.c.travel,
          formula: `${siteVisits} visits/mo × 12 × 0.6 trips × $200 × duration factor ${d.toFixed(2)}`,
        },
        {
          name: "Lower insurance premiums",
          amount: results.c.insurance,
          formula: `$${pv}M contract × 0.5% × 3.5% premium slice, capped by incident rate`,
        },
        {
          name: "Regulatory avoidance",
          amount: results.c.regulatory,
          formula: `$25K × scope ${s.toFixed(2)} × duration factor, scaled by incidents + inspections`,
        },
      ],
    },
    {
      title: "Productivity",
      items: [
        {
          name: "Reduced downtime",
          amount: results.p.downtime,
          formula: `$375K baseline × scope ${s.toFixed(2)} × duration factor, scaled by incidents`,
        },
        {
          name: "Workforce utilisation",
          amount: results.p.workforce,
          formula: `$120K × scope × duration factor, scaled by workforce size`,
        },
        {
          name: "Dispute avoidance",
          amount: results.p.disputes,
          formula: `$50K × scope factor, scaled by incidents + inspections`,
        },
      ],
    },
    {
      title: "Totals & platform",
      items: [
        {
          name: "Subtotal (before state)",
          amount: Math.round(results.total / stateFactor),
          formula: "Sum of time + cost + productivity categories",
        },
        {
          name: `State adjustment (${state})`,
          amount: results.total,
          formula: `Subtotal × ${stateFactor.toFixed(2)} (${STATES[state]?.full || state})`,
        },
        {
          name: "Annual platform cost",
          amount: results.sw,
          formula:
            inputs.platformCostAuto === false
              ? `Manual entry: ${fmtPlain(results.sw)}/yr`
              : `Estimated from contract size (suggested ${fmtPlain(results.swSuggested)}/yr)`,
        },
        {
          name: "Net savings",
          amount: results.net,
          formula: `${fmtPlain(results.total)} recoverable − ${fmtPlain(results.sw)} platform`,
        },
      ],
    },
  ];
}

export { MODEL_VERSION };
