import { useState, useEffect } from "react";
import prescienceMark from "../assets/width_550.png?inline";
import { hasStoredSession } from "../model/persist.js";

export default function Landing({ onQuick, onGuided, onResume, skipIntro, onSkipIntroChange }) {
  const canResume = hasStoredSession();
  const [on, setOn] = useState(true);
  const [bar, setBar] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setBar(100), 120);
    return () => clearTimeout(t1);
  }, []);

  return (
    <div className={`land-root ${on ? "land-on" : ""}`}>
      <div className="gi-grid" />
      <div className="gi-glow" />
      <div className="gi-vig" />
      <div className="land-sweep" />
      <div className="gi-bar-w land-bar">
        <div className="gi-bar-f land-bar-f" style={{ width: `${bar}%` }} />
      </div>

      <div className="land-inner">
        <img src={prescienceMark} alt="Prescience Technology" className="boot-mark land-mark land-in land-i0" />
        <div className="land-kicker land-in land-i1">Prescience Technology</div>
        <h1 className="land-title land-in land-i2">Novade Field Management</h1>
        <p className="land-lead land-in land-i3">
          ROI calculator for Prescience clients evaluating Novade on site. Rough numbers are fine; refine in the dashboard.
        </p>

        <div className="land-cards">
          <button
            type="button"
            className="land-card land-card-primary land-in land-i4"
            onClick={onQuick}
          >
            <span className="land-card-edge" aria-hidden />
            <span className="land-card-tag">~60 sec</span>
            <span className="land-card-title">Quick estimate</span>
            <span className="land-card-desc">Sector, state, contract size, duration, then explore.</span>
            <span className="land-card-go">Open dashboard →</span>
          </button>
          <button type="button" className="land-card land-in land-i5" onClick={onGuided}>
            <span className="land-card-edge" aria-hidden />
            <span className="land-card-tag">Full story</span>
            <span className="land-card-title">Guided briefing</span>
            <span className="land-card-desc">Step-by-step walkthrough with animated results.</span>
            <span className="land-card-go">Start briefing →</span>
          </button>
          {canResume && (
            <button type="button" className="land-card land-card-resume land-in land-i6" onClick={onResume}>
              <span className="land-card-edge" aria-hidden />
              <span className="land-card-tag">Saved</span>
              <span className="land-card-title">Resume last session</span>
              <span className="land-card-desc">Pick up scenarios and inputs where you left off.</span>
            </button>
          )}
        </div>

        <label className="land-skip land-in land-i7">
          <input
            type="checkbox"
            checked={skipIntro}
            onChange={(e) => onSkipIntroChange(e.target.checked)}
          />
          <span>Skip this screen next time and open straight to the dashboard</span>
        </label>
      </div>
      <div className="gi-footer land-foot">Novade · Prescience Technology · AUD</div>
    </div>
  );
}
