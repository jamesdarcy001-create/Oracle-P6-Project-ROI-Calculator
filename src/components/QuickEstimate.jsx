import { useState, useCallback } from "react";
import {
  PRESETS,
  STATE_ORDER,
  STATES,
  DEFAULTS,
  guessState,
} from "../model/constants.js";
import { buildInputsFromSector, calc, defaultPlatformCost } from "../model/calc.js";
import { fmt } from "../model/format.js";

export default function QuickEstimate({ onComplete, onBack }) {
  const [sector, setSector] = useState("infrastructure");
  const [state, setState] = useState(guessState());
  const [projectValue, setProjectValue] = useState(String(DEFAULTS.projectValue));
  const [duration, setDuration] = useState(String(DEFAULTS.duration));
  const [projectName, setProjectName] = useState("");

  const preview = calc(
    buildInputsFromSector(sector, {
      projectValue: Number(projectValue) || DEFAULTS.projectValue,
      duration: Number(duration) || DEFAULTS.duration,
      state,
      platformCost: defaultPlatformCost(Number(projectValue) || DEFAULTS.projectValue),
    }),
  );

  const submit = useCallback(() => {
    const pv = Number(projectValue) || DEFAULTS.projectValue;
    const dur = Number(duration) || DEFAULTS.duration;
    const preset = PRESETS[sector];
    onComplete({
      projectName: projectName.trim() || "PROJECT",
      sector,
      state,
      projectValue: pv,
      duration: dur,
      permits: preset.permits,
      workers: preset.workers,
      inspections: preset.inspections,
      incidents: preset.incidents,
      siteVisits: preset.siteVisits,
      staffRate: preset.staffRate,
      platformCost: defaultPlatformCost(pv),
      platformCostAuto: true,
    });
  }, [sector, state, projectValue, duration, projectName, onComplete]);

  return (
    <div className="gi-root land-quick">
      <div className="gi-grid" />
      <div className="gi-glow" />
      <div className="gi-vig" />
      <div className="gi-header">
        <div className="gi-logo">QUICK ESTIMATE</div>
        <button type="button" className="gi-back" style={{ position: "static" }} onClick={onBack}>
          ← Back
        </button>
      </div>
      <div className="gi-center">
        <div className="gi-card">
          <div className="gi-title">FOUR QUESTIONS</div>
          <div className="gi-sub">You can tune permits, workforce, and platform cost in the dashboard.</div>
          <div className="gi-fields">
            <div className="gi-field">
              <span className="gi-flabel">PROJECT NAME (OPTIONAL)</span>
              <input
                className="gi-finput gi-finput-text"
                placeholder="PROJECT NAME"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </div>
            <div className="gi-field">
              <span className="gi-flabel">SECTOR</span>
              <div className="gi-btns">
                {Object.entries(PRESETS).map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    className={`gi-sbtn ${sector === k ? "gi-sbtn-ac" : ""}`}
                    onClick={() => setSector(k)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="gi-field">
              <span className="gi-flabel">STATE</span>
              <div className="gi-btns" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                {STATE_ORDER.map((code) => (
                  <button
                    key={code}
                    type="button"
                    className={`gi-sbtn ${state === code ? "gi-sbtn-ac" : ""}`}
                    onClick={() => setState(code)}
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>
            <div className="gi-field">
              <span className="gi-flabel">CONTRACT VALUE ($M AUD)</span>
              <input
                className="gi-finput"
                type="number"
                min={5}
                max={1000}
                value={projectValue}
                onChange={(e) => setProjectValue(e.target.value)}
              />
            </div>
            <div className="gi-field">
              <span className="gi-flabel">DURATION (MONTHS)</span>
              <input
                className="gi-finput"
                type="number"
                min={3}
                max={72}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          </div>
          <div className="gi-insight land-preview">
            <strong>{fmt(preview.total)}</strong> recoverable per year at sector defaults in{" "}
            {STATES[state]?.full || state} (×{STATES[state]?.factor.toFixed(2)}).
          </div>
          <div className="gi-actions">
            <button type="button" className="gi-load" onClick={submit}>
              OPEN DASHBOARD →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
