import React, { useState, useEffect, useCallback, useRef, useMemo, Component } from "react";
import prescienceMark from "./assets/width_550.png?inline";
import {
  STATES,
  STATE_ORDER,
  PRESETS,
  DEFAULTS,
  TIPS,
  DEFAULT_SCENARIO_NAMES,
  guessState,
} from "./model/constants.js";
import { MODEL_VERSION } from "./model/assumptions.js";
import { buildExecutiveSummary, buildStorySentence, topSensitivityDrivers } from "./model/summary.js";
import { calc, defaultPlatformCost, buildInputsFromSector } from "./model/calc.js";
import { fmt, scTag } from "./model/format.js";
import { loadSession, saveSession } from "./model/persist.js";
import {
  parseShareHash,
  copyShareUrl,
  explorerStateFromShare,
  explorerStateFromSession,
} from "./model/share.js";
import Landing from "./components/Landing.jsx";
import QuickEstimate from "./components/QuickEstimate.jsx";
import AssumptionsPanel from "./components/AssumptionsPanel.jsx";
import { useViewportFit } from "./useViewportFit.js";

// ============================================================================
// ERROR BOUNDARY — Self-healing, prevents white screen crashes
// ============================================================================
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("[FIELD OPS] Runtime error:", error.message, "\n", info.componentStack); }
  render() {
    if (this.state.hasError) {
      return React.createElement("div", {
        style: { position: "fixed", inset: 0, background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', system-ui, sans-serif", color: "var(--r)", gap: 16 }
      },
        React.createElement("div", { style: { fontSize: 12, letterSpacing: 1, fontWeight: 700 } }, "⚠ SYSTEM ERROR"),
React.createElement("div", { style: { fontSize: 12, color: "rgba(var(--trgb),0.7)", maxWidth: 400, textAlign: "center", lineHeight: 1.8 } }, this.state.error?.message || "Unknown error"),
       React.createElement("button", {
          onClick: () => window.location.reload(),
          style: { marginTop: 8, fontFamily: "'Inter', system-ui, sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 1, padding: "10px 24px", border: "1px solid rgba(var(--grgb),0.25)", background: "rgba(var(--grgb),0.03)", color: GREEN, cursor: "pointer" }
        }, "RESTART →")
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// SHARED PALETTE & CONSTANTS
// ============================================================================
const DARK_PAL = { GREEN: "#00FF87", BLUE: "#2476FF", ORANGE: "#E8560A", YELLOW: "#F0D000", RED: "#F03838", CYAN: "#00BCD4", SILVER: "#94A3B8", AMBER: "#FFB300", VIOLET: "#A78BFA" };
/** Light: same roles as dark — green = primary/success, blue = secondary/info (not swapped). */
const LIGHT_PAL = { GREEN: "#065F46", BLUE: "#2476FF", ORANGE: "#C2410C", YELLOW: "#A16207", RED: "#D62828", CYAN: "#0E7490", SILVER: "#475569", AMBER: "#B45309", VIOLET: "#6D28D9" };
let GREEN = DARK_PAL.GREEN, BLUE = DARK_PAL.BLUE, ORANGE = DARK_PAL.ORANGE, YELLOW = DARK_PAL.YELLOW, RED = DARK_PAL.RED, CYAN = DARK_PAL.CYAN, SILVER = DARK_PAL.SILVER, AMBER = DARK_PAL.AMBER, VIOLET = DARK_PAL.VIOLET;
const scColors = () => [SILVER, AMBER, VIOLET];
function hexToRgbTriplet(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
function applyTheme(t) {
  const p = t === "light" ? LIGHT_PAL : DARK_PAL;
  GREEN = p.GREEN; BLUE = p.BLUE; ORANGE = p.ORANGE; YELLOW = p.YELLOW; RED = p.RED; CYAN = p.CYAN; SILVER = p.SILVER; AMBER = p.AMBER; VIOLET = p.VIOLET;
  if (typeof document !== "undefined") {
    const el = document.documentElement;
    el.classList.toggle("theme-light", t === "light");
    const cssPairs = [
      ["--g", "--grgb", p.GREEN],
      ["--b", "--brgb", p.BLUE],
      ["--c", "--crgb", p.CYAN],
      ["--r", "--rrgb", p.RED],
      ["--y", "--yrgb", p.YELLOW],
      ["--o", "--orgb", p.ORANGE],
      ["--s", "--srgb", p.SILVER],
      ["--a", "--argb", p.AMBER],
      ["--v", "--vrgb", p.VIOLET],
    ];
    for (const [varHex, varRgb, hex] of cssPairs) {
      el.style.setProperty(varHex, hex);
      el.style.setProperty(varRgb, hexToRgbTriplet(hex));
    }
  }
}
const initialTheme = (() => { try { return (typeof localStorage !== "undefined" && localStorage.getItem("fo-theme") === "light") ? "light" : "dark"; } catch (e) { return "dark"; } })();
applyTheme(initialTheme);
const GLYPHS = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const BLOCKS = "░▒▓█";
const PRESERVED = " -/.,$%:·×█░";
const PRESERVED_REVEAL = " -/.,$█░";

const SKIP_LANDING_KEY = "fo-skip-landing";

function resolveInitialAppState() {
  if (typeof window === "undefined") {
    return { phase: "landing", explorerRestore: null };
  }
  const shared = parseShareHash(window.location.hash);
  if (shared) {
    return { phase: "explorer", explorerRestore: explorerStateFromShare(shared) };
  }
  try {
    if (localStorage.getItem(SKIP_LANDING_KEY) === "1") {
      const session = loadSession();
      if (session) {
        return { phase: "explorer", explorerRestore: explorerStateFromSession(session) };
      }
      return { phase: "explorer", explorerRestore: null };
    }
  } catch {
    /* ignore */
  }
  return { phase: "landing", explorerRestore: null };
}

function guidedDataToExplorerRestore(data) {
  const sector = data.sector || "infrastructure";
  const inputs = buildInputsFromSector(sector, data);
  const name = data.projectName || "PROJECT";
  return {
    guidedData: { ...data, ...inputs },
    sector,
    selectedState: data.state || inputs.state,
    inputs,
    projectName: name,
    confirmedName: String(name).toUpperCase(),
    scenarios: [null, null, null],
    scenarioNames: [...DEFAULT_SCENARIO_NAMES],
  };
}

function calcInputsFromGuided(data) {
  const sector = data.sector || "infrastructure";
  return buildInputsFromSector(sector, data);
}

const SHORTCUTS = [
  ["1–5", "Switch sector preset"], ["R", "Reset all to defaults"], ["← →", "Switch Analysis / Compare"],
  ["A / B / C", "Pin scenario 1 / 2 / 3"], ["↑ ↓", "Fine-adjust focused slider"], ["N", "New analysis"],
  ["/", "Hold for shortcuts"], ["ESC", "Close panels / blur"],
];

// ============================================================================
// SCRAMBLE
// ============================================================================
function Scramble({ text, duration = 400, trigger }) {
  const scrambleText = (t, progress) => {
    const len = t.length; let r = "";
    const resolved = Math.floor(progress * len);
    for (let i = 0; i < len; i++) { if (i < resolved) r += t[i]; else if (PRESERVED.includes(t[i])) r += t[i]; else r += GLYPHS[Math.floor(Math.random() * GLYPHS.length)]; }
    return r;
  };
  const [display, setDisplay] = useState(() => trigger > 0 ? scrambleText(text, 0) : text);
  const raf = useRef(null);
  // Initialize to trigger-1 when active so first mount sees a difference and animates
  const prevTrigger = useRef(trigger > 0 ? trigger - 1 : trigger);
  const prevText = useRef(text);

  useEffect(() => {
    // Text changed without trigger change — just update
    if (trigger === prevTrigger.current && text !== prevText.current) { prevText.current = text; setDisplay(text); return; }
    if (trigger === prevTrigger.current) return;
    prevTrigger.current = trigger; prevText.current = text;
    setDisplay(scrambleText(text, 0));
    const target = text, dur = duration, start = performance.now();
    function tick(now) {
      const p = Math.min((now - start) / dur, 1);
      setDisplay(scrambleText(target, p));
      if (p < 1) raf.current = requestAnimationFrame(tick); else setDisplay(target);
    }
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [text, duration, trigger]);
  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{display}</span>;
}

function NameEditor({ value, onCommit, className, style }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const commit = () => onCommit(draft.trim() || value);
  return (
    <input className={className} style={style} type="text" value={draft} maxLength={20}
      autoFocus onChange={e => setDraft(e.target.value)} onFocus={e => e.target.select()}
      onBlur={commit} onKeyDown={e => {
        if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === "Escape") { setDraft(value); e.currentTarget.blur(); }
      }} />
  );
}

function useFieldScramble() {
  const raf = useRef(null);
  const run = useCallback((val, setVal, onDone) => {
    if (!val) { onDone && onDone(); return; }
    const target = String(val), len = target.length, dur = 350, start = performance.now();
    function tick(now) {
      const p = Math.min((now - start) / dur, 1), resolved = Math.floor(p * len);
      let r = "";
      for (let i = 0; i < len; i++) { if (i < resolved) r += target[i]; else if (PRESERVED.includes(target[i])) r += target[i]; else r += GLYPHS[Math.floor(Math.random() * GLYPHS.length)]; }
      setVal(r);
      if (p < 1) raf.current = requestAnimationFrame(tick); else { setVal(target); onDone && onDone(); }
    }
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
  }, []);
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);
  return run;
}

// Typewriter — onDone stored in ref to prevent re-trigger
function Typewriter({ text, speed = 25, delay = 0, onDone }) {
  const [display, setDisplay] = useState("");
  const [started, setStarted] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  useEffect(() => { const t = setTimeout(() => setStarted(true), delay); return () => clearTimeout(t); }, [delay]);
  useEffect(() => {
    if (!started) return;
    let i = 0;
    const iv = setInterval(() => { i++; setDisplay(text.slice(0, i)); if (i >= text.length) { clearInterval(iv); onDoneRef.current && onDoneRef.current(); } }, speed);
    return () => clearInterval(iv);
  }, [started, text, speed]);
  return <span>{display}<span style={{ color: GREEN, animation: "blink 0.7s step-end infinite" }}>{display.length < text.length && started ? "▌" : ""}</span></span>;
}

// ============================================================================
// STATE GRID — box-only selector. Hover-dwell auto-confirms, click locks.
// Timezone-guess highlighted; arrow keys + Enter fully supported.
// ============================================================================
function StateGrid({ value, onChange, onConfirm, locked }) {
  const guess = useMemo(() => guessState(), []);
  const [hovered, setHovered] = useState(value || guess);
  const [interacted, setInteracted] = useState(false);
  const btnRefs = useRef({});
  const COLS = 2;

  // Keep hover in sync when value changes externally (but not while locked)
  useEffect(() => { if (value && !locked) setHovered(value); }, [value, locked]);

  // Hover is preview-only — selection changes on click / Enter, never on hover.
  const preview = useCallback((code) => {
    setHovered(code);
    if (!locked) setInteracted(true);
  }, [locked]);

  const confirm = useCallback((code) => {
    setHovered(code); setInteracted(true); onChange(code);
    onConfirm && onConfirm(code);
  }, [onChange, onConfirm]);

  const onGridKeyDown = useCallback((e, idx) => {
    const dirs = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLS, ArrowDown: COLS };
    if (e.key in dirs) {
      e.preventDefault();
      const next = Math.max(0, Math.min(STATE_ORDER.length - 1, idx + dirs[e.key]));
      if (btnRefs.current[next]) { btnRefs.current[next].focus(); setHovered(STATE_ORDER[next]); }
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      confirm(STATE_ORDER[idx]);
    }
  }, [confirm, COLS]);

  const stat = STATES[hovered];

  return (
    <div data-stategrid style={{ width: "100%", opacity: locked ? 0.92 : 1 }}>
      <div style={{
        display: "grid", gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: 8,
      }}>
        {STATE_ORDER.map((code, idx) => {
          const isGuess = !interacted && code === guess;
          const isHovered = hovered === code;
          const isConfirmed = locked && code === value;
          const faded = locked && code !== value && !isHovered;
          const s = STATES[code];
          return (
            <button key={code} type="button"
              ref={el => btnRefs.current[idx] = el}
              tabIndex={0}
              aria-pressed={isConfirmed || isHovered}
              onMouseEnter={() => preview(code)}
              onFocus={() => preview(code)}
              onClick={() => confirm(code)}
              onKeyDown={(e) => onGridKeyDown(e, idx)}
              style={{
                position: "relative", overflow: "hidden", cursor: "pointer",
                fontFamily: "'Inter', system-ui, sans-serif",
                border: `1px solid ${isConfirmed ? GREEN : isHovered ? "rgba(var(--grgb),0.85)" : isGuess ? "rgba(var(--grgb),0.35)" : "rgba(var(--trgb),0.08)"}`,
                background: isHovered || isConfirmed ? "rgba(var(--grgb),0.10)" : isGuess ? "rgba(var(--grgb),0.04)" : "rgba(var(--trgb),0.02)",
                boxShadow: isHovered || isConfirmed ? "0 0 20px rgba(var(--grgb),0.22), inset 0 0 18px rgba(var(--grgb),0.06)" : "none",
                padding: "12px 14px", textAlign: "left", color: "inherit", minHeight: 64,
                display: "flex", flexDirection: "column", gap: 4,
                opacity: faded ? 0.5 : 1,
                transition: "all 0.16s ease", outline: "none",
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 4 }}>
                <span style={{
                  fontSize: 20, fontWeight: 700, letterSpacing: 2, lineHeight: 1,
                  fontFamily: "'Inter', system-ui, sans-serif",
                  color: isHovered || isConfirmed ? GREEN : isGuess ? "rgba(var(--grgb),0.75)" : "rgba(var(--trgb),0.85)",
                  transition: "color 0.16s",
                }}>{code}</span>
                {isGuess && (
                  <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1, color: "rgba(var(--grgb),0.85)", border: "1px solid rgba(var(--grgb),0.25)", padding: "2px 5px", borderRadius: 2, whiteSpace: "nowrap" }}>DETECTED</span>
                )}
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 1, lineHeight: 1.4, color: "rgba(var(--trgb),0.72)" }}>{s.full}</span>
              <span style={{ fontSize: 10, letterSpacing: 1, fontWeight: 700, fontFamily: "'Inter', system-ui, sans-serif", color: s.factor > 1 ? GREEN : s.factor < 1 ? "rgba(var(--crgb),0.85)" : "rgba(var(--trgb),0.6)" }}>×{s.factor.toFixed(2)} BENCHMARK</span>
              {isConfirmed && (
                <span style={{ position: "absolute", top: 8, right: 11, fontSize: 10, color: GREEN, fontWeight: 700 }}>▸</span>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 11, letterSpacing: 1, color: locked ? GREEN : "rgba(var(--trgb),0.6)", fontWeight: 600 }}>
          {`> ${stat.full}`}
          {stat.factor !== 1 && <span style={{ marginLeft: 8, color: "rgba(var(--trgb),0.7)", fontSize: 11 }}>x{stat.factor.toFixed(2)} BENCHMARK</span>}
        </span>
        <span style={{ fontSize: 10, letterSpacing: 1, color: "rgba(var(--trgb),0.5)" }}>
          {locked ? "LOCKED - CLICK ANY STATE TO CHANGE" : !interacted ? "SUGGESTED FROM TIMEZONE - CLICK TO CONFIRM" : "CLICK TO CONFIRM - HOVER TO PREVIEW"}
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// ACT 0 — FIELD BRIEF MINI-BOOT
// ============================================================================
function MiniBoot({ onComplete }) {
  const [lines, setLines] = useState([]);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const timers = useRef([]);
  const LINES = useMemo(() => [
    { t: "INITIALIZING INPUT MATRIX...", d: 350 },
    { t: "LOADING SECTOR BENCHMARKS ████████ OK", d: 300 },
    { t: "PROJECT CONFIGURATION READY", d: 400 },
  ], []);
  useEffect(() => {
    let acc = 500;
    LINES.forEach((line, i) => {
      const id = setTimeout(() => {
        setLines(p => [...p, { text: line.t, idx: i }]);
        setProgress(Math.round(((i + 1) / LINES.length) * 100));
        if (i === LINES.length - 1) { timers.current.push(setTimeout(() => setReady(true), 300)); timers.current.push(setTimeout(() => onComplete(), 700)); }
      }, acc);
      timers.current.push(id);
      acc += line.d;
    });
    return () => timers.current.forEach(clearTimeout);
  }, [LINES, onComplete]);
  return (
    <div className="boot mini-boot"><div className="boot-grid" /><div className="boot-glow" /><div className="boot-c">
      <img src={prescienceMark} alt="Prescience" className="boot-mark" />
      <div className="boot-logo" style={{ fontSize: 18 }}><Scramble text="FIELD BRIEF" duration={600} trigger={1} /></div>
      <div className="boot-sub"><Scramble text="PROJECT CONFIGURATION" duration={500} trigger={1} /></div>
      <div className="boot-term" style={{ maxHeight: 140 }}>
        {lines.map(l => (<div key={l.idx} className={`boot-ln ${l.text.includes("READY") ? "boot-ok" : ""}`}><span className="boot-gt">›</span> <Scramble text={l.text} duration={l.text.includes("READY") ? 600 : 400} trigger={l.idx + 20} /></div>))}
        {!ready && lines.length > 0 && <span className="boot-cur">_</span>}
      </div>
      <div className="boot-bar-w"><div className="boot-bar-t"><div className="boot-bar-f" style={{ width: `${progress}%` }} /></div><span className="boot-pct">{progress}%</span></div>
      {ready && <div className="boot-rdy">▸ READY</div>}
    </div></div>
  );
}

// ============================================================================
// ACT 1 — GUIDED INPUT
// ============================================================================
const STEPS = [
  { id: "name", title: "PROJECT IDENTITY", sub: "What is this project called?", fields: [{ key: "projectName", type: "text", placeholder: "PROJECT NAME" }], insight: (v) => `PROJECT REGISTERED - ${(v.projectName || "PROJECT").toUpperCase()}. Analysis pipeline calibrated.` },
  { id: "sector", title: "SECTOR PROFILE", sub: "What type of construction?", fields: [{ key: "sector", type: "buttons" }], insight: (v) => `${(PRESETS[v.sector]?.label || "SECTOR")} benchmarks loaded. Parameters applied.` },
  { id: "state", title: "BASE OF OPERATIONS", sub: "Where is this project based? Just hover - no clicks needed.", fields: [{ key: "state", type: "state-map" }], insight: (v) => `${STATES[v.state || "NSW"].full} locked in - regional factor x${STATES[v.state || "NSW"].factor.toFixed(2)} applied.` },
  { id: "scope", title: "PROJECT SCOPE", sub: "Define the contract parameters.", fields: [{ key: "projectValue", type: "number", label: "CONTRACT VALUE ($M AUD)", placeholder: "150" }, { key: "duration", type: "number", label: "DURATION (MONTHS)", placeholder: "24" }], insight: (v) => `$${v.projectValue || 150}M over ${v.duration || 24} months. Scope model scaled.` },
  { id: "ops", title: "OPERATIONAL VOLUME", sub: "Quantify field activity.", fields: [{ key: "permits", type: "number", label: "PERMITS / MONTH", placeholder: "500" }, { key: "inspections", type: "number", label: "INSPECTIONS / YEAR", placeholder: "1000" }, { key: "workers", type: "number", label: "WORKFORCE SIZE", placeholder: "500" }, { key: "staffRate", type: "number", label: "STAFF RATE ($/HR)", placeholder: "155" }], insight: (v) => `Operational profile mapped against sector baselines.` },
  { id: "risk", title: "RISK & LOGISTICS", sub: "Final parameters.", fields: [{ key: "incidents", type: "number", label: "INCIDENTS / YEAR", placeholder: "100" }, { key: "siteVisits", type: "number", label: "SITE VISITS / MONTH", placeholder: "80" }], insight: (v) => `Risk profile complete. All variables captured.` },
];

function GuidedInput({ onComplete }) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState({ projectName: "", sector: "infrastructure", state: guessState(), projectValue: "", duration: "", permits: "", inspections: "", workers: "", staffRate: "", incidents: "", siteVisits: "" });
  const [displayValues, setDisplayValues] = useState({});
  const [showInsight, setShowInsight] = useState(false);
  const [insightDone, setInsightDone] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const inputRefs = useRef({});
  const scramble = useFieldScramble();
  const insightDoneRef = useRef(false);
  // Frozen copy of values at the moment insight reveals - stops the
  // Typewriter text changing underneath itself when inputs keep editing.
  const [insightSnap, setInsightSnap] = useState(null);
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const pendingSnap = useRef(null);

  const current = STEPS[step];
  const progress = ((step + (showInsight ? 1 : 0)) / STEPS.length) * 100;
  const isLast = step === STEPS.length - 1;

  // Snapshot values when insight shows or re-reveals (state re-pick while
  // locked), clear when it hides. Overrides fix the setState-batching race
  // where onChange + onConfirm fire in the same tick (state click, sector pick).
  const [snapTick, setSnapTick] = useState(0);
  useEffect(() => {
    if (showInsight) {
      setInsightSnap({ ...valuesRef.current, ...(pendingSnap.current || {}) });
      pendingSnap.current = null;
    } else {
      setInsightSnap(null);
    }
  }, [showInsight, snapTick]);

  const revealInsight = useCallback((override) => {
    pendingSnap.current = override || null;
    setSnapTick(t => t + 1);
    setShowInsight(true);
    insightDoneRef.current = false;
  }, []);

  useEffect(() => {
    if (showInsight) return;
    setTimeout(() => {
      const f = current.fields[0];
      if (!f || f.type === "buttons" || f.type === "state-map") return;
      if (inputRefs.current[f.key]) inputRefs.current[f.key].focus();
    }, 150);
  }, [step, current, showInsight]);

  const scrambleField = useCallback((key) => {
    const val = values[key];
    if (!val) return;
    const display = key === "projectName" ? String(val).toUpperCase() : String(val);
    setDisplayValues(p => ({ ...p, [key]: display }));
    scramble(display, (v) => setDisplayValues(p => ({ ...p, [key]: v })), () => {
      setDisplayValues(p => { const n = { ...p }; delete n[key]; return n; });
    });
  }, [values, scramble]);

  const confirmField = useCallback((fieldIdx) => {
    const f = current.fields[fieldIdx];
    if (!f || showInsight) return;
    if (f.type !== "state-map") scrambleField(f.key);
    const nextIdx = fieldIdx + 1;
    if (nextIdx < current.fields.length) {
      setTimeout(() => {
        const nf = current.fields[nextIdx];
        if (nf && inputRefs.current[nf.key]) inputRefs.current[nf.key].focus();
      }, 50);
    } else {
      revealInsight();
    }
  }, [current, scrambleField, showInsight, revealInsight]);

  const confirmStep = useCallback(() => {
    if (showInsight) return;
    current.fields.forEach((f) => { if (f.type !== "buttons" && f.type !== "state-map") scrambleField(f.key); });
    revealInsight();
  }, [current, scrambleField, showInsight, revealInsight]);

  const nextStep = useCallback(() => {
    if (isLast) { setShowLoad(true); return; }
    setShowInsight(false); setInsightDone(false); insightDoneRef.current = false;
    setStep(s => s + 1);
  }, [isLast]);

  const goBack = useCallback(() => {
    if (step === 0) return;
    setShowInsight(false); setInsightDone(false); insightDoneRef.current = false; setShowLoad(false);
    setStep(s => s - 1);
  }, [step]);

  const handleInsightDone = useCallback(() => { setInsightDone(true); insightDoneRef.current = true; }, []);

  const handleLoad = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setFadeOut(true);
      setTimeout(() => {
        const sec = values.sector || "infrastructure";
        const st = values.state || guessState();
        onComplete({
          projectName: values.projectName || "PROJECT", sector: sec, state: st,
          projectValue: Number(values.projectValue) || 150, duration: Number(values.duration) || 24,
          permits: Number(values.permits) || PRESETS[sec].permits, inspections: Number(values.inspections) || PRESETS[sec].inspections,
          workers: Number(values.workers) || PRESETS[sec].workers, staffRate: Number(values.staffRate) || PRESETS[sec].staffRate,
          incidents: Number(values.incidents) || PRESETS[sec].incidents, siteVisits: Number(values.siteVisits) || PRESETS[sec].siteVisits,
          platformCost: defaultPlatformCost(Number(values.projectValue) || 150),
          platformCostAuto: true,
        });
      }, 600);
    }, 1200);
  }, [values, onComplete]);

  useEffect(() => {
    const down = (e) => {
      if (e.key === "Enter") {
        // State grid buttons handle Enter natively (arrow-key nav lives there too).
        if (!showInsight && current.id === "state") return;
        e.preventDefault();
        if (showLoad && !loading) { handleLoad(); return; }
        if (showInsight && insightDoneRef.current) { nextStep(); return; }
        if (!showInsight) {
          const activeKey = Object.keys(inputRefs.current).find(k => inputRefs.current[k] === document.activeElement);
          if (activeKey) {
            const idx = current.fields.findIndex(f => f.key === activeKey);
            if (idx >= 0) { document.activeElement.blur(); confirmField(idx); return; }
          }
          confirmStep();
        }
      }
      if (e.key === "ArrowLeft" && !document.activeElement?.matches("input") && !document.activeElement?.closest("[data-stategrid]")) { e.preventDefault(); goBack(); }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [showInsight, showLoad, loading, handleLoad, nextStep, confirmStep, confirmField, goBack, current]);

  const getDisplayVal = (key) => displayValues[key] !== undefined ? displayValues[key] : values[key];

  return (
    <div className={`gi-root ${fadeOut ? "gi-fade" : ""}`}>
      <div className="gi-grid" /><div className="gi-glow" /><div className="gi-vig" />
      <div className="gi-bar-w"><div className="gi-bar-f" style={{ width: `${progress}%` }} /></div>
      <div className="gi-center">
        {step > 0 && !showLoad && <button className="gi-back" onClick={goBack}>← BACK</button>}
        <div className="gi-card" key={step}>
          <div className="gi-title"><Scramble text={current.title} duration={400} trigger={step + 1} /></div>
          <div className="gi-sub">{current.sub}</div>
          <div className="gi-fields">
            {current.fields.map((f) => {
              if (f.type === "state-map") return (
                <StateGrid key={f.key} value={values.state} locked={showInsight}
                  onChange={code => setValues(p => ({ ...p, state: code }))}
                  onConfirm={(code) => revealInsight({ state: code })} />
              );
              if (f.type === "buttons") return (
                <div key={f.key} className="gi-btns">
                  {Object.entries(PRESETS).map(([k, v]) => (
                    <button key={k} className={`gi-sbtn ${values.sector === k ? "gi-sbtn-ac" : ""}`}
                      disabled={showInsight}
                      style={showInsight ? { opacity: values.sector === k ? 1 : 0.45, cursor: "default" } : undefined}
                      onClick={() => { if (showInsight) return; setValues(p => ({ ...p, sector: k })); setTimeout(() => revealInsight({ sector: k }), 150); }}>{v.label}</button>
                  ))}
                </div>
              );
              if (f.type === "text") return (
                <div key={f.key} className="gi-field">
                  <input ref={el => inputRefs.current[f.key] = el} className="gi-finput gi-finput-text"
                    type="text" placeholder={f.placeholder} value={getDisplayVal(f.key)}
                    disabled={showInsight}
                    onChange={e => { setValues(p => ({ ...p, [f.key]: e.target.value })); setDisplayValues(p => { const n = { ...p }; delete n[f.key]; return n; }); }}
                    onBlur={() => scrambleField(f.key)} maxLength={35} autoComplete="off" />
                </div>
              );
              return (
                <div key={f.key} className="gi-field">
                  <label className="gi-flabel">{f.label}</label>
                  <input ref={el => inputRefs.current[f.key] = el} className="gi-finput"
                    type="text" inputMode="numeric" pattern="[0-9]*" placeholder={f.placeholder} value={getDisplayVal(f.key)}
                    disabled={showInsight}
                    onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ""); setValues(p => ({ ...p, [f.key]: v })); setDisplayValues(p => { const n = { ...p }; delete n[f.key]; return n; }); }}
                    onBlur={() => scrambleField(f.key)} autoComplete="off" />
                </div>
              );
            })}
          </div>
          {showInsight && <div className="gi-insight"><Typewriter key={`${step}-insight-${(insightSnap || values).state}`} text={current.insight(insightSnap || values)} speed={14} delay={100} onDone={handleInsightDone} /></div>}
        </div>
        <div className="gi-actions">
          {!showInsight && (current.fields[0].type === "text" || current.fields[0].type === "number") && <button className="gi-next" onClick={confirmStep}>CONFIRM ↵</button>}
          {showInsight && insightDone && !showLoad && <button className="gi-next gi-next-go" onClick={nextStep}>{isLast ? "ALL DATA CAPTURED" : "NEXT →"}</button>}
          {showLoad && !loading && <button className="gi-load" onClick={handleLoad}><Scramble text="LOAD" duration={400} trigger={99} /></button>}
          {loading && <div className="gi-loading"><div className="gi-loading-bar"><div className="gi-loading-fill" /></div><span className="gi-loading-txt">PROCESSING</span></div>}
        </div>
      </div>
      <div className="gi-footer">Field brief · project configuration</div>
    </div>
  );
}

// ============================================================================
// ACT 2 — REVEAL (static terminal layout, dim placeholders activate sequentially)
// ============================================================================
function Reveal({ data, results, onExplore }) {
  const [activeLines, setActiveLines] = useState([]);
  const [allDone, setAllDone] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const timers = useRef([]);

  const r = results;
  const name = (data.projectName || "PROJECT").toUpperCase();
  const stateCode = data.state || "NSW";
  const tier = r.neg ? "neg" : (r.total > 12000000 && r.roiX > 25) ? "anomalous" : r.roiX >= 20 ? "elite" : r.roiX >= 10 ? "strong" : r.roiX >= 5 ? "good" : "low";
  const accent = { anomalous: VIOLET, elite: GREEN, strong: GREEN, good: BLUE, low: YELLOW, neg: RED }[tier];
  const tierLabel = { anomalous: "ANOMALOUS", elite: "EXCEPTIONAL", strong: "STRONG RETURN", good: "SOLID RETURN", low: "MODERATE RETURN", neg: "COST EXCEEDS VALUE" }[tier];

  const METRICS = useMemo(() => [
    { label: "RECOVERABLE VALUE", value: fmt(r.total), color: accent, barLen: 14, dur: 900 },
    { label: "ROI MULTIPLE", value: `${r.roiX}x`, color: r.roiX >= 10 ? GREEN : r.roiX >= 5 ? BLUE : r.neg ? RED : YELLOW, barLen: 10, dur: 650 },
    { label: "PAYBACK PERIOD", value: `${r.payback}mo`, color: r.payback <= 2 ? GREEN : r.payback <= 4 ? BLUE : YELLOW, barLen: 10, dur: 650 },
    { label: "HOURS SAVED", value: r.hrs.toLocaleString(), color: r.hrs > 5000 ? GREEN : r.hrs > 2000 ? BLUE : ORANGE, barLen: 10, dur: 650 },
    { label: "NET SAVINGS", value: fmt(r.net), color: r.neg ? RED : GREEN, barLen: 10, dur: 650 },
    { label: "COST OF INACTION", value: `${fmt(r.dailyLoss)}/DAY`, color: RED, barLen: 10, dur: 650 },
  ], [r, accent]);

  useEffect(() => {
    const firstDelay = 800;
    const interval = 420;
    METRICS.forEach((m, i) => {
      timers.current.push(setTimeout(() => setActiveLines(p => [...p, i]), firstDelay + i * interval));
    });
    const lastStart = firstDelay + (METRICS.length - 1) * interval;
    timers.current.push(setTimeout(() => setAllDone(true), lastStart + METRICS[METRICS.length - 1].dur + 600));
    return () => timers.current.forEach(clearTimeout);
  }, [METRICS]);

  const handleExplore = useCallback(() => { setFadeOut(true); setTimeout(() => onExplore(), 500); }, [onExplore]);

  return (
    <div className={`rv-root ${fadeOut ? "rv-fade" : ""}`}>
      <div className="rv-grid" /><div className="rv-vig" />
      <div className="rv-wrap">
        <div className="rv-header-row">
          <span className="rv-proj" style={{ color: accent }}><Scramble text={name} duration={600} trigger={1} /></span>
          <span className="rv-tier" style={{ color: accent }}>{tierLabel}</span>
        </div>
        <div className="rv-sub">ANALYSIS RESULTS · {STATES[stateCode].full} · ×{STATES[stateCode].factor.toFixed(2)} ADJUSTED</div>
        <div className="rv-term">
          {METRICS.map((m, i) => (
            <RevealTermLine key={i} active={activeLines.includes(i)} label={m.label} value={m.value} color={m.color} barLen={m.barLen} dur={m.dur} isHero={i === 0} />
          ))}
        </div>
        <div className="rv-btn-slot">
          {allDone && <button className="rv-enter" onClick={handleExplore}>OPEN DASHBOARD →</button>}
        </div>
      </div>
    </div>
  );
}

function RevealTermLine({ active, label, value, color, barLen, dur, isHero }) {
  const [barFill, setBarFill] = useState(0);
  const [ok, setOk] = useState(false);
  const [display, setDisplay] = useState("---");
  const [resolved, setResolved] = useState(false);
  const raf = useRef(null);
  const dormant = !active && !resolved;

  useEffect(() => {
    if (!active) return;
    const start = performance.now(), target = value;
    function tick(now) {
      const p = Math.max(0, Math.min((now - start) / dur, 1));
      setBarFill(Math.max(0, Math.floor(p * barLen)));
      const len = target.length;
      let r = "";
      for (let i = 0; i < len; i++) { if (PRESERVED_REVEAL.includes(target[i])) r += target[i]; else r += GLYPHS[Math.floor(Math.random() * GLYPHS.length)]; }
      setDisplay(r);
      if (p < 1) { raf.current = requestAnimationFrame(tick); }
      else {
        setBarFill(barLen); setOk(true);
        const rS = performance.now(), rD = 400;
        function rT(n2) {
          const rp = Math.min((n2 - rS) / rD, 1), res = Math.floor(rp * len);
          let rv = "";
          for (let i = 0; i < len; i++) { if (i < res) rv += target[i]; else if (PRESERVED_REVEAL.includes(target[i])) rv += target[i]; else rv += GLYPHS[Math.floor(Math.random() * GLYPHS.length)]; }
          setDisplay(rv);
          if (rp < 1) raf.current = requestAnimationFrame(rT); else { setDisplay(target); setResolved(true); }
        }
        raf.current = requestAnimationFrame(rT);
      }
    }
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [active, value, barLen, dur]);

  const bf = Math.max(0, Math.min(barLen, barFill));
  const blocks = dormant ? "░".repeat(barLen) : ("█".repeat(bf) + "░".repeat(Math.max(0, barLen - bf)));

  return (
    <div className={`rv-tl ${isHero ? "rv-tl-hero" : ""}`}>
      <span className="rv-tl-gt" style={{ color: dormant ? "rgba(var(--trgb),0.06)" : `${color}55` }}>›</span>
      <span className="rv-tl-label" style={dormant ? { color: "rgba(var(--trgb),0.15)" } : undefined}>{label}</span>
      <span className="rv-tl-bar" style={{ color: dormant ? "rgba(var(--trgb),0.05)" : `${color}${ok ? "BB" : "55"}` }}>{blocks}</span>
      <span className="rv-tl-ok" style={{ color: ok ? color : "transparent", visibility: ok || dormant ? "visible" : "hidden" }}>{ok ? "OK" : "--"}</span>
      <span className="rv-tl-val" style={{
        color: resolved ? color : dormant ? "rgba(var(--trgb),0.07)" : "rgba(var(--trgb),0.3)",
        textShadow: resolved ? `0 0 12px ${color}25` : "none", fontSize: isHero ? 18 : 14
      }}>{display}</span>
    </div>
  );
}

// ============================================================================
// FIELD OPS BOOT
// ============================================================================
function Boot({ onComplete }) {
  const [lines, setLines] = useState([]);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const timers = useRef([]);
  const LINES = useMemo(() => [
    { t: "INITIALIZING ROI ENGINE...", d: 400 }, { t: "LOADING INDUSTRY BENCHMARKS ██████████ OK", d: 380 },
    { t: "LOADING DEPLOYMENT DATA █████████ OK", d: 360 }, { t: "CALIBRATING SAVINGS MODELS .......... READY", d: 340 },
    { t: "DATA INTEGRITY ████████████████ PASS", d: 380 }, { t: "SYSTEM OPERATIONAL", d: 550 },
  ], []);
  useEffect(() => {
    let acc = 600;
    LINES.forEach((line, i) => {
      const id = setTimeout(() => {
        setLines(p => [...p, { text: line.t, idx: i }]);
        setProgress(Math.round(((i + 1) / LINES.length) * 100));
        if (i === LINES.length - 1) { timers.current.push(setTimeout(() => setReady(true), 400)); timers.current.push(setTimeout(() => onComplete(), 1000)); }
      }, acc);
      timers.current.push(id); acc += line.d;
    });
    return () => timers.current.forEach(clearTimeout);
  }, [LINES, onComplete]);
  return (
    <div className="boot"><div className="boot-grid" /><div className="boot-glow" /><div className="boot-c">
      <img src={prescienceMark} alt="Prescience" className="boot-mark" />
      <div className="boot-logo"><Scramble text="NOVADE" duration={800} trigger={1} /></div>
      <div className="boot-sub"><Scramble text="FIELD MANAGEMENT · ROI" duration={600} trigger={1} /></div>
      <div className="boot-term">{lines.map(l => (<div key={l.idx} className={`boot-ln ${l.text.includes("OPERATIONAL") ? "boot-ok" : ""}`}><span className="boot-gt">›</span> <Scramble text={l.text} duration={l.text.includes("OPERATIONAL") ? 800 : 550} trigger={l.idx + 10} /></div>))}{!ready && lines.length > 0 && <span className="boot-cur">_</span>}</div>
      <div className="boot-bar-w"><div className="boot-bar-t"><div className="boot-bar-f" style={{ width: `${progress}%` }} /></div><span className="boot-pct">{progress}%</span></div>
      {ready && <div className="boot-rdy">▸ LAUNCHING</div>}
    </div></div>
  );
}

// ============================================================================
// SHARED COMPONENTS
// ============================================================================
function Tip({ text, children }) { const [show, setShow] = useState(false); return (<span className="tip-w" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onClick={e => { e.stopPropagation(); setShow(!show); }}>{children}{show && <span className="tip-b">{text}</span>}</span>); }

function ScenarioStrip({
  scenarios,
  scenarioNames,
  scenarioNameScrambles,
  slotFlash,
  editingScenario,
  editingAt,
  editSlot,
  onSave,
  onLoad,
  onClear,
  onStartEdit,
  onFinishEdit,
  className = "",
  bootClass = "",
}) {
  return (
    <div className={`scenario-panel ${className} ${bootClass}`.trim()}>
      <div className="sp-h"><span className="sl">Scenarios</span></div>
      <div className="sp-slots">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`slot3 ${scenarios[i] ? "slot3-saved" : ""} ${slotFlash === i ? "slot-flash" : ""}`}>
            <div className="slot3-top">
              {editingScenario === i && editingAt === editSlot ? (
                <NameEditor key={`slot-edit-${i}-${editSlot}`} className="slot3-name-edit" value={scenarioNames[i]} onCommit={(v) => onFinishEdit(i, v)} />
              ) : (
                <span className="slot3-name" onClick={() => onStartEdit(i, editSlot)} title="Rename">
                  {scenarios[i] ? "●" : "◌"} <Scramble text={scenarioNames[i]} duration={350} trigger={scenarioNameScrambles[i]} />
                </span>
              )}
            </div>
            <div className="slot3-actions">
              <button type="button" className="slot3-btn" onClick={() => onSave(i)}>{slotFlash === i ? "✓" : "Pin"}</button>
              {scenarios[i] && <button type="button" className="slot3-btn slot3-load" onClick={() => onLoad(i)}>Load</button>}
              {scenarios[i] && <button type="button" className="slot3-btn slot3-clear" onClick={() => onClear(i)} title="Unsave">✕</button>}
            </div>
          </div>
        ))}
      </div>
      <p className="slot3-hint sp-hint">Pin inputs here, then use Compare to diff scenarios.</p>
    </div>
  );
}

function BreakdownDetail({ color, rows, highlight, scr, title }) {
  return (
    <div
      className="bds-detail bds-detail-inline"
      style={{
        borderColor: `${color}45`,
        background: `linear-gradient(180deg, ${color}0c 0%, rgba(var(--trgb),0.02) 100%)`,
        ["--bds-accent"]: color,
      }}
    >
      <div className="bds-detail-hdr">
        <span className="bds-detail-title" style={{ color }}>{title}</span>
      </div>
      {highlight && <p className="bds-detail-hl" style={{ color }}>{highlight}</p>}
      <div className="bds-detail-rows" style={{ ["--bds-rows"]: rows.length }}>
        {rows.map(([n, v, note], i) => (
          <div key={i} className="bd-r">
            <span className="bd-rn">{n}<span className="bd-rno">{note}</span></span>
            <span className="bd-rv" style={{ color: `${color}CC` }}><Scramble text={`$${v.toLocaleString()}`} duration={280} trigger={scr} /></span>
          </div>
        ))}
      </div>
    </div>
  );
}
function Num({ value, prefix = "$" }) {
  const cur = useRef(value);
  const target = useRef(value);
  const raf = useRef(null);
  const [display, setDisplay] = useState(value);
  target.current = value;

  useEffect(() => {
    function tick() {
      const t = target.current, c = cur.current, diff = t - c;
      const abs = Math.abs(diff);
      // Snap when close enough (proportional to magnitude)
      if (abs < Math.max(1, Math.abs(t) * 0.0005)) { cur.current = t; setDisplay(t); raf.current = null; return; }
      // Near digit-count boundaries (powers of 10), spring faster to avoid flutter
      const magnitude = Math.abs(c);
      const boundaries = [100000, 1000000, 10000000, 100000000];
      let factor = 0.18;
      for (const b of boundaries) {
        if (magnitude > b * 0.97 && magnitude < b * 1.03) { factor = 0.45; break; }
      }
      cur.current += diff * factor;
      setDisplay(Math.round(cur.current));
      raf.current = requestAnimationFrame(tick);
    }
    if (!raf.current) raf.current = requestAnimationFrame(tick);
    return () => {};
  }, [value]);

  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current); }, []);

  const neg = display < 0, a = Math.abs(display);
  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{neg ? "−" : ""}{prefix}{a.toLocaleString()}</span>;
}
function LiveCost({ perDay }) { const [val, setVal] = useState(perDay); const base = useRef(perDay); const startTime = useRef(Date.now()); const perMs = perDay / (8 * 3600 * 1000); useEffect(() => { base.current = perDay; startTime.current = Date.now(); }, [perDay]); useEffect(() => { let raf; function tick() { setVal(base.current + Math.round((Date.now() - startTime.current) * perMs)); raf = requestAnimationFrame(tick); } raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [perMs]); return <span>${val.toLocaleString()}</span>; }

// ============================================================================
// HERO BOOT VALUE — blocky bar fills → scramble resolves → switches to live Num
// ============================================================================
function HeroVal({ value, color, trigger }) {
  const [display, setDisplay] = useState("");
  const [isLive, setIsLive] = useState(false);
  const [sweep, setSweep] = useState(false);
  const bootRaf = useRef(null);
  const DIGITS = "0123456789";
  const randDigit = () => DIGITS[Math.floor(Math.random() * 10)];
  const scrambleStr = (t) => t.split("").map(c => /\d/.test(c) ? randDigit() : c).join("");

  // Boot: digit scramble → left-to-right resolve → underline sweep → live
  useEffect(() => {
    if (trigger === 0) return;
    if (bootRaf.current) cancelAnimationFrame(bootRaf.current);
    setIsLive(false); setSweep(false);
    const target = "$" + Math.abs(value).toLocaleString(), len = target.length;
    setDisplay(scrambleStr(target));
    const dur = 380, start = performance.now();
    function tick(now) {
      const p = Math.min((now - start) / dur, 1);
      setDisplay(scrambleStr(target));
      if (p < 1) { bootRaf.current = requestAnimationFrame(tick); } else {
        const rS = performance.now(), rD = 250;
        function resolve(n) {
          const rp = Math.min((n - rS) / rD, 1), res = Math.floor(rp * len);
          let rv = "";
          for (let i = 0; i < len; i++) { if (i < res) rv += target[i]; else if (/\d/.test(target[i])) rv += randDigit(); else rv += target[i]; }
          setDisplay(rv);
          if (rp < 1) { bootRaf.current = requestAnimationFrame(resolve); }
          else {
            bootRaf.current = null; setDisplay(target);
            setSweep(true);
            setTimeout(() => { setSweep(false); setIsLive(true); }, 350);
          }
        }
        bootRaf.current = requestAnimationFrame(resolve);
      }
    }
    bootRaf.current = requestAnimationFrame(tick);
    return () => { if (bootRaf.current) cancelAnimationFrame(bootRaf.current); };
  }, [trigger]);

  if (isLive) return <Num value={value} />;
  if (display === "") return <span style={{ opacity: 0.12, fontVariantNumeric: "tabular-nums" }}>{"$" + Math.abs(value).toLocaleString().replace(/\d/g, "-")}</span>;

  return (
    <span className="hv-wrap">
      <span className="hv-num">{display}</span>
      {sweep && <span className="hv-sweep" style={{ "--sc": color }} />}
    </span>
  );
}

// ============================================================================
// TOP-LEVEL APP — with restart support
// ============================================================================
export default function App() {
  const initial = useMemo(() => resolveInitialAppState(), []);
  const [phase, setPhase] = useState(initial.phase);
  const [guidedData, setGuidedData] = useState(null);
  const [results, setResults] = useState(null);
  const [explorerRestore, setExplorerRestore] = useState(initial.explorerRestore);
  const [theme, setTheme] = useState(initialTheme);
  const [skipLanding, setSkipLanding] = useState(() => {
    try {
      return localStorage.getItem(SKIP_LANDING_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggleTheme = useCallback(() => {
    const t = theme === "dark" ? "light" : "dark";
    applyTheme(t);
    setTheme(t);
    try { localStorage.setItem("fo-theme", t); } catch (e) { /* noop */ }
  }, [theme]);

  const openExplorer = useCallback((data, restore) => {
    setGuidedData(data);
    setResults(calc(calcInputsFromGuided(data)));
    setExplorerRestore(restore || guidedDataToExplorerRestore(data));
    setPhase("explorer");
  }, []);

  const handleSkipIntroChange = useCallback((checked) => {
    setSkipLanding(checked);
    try {
      localStorage.setItem(SKIP_LANDING_KEY, checked ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const handleMiniBoot = useCallback(() => setPhase("guided"), []);
  const handleGuided = useCallback((data) => {
    setGuidedData(data);
    setResults(calc(calcInputsFromGuided(data)));
    setPhase("reveal");
  }, []);
  const handleExplore = useCallback(() => setPhase("boot"), []);
  const handleBoot = useCallback(() => {
    setExplorerRestore(guidedData ? guidedDataToExplorerRestore(guidedData) : null);
    setPhase("explorer");
  }, [guidedData]);
  const handleSkip = useCallback(() => setPhase("explorer"), []);
  const handleRestart = useCallback(() => {
    setGuidedData(null);
    setResults(null);
    setExplorerRestore(null);
    setPhase(skipLanding ? "explorer" : "landing");
  }, [skipLanding]);

  useViewportFit(phase);

  return (
    <ErrorBoundary>
    <div className="app-theme-wrap">
      {phase === "landing" && (
        <Landing
          onQuick={() => setPhase("quick")}
          onGuided={() => setPhase("mini-boot")}
          onResume={() => {
            const session = loadSession();
            if (session) {
              setExplorerRestore(explorerStateFromSession(session));
              setGuidedData(session.guidedData || null);
              setPhase("explorer");
            }
          }}
          skipIntro={skipLanding}
          onSkipIntroChange={handleSkipIntroChange}
        />
      )}
      {phase === "quick" && (
        <QuickEstimate
          onBack={() => setPhase("landing")}
          onComplete={(data) => openExplorer(data)}
        />
      )}
      {phase === "mini-boot" && <MiniBoot onComplete={handleMiniBoot} />}
      {phase === "guided" && <GuidedInput onComplete={handleGuided} />}
      {phase === "reveal" && <Reveal data={guidedData} results={results} onExplore={handleExplore} />}
      {phase === "boot" && <Boot onComplete={handleBoot} />}
      {phase === "explorer" && (
        <Explorer
          initialData={guidedData}
          restoreState={explorerRestore}
          onRestart={handleRestart}
          theme={theme}
          toggleTheme={toggleTheme}
        />
      )}
      {!["explorer", "landing", "quick"].includes(phase) && (
        <button className="skip-btn" onClick={handleSkip} title="Skip to dashboard">SKIP ▸</button>
      )}
    </div>
    </ErrorBoundary>
  );
}

// ============================================================================
// EXPLORER
// ============================================================================
function Explorer({ initialData, restoreState, onRestart, theme, toggleTheme }) {
  const boot = restoreState || {};
  const initSector = boot.sector || initialData?.sector || "infrastructure";
  const initState = boot.selectedState || initialData?.state || DEFAULTS.state;
  const initInputs = boot.inputs || (initialData ? buildInputsFromSector(initSector, initialData) : buildInputsFromSector(initSector, { state: initState }));

  const [tab, setTab] = useState("analysis");
  const [sector, setSector] = useState(initSector);
  const [inputs, setInputs] = useState(initInputs);
  const [selectedState, setSelectedState] = useState(initState);
  const [projectName, setProjectName] = useState(boot.projectName ?? initialData?.projectName ?? "");
  const [confirmedName, setConfirmedName] = useState(boot.confirmedName ?? (initialData?.projectName || "").toUpperCase());
  const [nameScramble, setNameScramble] = useState(0);
  const [scenarios, setScenarios] = useState(boot.scenarios || [null, null, null]);
  const [scenarioNames, setScenarioNames] = useState(boot.scenarioNames || [...DEFAULT_SCENARIO_NAMES]);
  const [scenarioNameScrambles, setScenarioNameScrambles] = useState([0, 0, 0]);
  const [editingScenario, setEditingScenario] = useState(null);
  const [editingAt, setEditingAt] = useState(null);
  const [loadedSlot, setLoadedSlot] = useState(null);
  const [loadedScramble, setLoadedScramble] = useState(0);

  const finishScenarioEdit = useCallback((idx, value) => {
    const finalName = (value || "").trim().toUpperCase() || scenarioNames[idx].toUpperCase();
    setScenarioNames(p => { const n = [...p]; n[idx] = finalName; return n; });
    setScenarioNameScrambles(p => { const n = [...p]; n[idx] = p[idx] + 1; return n; });
    setEditingScenario(null);
    setEditingAt(null);
  }, [scenarioNames]);
  const clearSlot = useCallback((idx) => {
    setScenarios(p => { const n = [...p]; n[idx] = null; return n; });
    setLoadedSlot(p => p === idx ? null : p);
    setEditingScenario(null);
    setEditingAt(null);
  }, []);
  const [slotFlash, setSlotFlash] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [mounted, setMounted] = useState(false);
  const [bootTriggers, setBootTriggers] = useState([0,0,0,0,0,0,0,0]);
  const [bootVisible, setBootVisible] = useState([0,0,0,0,0,0,0,0]);
  const [threshold, setThreshold] = useState(null);
  const [scrambleTrigger, setScrambleTrigger] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [shareMsg, setShareMsg] = useState("");
  const [exportName, setExportName] = useState("");
  const [exportImage, setExportImage] = useState(null);
  const [mobileInputOpen, setMobileInputOpen] = useState(false);
  const [nameScrambling, setNameScrambling] = useState(false);
  const [nameFlash, setNameFlash] = useState(false);
  const [inactionToast, setInactionToast] = useState(null);
  const nameInputRef = useRef(null);
  const prevT = useRef(0); const prevThresh = useRef(0);
  const prevTotals = useRef({ t: 0, c: 0, p: 0 });
  const debounceRef = useRef(null);
  const handleBarToggle = useCallback((key) => {
    setExpanded(prev => prev === key ? null : key);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e) => {
      if (e.key === "Escape") setExpanded(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
    const timers = [];
    // 0:hero 1:kpis 2:timeline 3:distribution 4:time 5:cost 6:productivity 7:context
    const delays = [60, 200, 320, 420, 520, 600, 680, 780];
    for (let i = 0; i < 8; i++) {
      timers.push(setTimeout(() => {
        setBootTriggers(p => { const n = [...p]; n[i] = 1; return n; });
        requestAnimationFrame(() => {
          setBootVisible(p => { const n = [...p]; n[i] = 1; return n; });
        });
      }, delays[i]));
    }
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      saveSession({
        guidedData: {
          projectName: confirmedName || projectName || "PROJECT",
          sector,
          state: selectedState,
          ...inputs,
        },
        sector,
        selectedState,
        inputs: { ...inputs, state: selectedState },
        projectName,
        confirmedName,
        scenarios,
        scenarioNames,
      });
    }, 500);
    return () => clearTimeout(t);
  }, [inputs, sector, selectedState, projectName, confirmedName, scenarios, scenarioNames]);

  // Cost of Inaction toast — appears after 30s
  useEffect(() => {
    const t = setTimeout(() => { setInactionToast(Date.now()); }, 30000);
    return () => clearTimeout(t);
  }, []);

  // Keep inputs.state in sync with selectedState (Explorer mini-map)
  useEffect(() => { setInputs(p => ({ ...p, state: selectedState })); }, [selectedState]);

  const r = useMemo(() => calc({ ...inputs, state: selectedState }), [inputs, selectedState]);
  const bench = PRESETS[sector];

  // Sensitivity analysis — which sliders move the needle most?
  const sensitivity = useMemo(() => {
    const base = r.total;
    const keys = ["projectValue", "duration", "permits", "workers", "inspections", "incidents", "siteVisits", "staffRate"];
    const deltas = {};
    keys.forEach(k => {
      const bumped = { ...inputs, state: selectedState, [k]: Math.round(inputs[k] * 1.1) };
      const bumpedR = calc(bumped);
      deltas[k] = Math.abs(bumpedR.total - base);
    });
    const maxDelta = Math.max(...Object.values(deltas), 1);
    const result = {};
    keys.forEach(k => {
      const ratio = deltas[k] / maxDelta;
      result[k] = ratio > 0.7 ? "high" : ratio > 0.35 ? "mid" : "low";
    });
    return result;
  }, [inputs, r.total]);

  // Synthetic benchmark percentile — sector-aware
  const percentile = useMemo(() => {
    const sectorMeans = { infrastructure: 2200000, commercial: 1400000, residential: 800000, industrial: 2600000, utilities: 1800000 };
    const sectorStd = { infrastructure: 1500000, commercial: 900000, residential: 500000, industrial: 1700000, utilities: 1200000 };
    const mean = sectorMeans[sector] || 1800000;
    const std = sectorStd[sector] || 1200000;
    const z = (r.total - mean) / Math.max(std, 1);
    const p = 1 / (1 + Math.exp(-1.7 * z));
    return Math.max(1, Math.min(99, Math.round(p * 100)));
  }, [r.total, sector]);
  const eff = Math.min(100, Math.round((inputs.permits / Math.max(bench.permits, 1)) * 25 + (inputs.inspections / Math.max(bench.inspections, 1)) * 25 + (inputs.incidents / Math.max(bench.incidents, 1)) * 25 + (inputs.workers / Math.max(bench.workers, 1)) * 25));
  const grade = eff >= 85 ? "A" : eff >= 70 ? "B+" : eff >= 55 ? "B" : eff >= 40 ? "C+" : "C";

  const tier = r.neg ? "neg" : (r.total > 12000000 && r.roiX > 25) ? "anomalous" : r.roiX >= 20 ? "elite" : r.roiX >= 10 ? "strong" : r.roiX >= 5 ? "good" : "low";
  const accent = { anomalous: VIOLET, elite: GREEN, strong: GREEN, good: BLUE, low: YELLOW, neg: RED }[tier];
  const tierLabel = { anomalous: "ANOMALOUS", elite: "EXCEPTIONAL", strong: "STRONG RETURN", good: "SOLID RETURN", low: "MODERATE RETURN", neg: "COST EXCEEDS VALUE" }[tier];

  const storySentence = useMemo(
    () =>
      buildStorySentence({
        confirmedName,
        sector,
        stateCode: selectedState,
        states: STATES,
        r,
      }),
    [confirmedName, sector, selectedState, r],
  );

  const sensDrivers = useMemo(() => topSensitivityDrivers(sensitivity, 3), [sensitivity]);

  const executiveSummary = useMemo(
    () =>
      buildExecutiveSummary({
        confirmedName,
        sectorLabel: PRESETS[sector]?.label,
        stateCode: selectedState,
        r,
        storySentence,
        modelVersion: MODEL_VERSION,
      }),
    [confirmedName, sector, selectedState, r, storySentence],
  );

  const copyExecutiveSummary = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(executiveSummary);
      setShareMsg("Summary copied");
      setTimeout(() => setShareMsg(""), 2200);
    } catch {
      /* ignore */
    }
  }, [executiveSummary]);

  const copyLink = useCallback(async () => {
    await copyShareUrl({
      guidedData: {
        projectName: confirmedName || projectName || "PROJECT",
        sector,
        state: selectedState,
        ...inputs,
      },
      sector,
      selectedState,
      inputs: { ...inputs, state: selectedState },
      projectName,
      confirmedName,
      scenarios,
      scenarioNames,
    });
    setShareMsg("Copied");
    setTimeout(() => setShareMsg(""), 2200);
  }, [confirmedName, projectName, sector, selectedState, inputs, scenarios, scenarioNames]);

  const sliderMouseDown = useRef(0);
  useEffect(() => {
    const down = (e) => { if (e.target.classList.contains("si-input")) sliderMouseDown.current = Date.now(); };
    const up = (e) => { if (e.target.classList.contains("si-input") && (Date.now() - sliderMouseDown.current) < 180) { setScrambleTrigger(t => t + 1); prevTotals.current = { t: 0, c: 0, p: 0 }; } };
    window.addEventListener("mousedown", down); window.addEventListener("mouseup", up); window.addEventListener("touchstart", down); window.addEventListener("touchend", up);
    return () => { window.removeEventListener("mousedown", down); window.removeEventListener("mouseup", up); window.removeEventListener("touchstart", down); window.removeEventListener("touchend", up); };
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const prev = prevTotals.current;
      if (prev.t === 0 && prev.c === 0 && prev.p === 0) { prevTotals.current = { t: r.t.total, c: r.c.total, p: r.p.total }; return; }
      const tC = prev.t > 0 ? Math.abs(r.t.total - prev.t) / prev.t : 0, cC = prev.c > 0 ? Math.abs(r.c.total - prev.c) / prev.c : 0, pC = prev.p > 0 ? Math.abs(r.p.total - prev.p) / prev.p : 0;
      if (tC > 0.12 || cC > 0.12 || pC > 0.12) setScrambleTrigger(t => t + 1);
      prevTotals.current = { t: r.t.total, c: r.c.total, p: r.p.total };
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [r.t.total, r.c.total, r.p.total]);

  useEffect(() => { prevT.current = r.total; }, [r.total]);
  const bootDoneRef = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => { bootDoneRef.current = true; }, 900);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => { if (!bootDoneRef.current) { prevThresh.current = [5000000, 2000000, 1000000, 500000].find(t => r.total >= t) || 0; return; } const ts = [5000000, 2000000, 1000000, 500000]; const cur = ts.find(t => r.total >= t) || 0; if (cur > prevThresh.current) { setThreshold(cur); const t = setTimeout(() => setThreshold(null), 1200); prevThresh.current = cur; return () => clearTimeout(t); } if (cur < prevThresh.current) prevThresh.current = cur; }, [r.total]);

  const set = useCallback((k, v) => {
    setInputs(p => {
      const next = { ...p, [k]: Number(v), state: selectedState };
      if (k === "platformCost") next.platformCostAuto = false;
      if (k === "projectValue" && p.platformCostAuto !== false) {
        next.platformCost = defaultPlatformCost(Number(v));
      }
      return next;
    });
  }, [selectedState]);
  const pick = useCallback((k) => {
    setSector(k);
    setInputs(p => ({
      ...p,
      ...PRESETS[k],
      state: selectedState,
      platformCost: p.platformCostAuto !== false ? defaultPlatformCost(p.projectValue) : p.platformCost,
      platformCostAuto: p.platformCostAuto !== false,
    }));
    setScrambleTrigger(t => t + 1);
    setLoadedSlot(null);
    prevTotals.current = { t: 0, c: 0, p: 0 };
  }, [selectedState]);
  const reset = useCallback(() => {
    setInputs({
      ...DEFAULTS,
      ...PRESETS[sector],
      state: selectedState,
      platformCost: defaultPlatformCost(DEFAULTS.projectValue),
      platformCostAuto: true,
    });
    setExpanded(null);
    setScrambleTrigger(t => t + 1);
    setScenarios([null, null, null]);
    setScenarioNames([...DEFAULT_SCENARIO_NAMES]);
    setScenarioNameScrambles([0, 0, 0]);
    setEditingScenario(null);
    setEditingAt(null);
    setLoadedSlot(null);
    prevTotals.current = { t: 0, c: 0, p: 0 };
  }, [sector, selectedState]);

  const confirmName = useCallback(() => {
    const name = projectName.trim().toUpperCase();
    if (name) {
      setNameScrambling(true);
      const target = name, len = target.length, dur = 700, start = performance.now();
      function tick(now) {
        const p = Math.min((now - start) / dur, 1), resolved = Math.floor(p * len); let rs = "";
        for (let i = 0; i < len; i++) { if (i < resolved) rs += target[i]; else if (target[i] === " ") rs += " "; else rs += GLYPHS[Math.floor(Math.random() * GLYPHS.length)]; }
        setProjectName(rs);
        if (p < 1) requestAnimationFrame(tick);
        else { setProjectName(target); setConfirmedName(target); setNameScramble(n => n + 1); setNameScrambling(false); setNameFlash(true); setTimeout(() => setNameFlash(false), 1400); }
      }
      requestAnimationFrame(tick);
    } else setConfirmedName("");
  }, [projectName]);

  const saveSlot = useCallback((idx) => { const data = { ...inputs, _sector: sector, _state: selectedState }; setScenarios(p => { const n = [...p]; n[idx] = data; return n; }); setSlotFlash(idx); setTimeout(() => setSlotFlash(null), 900); }, [inputs, sector, selectedState]);
  const loadSlot = useCallback((idx) => { const data = scenarios[idx]; if (!data) return; const { _sector, _state, ...rest } = data; setInputs(rest); if (_sector) setSector(_sector); if (_state) setSelectedState(_state); setScrambleTrigger(t => t + 1); setLoadedSlot(idx); setLoadedScramble(t => t + 1); prevTotals.current = { t: 0, c: 0, p: 0 }; }, [scenarios]);

  useEffect(() => {
    const down = (e) => {
      const isText = e.target.tagName === "INPUT" && e.target.type === "text"; if (isText || e.target.tagName === "TEXTAREA") { if (e.key === "Escape") e.target.blur(); return; }
      if (e.key === "/") { e.preventDefault(); setShowShortcuts(true); }
      if (e.key === "Escape") { setExpanded(null); setShowShortcuts(false); setShowAssumptions(false); setShowExport(false); document.activeElement?.blur(); }
      const isRange = e.target.tagName === "INPUT" && e.target.type === "range";
      if (e.key === "ArrowLeft" && !isRange) setTab("analysis"); if (e.key === "ArrowRight" && !isRange) setTab("compare");
      if (e.key === "1") pick("infrastructure"); if (e.key === "2") pick("commercial"); if (e.key === "3") pick("residential"); if (e.key === "4") pick("industrial"); if (e.key === "5") pick("utilities");
      if (e.key === "r" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); reset(); }
      if (e.key === "n" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); if (onRestart) onRestart(); }
      if (e.key === "a" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); saveSlot(0); }
      if (e.key === "b" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); saveSlot(1); }
      if (e.key === "c" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); saveSlot(2); }
    };
    const up = (e) => { if (e.key === "/") setShowShortcuts(false); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [pick, reset, saveSlot, onRestart]);

  const tPct = r.total > 0 ? Math.max(0, Math.min(100, Math.round((r.t.total / r.total) * 100))) : 33;
  const cPct = r.total > 0 ? Math.max(0, Math.min(100 - tPct, Math.round((r.c.total / r.total) * 100))) : 33;
  const pPct = Math.max(0, 100 - tPct - cPct);
  const pbPct = Math.min(100, (Math.min(r.payback, 6) / 6) * 100);

  const pal = theme === "light" ? LIGHT_PAL : DARK_PAL;
  const breakdownPanels = useMemo(() => ({
    t: {
      color: pal.GREEN,
      title: "TIME SAVINGS",
      highlight: `${r.hrs.toLocaleString()} hours/year · ${Math.max(1, Math.round(r.hrs / 2080))} FTE equivalent`,
      rows: [
        ["Permit workflows", r.t.permits, "~90 min saved per permit"],
        ["Inductions & onboarding", r.t.inductions, "~30 min saved per worker"],
        ["Inspections & audits", r.t.inspections, "~15 min per inspection"],
        ["Incident reporting", r.t.incidents, "~60 min per report"],
        ["Automated dashboards", r.t.dashboards, "1 day → 15 min"],
        ["Paperless processes", r.t.paperless, "Printing & storage eliminated"],
      ],
    },
    c: {
      color: pal.BLUE,
      title: "COST SAVINGS",
      highlight: "One regulatory fine avoided pays for the system",
      rows: [
        ["Reduced site travel", r.c.travel, "~$200 per avoided visit"],
        ["Lower insurance premiums", r.c.insurance, "2–5% premium reduction"],
        ["Regulatory avoidance", r.c.regulatory, "Faster CAPA, better docs"],
      ],
    },
    p: {
      color: pal.ORANGE,
      title: "PRODUCTIVITY",
      highlight: "One prevented stoppage can save $250K–$500K",
      rows: [
        ["Reduced downtime", r.p.downtime, "0.5–1 day stoppage avoided"],
        ["Workforce utilisation", r.p.workforce, "~5 unproductive days/mo avoided"],
        ["Dispute avoidance", r.p.disputes, "One avoided dispute/year"],
      ],
    },
  }), [r, theme]);

  const activeBreakdown = expanded ? breakdownPanels[expanded] : null;
  const scenarioResults = scenarios.map(s => s ? calc(s) : null);
  const savedCount = scenarios.filter(Boolean).length;

  return (
    <div className={`root ${mounted ? "on" : ""}`}>
      <div className="scan" /><div className="grid-bg" /><div className="vig" /><div className="sweep" />
      {showShortcuts && <div className="sc-overlay"><div className="sc-box"><div className="sc-title">KEYBOARD SHORTCUTS</div>{SHORTCUTS.map(([k, d]) => <div key={k} className="sc-row"><span className="sc-key">{k}</span><span className="sc-desc">{d}</span></div>)}<div className="sc-hint">Release / to close</div></div></div>}
      {showExport && <div className="sc-overlay" onClick={e => { if (e.target === e.currentTarget) setShowExport(false); }}><div className="sc-box" style={{ maxWidth: 380 }}>
        <div className="sc-title">EXPORT BRIEFING</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><div style={{ fontSize: 11, letterSpacing: 1, color: "rgba(var(--trgb),0.65)", marginBottom: 6 }}>PREPARED BY</div>
          <input className="pn-input" type="text" placeholder="YOUR NAME" value={exportName} onChange={e => setExportName(e.target.value)} style={{ fontSize: 14 }} /></div>
          <div style={{ fontSize: 11, color: "rgba(var(--trgb),0.55)", letterSpacing: 1, lineHeight: 1.7 }}>
            Project: {confirmedName || "n/a"}<br />State: {STATES[selectedState]?.full} ({selectedState})<br />Total Value: {fmt(r.total)} · {tierLabel}<br />Reference model: {100 - percentile}th percentile · {STATES[selectedState].factor.toFixed(2)}× state
          </div>
          <button type="button" className="gi-load" style={{ width: "100%" }} onClick={copyExecutiveSummary}>
            Copy executive summary
          </button>
          <button className="gi-load" style={{ width: "100%", marginTop: 4 }} onClick={() => {
            const W = 2480, H = 3508;
            const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
            const mono = "'Inter', system-ui, sans-serif", sans = "'Inter', system-ui, sans-serif";
            const bg = "#080808", fg = "#D4D4D8", dim = "rgba(255,255,255,0.35)", faint = "rgba(255,255,255,0.06)";
            const L = 120, R = W - 120; // left/right margins
            x.fillStyle = bg; x.fillRect(0, 0, W, H);

            // === TOP CLASSIFICATION BAR ===
            x.fillStyle = accent + "12"; x.fillRect(0, 0, W, 72);
            x.fillStyle = accent; x.font = `600 22px ${sans}`; x.textAlign = "left"; x.letterSpacing = "2px";
            x.fillText("CONFIDENTIAL · ROI ANALYSIS BRIEFING", L, 46);
            x.textAlign = "right"; x.fillStyle = dim; x.font = `400 20px ${mono}`;
            x.fillText(new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase(), R, 46);

            // === PROJECT HEADER ===
            let y = 160;
            x.textAlign = "left"; x.fillStyle = "#fff"; x.font = `700 56px ${mono}`;
            x.fillText((confirmedName || "PROJECT").toUpperCase(), L, y);
            y += 48;
            x.fillStyle = dim; x.font = `400 22px ${sans}`;
            x.fillText(`${(PRESETS[sector]?.label || "SECTOR").toUpperCase()} · ${STATES[selectedState]?.full || selectedState} · ${tierLabel}`, L, y);
            // Accent line
            y += 28;
            x.fillStyle = accent; x.fillRect(L, y, 160, 2);
            x.fillStyle = accent + "30"; x.fillRect(L + 160, y, R - L - 160, 1);

            // === HERO NUMBER ===
            y += 140;
            x.fillStyle = accent; x.font = `700 130px ${mono}`;
            x.fillText(fmt(r.total), L, y);
            y += 48;
            x.fillStyle = dim; x.font = `500 24px ${sans}`;
            x.fillText("ANNUAL RECOVERABLE VALUE", L, y);

            // === KPI ROW ===
            y += 70;
            const kpis = [
              ["ROI MULTIPLE", `${r.roiX}x`, r.roiX >= 10 ? GREEN : r.roiX >= 5 ? BLUE : YELLOW],
              ["PAYBACK", `${r.payback}mo`, r.payback <= 2 ? GREEN : r.payback <= 4 ? BLUE : YELLOW],
              ["HOURS SAVED", r.hrs.toLocaleString(), r.hrs > 5000 ? GREEN : BLUE],
              ["VS REFERENCE", `${100 - percentile}th pct`, CYAN],
            ];
            const kW = Math.floor((R - L - 30) / 4);
            kpis.forEach(([label, val, col], i) => {
              const kx = L + i * (kW + 10);
              x.fillStyle = faint; x.fillRect(kx, y, kW, 130);
              x.strokeStyle = col + "30"; x.lineWidth = 1; x.strokeRect(kx, y, kW, 130);
              // Colored top edge
              x.fillStyle = col + "60"; x.fillRect(kx, y, kW, 2);
              x.textAlign = "left"; x.fillStyle = dim; x.font = `500 18px ${sans}`;
              x.fillText(label, kx + 20, y + 36);
              x.fillStyle = col; x.font = `700 42px ${mono}`;
              x.fillText(val, kx + 20, y + 98);
            });

            // === DISTRIBUTION BAR ===
            y += 200;
            x.textAlign = "left"; x.fillStyle = dim; x.font = `600 20px ${sans}`;
            x.fillText("VALUE DISTRIBUTION", L, y);
            y += 24;
            const dw = R - L;
            const segs = [[tPct, GREEN], [cPct, BLUE], [pPct, ORANGE]];
            let dx = L;
            segs.forEach(([pct, col]) => {
              const sw = Math.max(2, dw * pct / 100 - 3);
              x.fillStyle = col; x.fillRect(dx, y, sw, 22);
              dx += sw + 3;
            });
            y += 56;
            x.font = `400 18px ${sans}`;
            x.fillStyle = GREEN; x.fillText(`TIME ${tPct}% · ${fmt(r.t.total)}`, L, y);
            x.fillStyle = BLUE; x.fillText(`COST ${cPct}% · ${fmt(r.c.total)}`, L + 700, y);
            x.fillStyle = ORANGE; x.fillText(`PRODUCTIVITY ${pPct}% · ${fmt(r.p.total)}`, L + 1400, y);

            // === SAVINGS BREAKDOWN TABLE ===
            y += 70;
            x.fillStyle = dim; x.font = `600 20px ${sans}`; x.fillText("SAVINGS BREAKDOWN", L, y);
            y += 10;
            const bdRows = [
              ["Permit workflows", fmt(r.t.permits), GREEN],
              ["Inductions & onboarding", fmt(r.t.inductions), GREEN],
              ["Inspections & audits", fmt(r.t.inspections), GREEN],
              ["Incident reporting", fmt(r.t.incidents), GREEN],
              ["Site travel reduction", fmt(r.c.travel), BLUE],
              ["Insurance savings", fmt(r.c.insurance), BLUE],
              ["Downtime prevention", fmt(r.p.downtime), ORANGE],
              ["Workforce utilisation", fmt(r.p.workforce), ORANGE],
            ];
            bdRows.forEach(([label, val, col], i) => {
              const ry = y + 16 + i * 54;
              if (i % 2 === 0) { x.fillStyle = "rgba(255,255,255,0.02)"; x.fillRect(L, ry, R - L, 48); }
              // Color indicator dot
              x.fillStyle = col; x.beginPath(); x.arc(L + 16, ry + 28, 4, 0, Math.PI * 2); x.fill();
              x.textAlign = "left"; x.fillStyle = fg; x.font = `400 20px ${sans}`;
              x.fillText(label.toUpperCase(), L + 36, ry + 34);
              x.textAlign = "right"; x.fillStyle = "#fff"; x.font = `600 22px ${mono}`;
              x.fillText(val, R, ry + 34);
            });

            // === FINANCIAL SUMMARY ===
            y += 16 + bdRows.length * 54 + 50;
            x.textAlign = "left"; x.fillStyle = dim; x.font = `600 20px ${sans}`;
            x.fillText("FINANCIAL SUMMARY", L, y);
            y += 12;
            x.fillStyle = faint; x.fillRect(L, y, R - L, 280);
            x.strokeStyle = accent + "20"; x.lineWidth = 1; x.strokeRect(L, y, R - L, 280);
            const finRows = [
              ["Net Annual Savings", fmt(r.net), r.neg ? RED : GREEN],
              ["3-Year Projection", fmt(r.yr3), fg],
              ["Platform Cost", `${fmt(r.sw)}/yr`, YELLOW],
              ["ROI Multiple", `${r.roiX}x`, accent],
              ["Payback Period", `${r.payback} months`, accent],
            ];
            finRows.forEach(([label, val, col], i) => {
              const fy = y + 24 + i * 50;
              x.textAlign = "left"; x.fillStyle = dim; x.font = `400 20px ${sans}`;
              x.fillText(label, L + 24, fy + 28);
              x.textAlign = "right"; x.fillStyle = col; x.font = `700 24px ${mono}`;
              x.fillText(val, R - 24, fy + 28);
            });

            // === COST OF INACTION — RED CALLOUT ===
            y += 340;
            x.fillStyle = RED + "0C"; x.fillRect(L, y, R - L, 190);
            x.strokeStyle = RED + "40"; x.lineWidth = 2; x.strokeRect(L, y, R - L, 190);
            x.fillStyle = RED + "30"; x.fillRect(L, y, 3, 190); // left accent bar
            x.textAlign = "left"; x.fillStyle = RED; x.font = `600 18px ${sans}`;
            x.fillText("COST OF INACTION", L + 28, y + 42);
            x.fillStyle = "#fff"; x.font = `700 64px ${mono}`;
            x.fillText(`${fmt(r.dailyLoss)}`, L + 28, y + 120);
            x.fillStyle = RED; x.font = `600 20px ${sans}`;
            x.fillText("PER WORKING DAY", L + 28, y + 164);

            // === FOOTER ===
            x.fillStyle = "rgba(255,255,255,0.04)"; x.fillRect(0, H - 140, W, 140);
            x.fillStyle = accent + "40"; x.fillRect(0, H - 140, W, 1);
            x.textAlign = "left"; x.fillStyle = dim; x.font = `400 18px ${sans}`;
            x.fillText(`Prepared by: ${exportName || "n/a"}`, L, H - 90);
            x.fillText(`Date: ${new Date().toLocaleDateString("en-AU")}`, L, H - 58);
            x.textAlign = "right"; x.fillStyle = "rgba(255,255,255,0.2)"; x.font = `500 16px ${sans}`;
            x.fillText("POWERED BY PRESCIENCE + NOVADE", R, H - 90);
            x.fillText("INDICATIVE ANALYSIS · ALL FIGURES IN AUD", R, H - 58);
            x.fillText(`Model v${MODEL_VERSION}`, R, H - 32);

            // === DOWNLOAD ===
            try {
              c.toBlob((blob) => {
                if (!blob) throw new Error("Canvas blob failed");
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `${(confirmedName || "PROJECT").replace(/\s+/g, "_")}_ROI_BRIEFING.png`;
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                setShowExport(false);
              }, "image/png");
            } catch (e) {
              const dataUrl = c.toDataURL("image/png");
              setShowExport(false);
              setExportImage(dataUrl);
            }
          }}>GENERATE BRIEFING ↓</button>
        </div>
      </div></div>}
      {exportImage && <div className="sc-overlay" onClick={() => setExportImage(null)}>
        <div className="export-result" onClick={e => e.stopPropagation()}>
          <div className="export-result-hdr">
            <span className="export-result-title">BRIEFING GENERATED</span>
            <button className="export-result-close" onClick={() => setExportImage(null)}>✕</button>
          </div>
          <img src={exportImage} alt="ROI Briefing" className="export-result-img" />
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <a href={exportImage} download={`${(confirmedName || "PROJECT").replace(/\s+/g, "_")}_ROI_BRIEFING.png`} className="gi-load" style={{ textDecoration: "none", fontSize: 13 }}>↓ DOWNLOAD PNG</a>
            <button className="gi-load" style={{ fontSize: 13 }} onClick={() => { const w = window.open(); if (w) { w.document.write(`<img src="${exportImage}" style="max-width:100%">`); } }}>↗ OPEN IN TAB</button>
          </div>
          <div className="export-result-hint">If download doesn't start, right-click image → Save As</div>
        </div>
      </div>}
      {threshold && <div className="thresh-flash" />}
      <header className="hdr">
        <div className="hdr-row">
        <div className="hdr-l">
          <img src={prescienceMark} alt="Prescience Technology" title="Prescience Technology" className="hdr-mark" />
          <span className="hdr-div" />
          <div className="hdr-title">Novade Field Management · ROI</div>
        </div>
        <div className="hdr-tabs">
          <button className={`htab ${tab === "analysis" ? "htab-ac" : ""}`} onClick={e => { setTab("analysis"); e.target.blur(); }}>ANALYSIS</button>
          <button className={`htab ${tab === "compare" ? "htab-ac" : ""}`} onClick={e => { setTab("compare"); e.target.blur(); }}>COMPARE</button>
        </div>
        <div className="hdr-r">
          <button className="hdr-btn theme-toggle" onClick={e => { toggleTheme(); e.target.blur(); }} title="Toggle light mode">{theme === "dark" ? "☀ LIGHT" : "☾ DARK"}</button>
          <div className="status"><span className="dot" style={{ background: accent, boxShadow: `0 0 6px ${accent}` }} />LIVE</div>
          <button className="hdr-btn sc-btn" onClick={e => { setShowShortcuts(s => !s); e.target.blur(); }}>?</button>
          <button className="hdr-btn" onClick={e => { copyLink(); e.target.blur(); }} title="Copy share link">
            ⧉ LINK{shareMsg ? <span className="hdr-share-msg">{shareMsg}</span> : null}
          </button>
          <button className="hdr-btn" onClick={e => { setShowAssumptions(true); e.target.blur(); }} title="Model assumptions">ASSUMP.</button>
          <button className="hdr-btn" onClick={e => { setShowExport(true); e.target.blur(); }} title="Export briefing PNG">EXPORT</button>
          <button className="hdr-btn hdr-btn-muted" onClick={e => { reset(); e.target.blur(); }} title="Reset inputs to defaults">RESET</button>
          {onRestart && <button className="hdr-btn hdr-btn-muted" onClick={e => { e.target.blur(); onRestart(); }} title="Start a new project">NEW</button>}
          <span className="meta">{new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}</span>
        </div>
        </div>
        <ScenarioStrip
          className="hdr-scenarios desk-show"
          bootClass={`ai${bootVisible[0] ? " booted" : ""}`}
          editSlot="header"
          scenarios={scenarios}
          scenarioNames={scenarioNames}
          scenarioNameScrambles={scenarioNameScrambles}
          slotFlash={slotFlash}
          editingScenario={editingScenario}
          editingAt={editingAt}
          onSave={saveSlot}
          onLoad={loadSlot}
          onClear={clearSlot}
          onStartEdit={(i, at) => { setEditingScenario(i); setEditingAt(at); }}
          onFinishEdit={finishScenarioEdit}
        />
      </header>
      <div className="main">
        <div className={`left ${mobileInputOpen ? "left-open" : ""} dash-inputs`}>
          <button className="mob-toggle mob-show" onClick={() => setMobileInputOpen(p => !p)}>{mobileInputOpen ? "▾ HIDE INPUTS" : "▸ ADJUST INPUTS"}</button>
          <div className="left-inputs-scroll">
          <div className="sh"><span className="sl">PROJECT</span></div>
          <div className="pn-w">
            <input className="pn-input" type="text" placeholder="PROJECT NAME ↵" value={projectName} ref={nameInputRef} onChange={e => { if (!nameScrambling) setProjectName(e.target.value); }} onKeyDown={e => { if (e.key === "Enter") { e.target.blur(); confirmName(); } }} maxLength={35} readOnly={nameScrambling} />
            {nameFlash && <div className="pn-flash">PROJECT REGISTERED</div>}
            {confirmedName && !nameFlash && <div className="pn-hint">Click to rename</div>}
          </div>
          <div className="sh"><span className="sl">SECTOR</span></div>
          <div className="sg">{Object.entries(PRESETS).map(([k, v]) => <button key={k} className={`sb ${sector === k ? "ac" : ""}`} onClick={() => pick(k)}>{v.label}</button>)}</div>
          <div className="sh"><span className="sl">STATE</span><span style={{ fontSize: 10, color: "rgba(var(--trgb),0.55)", letterSpacing: 1 }}><Tip text={TIPS.state}><span className="si-q">?</span></Tip> {STATES[selectedState]?.full}</span></div>
          <div className="sg" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>{STATE_ORDER.map(code => <button key={code} className={`sb ${selectedState === code ? "ac" : ""}`} onClick={() => { setSelectedState(code); setInputs(p => ({ ...p, state: code })); setScrambleTrigger(t => t + 1); }} style={{ padding: "8px 4px", fontSize: 12 }}>{code}</button>)}</div>
          <div className="sh"><span className="sl">PROJECT SCOPE</span></div>
          <Sl k="projectValue" label="VALUE" val={inputs.projectValue} min={5} max={1000} step={5} fmt={v => `$${v}M`} bench={100} bL="MID" set={set} accent={accent} sens={sensitivity.projectValue} />
          <Sl k="duration" label="DURATION" val={inputs.duration} min={3} max={72} step={3} fmt={v => `${v}MO`} bench={24} bL="2YR" set={set} accent={accent} sens={sensitivity.duration} />
          <div className="sh"><span className="sl">PLATFORM COST</span><Tip text={TIPS.platformCost}><span className="si-q">?</span></Tip></div>
          <Sl k="platformCost" label="ANNUAL ($)" val={inputs.platformCost ?? defaultPlatformCost(inputs.projectValue)} min={6000} max={120000} step={1000} fmt={v => fmt(v)} bench={r.swSuggested} bL="EST" set={set} accent={YELLOW} sens="mid" />
          {inputs.platformCostAuto === false && <div className="plat-hint">Custom; not tied to contract size</div>}
          <button type="button" className="plat-reset" onClick={() => setInputs(p => ({ ...p, platformCost: defaultPlatformCost(p.projectValue), platformCostAuto: true }))}>
            Reset to estimate ({fmt(r.swSuggested)}/yr)
          </button>
          <div className="dv" />
          <div className="sh"><span className="sl">OPERATIONAL VOLUME</span></div>
          <Sl k="permits" label="PERMITS / MO" val={inputs.permits} min={0} max={2000} step={10} bench={500} bL="AVG" set={set} accent={accent} sens={sensitivity.permits} />
          <Sl k="workers" label="WORKFORCE" val={inputs.workers} min={0} max={2000} step={10} bench={500} bL="AVG" set={set} accent={accent} sens={sensitivity.workers} />
          <Sl k="inspections" label="INSPECTIONS / YR" val={inputs.inspections} min={0} max={5000} step={50} bench={1000} bL="AVG" set={set} accent={accent} sens={sensitivity.inspections} />
          <Sl k="incidents" label="INCIDENTS / YR" val={inputs.incidents} min={0} max={500} step={5} bench={100} bL="AVG" set={set} accent={accent} sens={sensitivity.incidents} />
          <Sl k="siteVisits" label="SITE VISITS / MO" val={inputs.siteVisits} min={0} max={300} step={5} bench={80} bL="AVG" set={set} accent={accent} sens={sensitivity.siteVisits} />
          <Sl k="staffRate" label="STAFF RATE" val={inputs.staffRate} min={60} max={250} step={5} fmt={v => `$${v}/hr`} bench={155} bL="AVG" set={set} accent={accent} sens={sensitivity.staffRate} />
          </div>
          <ScenarioStrip
            className="mob-show"
            bootClass={`ai${bootVisible[0] ? " booted" : ""}`}
            editSlot="left"
            scenarios={scenarios}
            scenarioNames={scenarioNames}
            scenarioNameScrambles={scenarioNameScrambles}
            slotFlash={slotFlash}
            editingScenario={editingScenario}
            editingAt={editingAt}
            onSave={saveSlot}
            onLoad={loadSlot}
            onClear={clearSlot}
            onStartEdit={(i, at) => { setEditingScenario(i); setEditingAt(at); }}
            onFinishEdit={finishScenarioEdit}
          />
          <div className="dv mob-show" />
          <div className="mob-tabs mob-show">
            <button className={`htab ${tab === "analysis" ? "htab-ac" : ""}`} onClick={e => { setTab("analysis"); e.target.blur(); }}>ANALYSIS</button>
            <button className={`htab ${tab === "compare" ? "htab-ac" : ""}`} onClick={e => { setTab("compare"); e.target.blur(); }}>COMPARE</button>
          </div>
          <div className="mob-actions mob-show">
            <button className="mob-act" onClick={e => { reset(); e.target.blur(); }}>RESET</button>
            {onRestart && <button className="mob-act" onClick={e => { e.target.blur(); onRestart(); }}>◁ NEW</button>}
          </div>
        </div>
        <div className={`right ${tab === "analysis" ? "dash-analysis" : "dash-compare"}`}>
          {tab === "analysis" ? (<>
            <section className="dash-hero-block">
            <div className={`hero ai${bootVisible[0] ? " booted" : ""}`} style={{ borderColor: `${accent}25` }}>
              <div className="hero-aurora" style={{ background: `radial-gradient(ellipse 130% 100% at 50% -30%, ${accent}40 0%, ${accent}22 40%, transparent 65%)` }} />
              <div className="hero-aurora2" style={{ background: `radial-gradient(ellipse 90% 70% at 40% -10%, ${accent}28 0%, transparent 50%)` }} />
              <div className={`hero-pn${confirmedName ? "" : " hero-pn-empty"}`}>{confirmedName ? <Scramble text={confirmedName.length > 40 ? confirmedName.slice(0, 40) + "…" : confirmedName} duration={500} trigger={nameScramble} /> : " "}</div>
              <div className={`hero-sc${loadedSlot !== null ? "" : " hero-sc-empty"}`}><span className="hero-sc-txt">{loadedSlot !== null ? <Scramble text={scenarioNames[loadedSlot].length > 30 ? scenarioNames[loadedSlot].slice(0, 30) + "…" : scenarioNames[loadedSlot]} duration={450} trigger={loadedScramble} /> : " "}</span></div>
              <div className="hero-head">
                <div className="hero-lbl" style={{ color: `${accent}99` }}>ANNUAL RECOVERABLE VALUE</div>
                <span className="hero-tier" style={{ color: accent, borderColor: `${accent}40`, background: `${accent}12` }}>{tierLabel}</span>
              </div>
              <div className="hero-val" style={{ color: accent, textShadow: `0 0 40px ${accent}44, 0 0 80px ${accent}18` }}><HeroVal value={r.total} color={accent} trigger={bootTriggers[0]} /></div>
              <div className="thresh-w">{threshold && <div className="thresh-line" style={{ "--sc": accent }} />}</div>
              <div className="hero-row dash-hero-subs">
                <div className="sub"><span className="sub-l">NET SAVINGS</span><span className="sub-v lg" style={{ color: r.neg ? RED : GREEN }}><Num value={r.net} /></span><span className="sub-sfx">after platform</span></div>
                <div className="sub"><span className="sub-l">3-YEAR PROJECTION</span><span className="sub-v lg" style={{ color: accent }}><Num value={r.yr3} /></span></div>
                <div className="sub"><span className="sub-l">PLATFORM COST</span><span className="sub-v lg" style={{ color: YELLOW }}><Num value={r.sw} /><span className="sub-sfx">/yr</span></span></div>
                <div className="sub sub-coi"><span className="sub-l coi-l">COST OF INACTION</span><span className="sub-v lg coi-v"><LiveCost perDay={r.dailyLoss} /><span className="sub-sfx">/day</span></span><div className="coi-line" /></div>
                <div className="sub sub-bench"><span className="sub-l" style={{ color: `${CYAN}88` }}>VS REFERENCE</span><span className="sub-v lg" style={{ color: CYAN }}>{100 - percentile}th pct<span className="sub-sfx"> · {(PRESETS[sector]?.label || "").slice(0, 5)}</span></span></div>
              </div>
            </div>
            <p className="hero-story dash-story">{storySentence}</p>
            {sensDrivers.length > 0 && (
              <p className="sens-strip dash-sens">
                <strong>Moves the needle:</strong> {sensDrivers.join(" · ")}
              </p>
            )}
            <p className="dash-sec-label">Key metrics</p>
            <div className={`kpis dash-kpis ai${bootVisible[1] ? " booted" : ""}`}>
              <Kpi label="ROI MULTIPLE" val={`${r.roiX}x`} color={r.roiX >= 10 ? GREEN : r.roiX >= 5 ? BLUE : r.neg ? RED : YELLOW} g={Math.min(1, r.roiX / 20)} tip="Annual return per dollar spent" scr={scrambleTrigger} />
              <Kpi label="PAYBACK" val={`${r.payback}mo`} color={r.payback <= 2 ? GREEN : r.payback <= 4 ? BLUE : YELLOW} g={Math.min(1, 4 / Math.max(r.payback, 0.5))} tip="Months until cost is recovered" scr={scrambleTrigger} />
              <Kpi label="HOURS SAVED" val={r.hrs.toLocaleString()} color={r.hrs > 5000 ? GREEN : r.hrs > 2000 ? BLUE : ORANGE} g={Math.min(1, r.hrs / 8000)} tip="Annual staff hours returned" scr={scrambleTrigger} />
              <Kpi label="EFFICIENCY" val={grade} color={grade.startsWith("A") ? GREEN : grade.startsWith("B") ? BLUE : YELLOW} g={eff / 100} tip="Volume vs sector benchmarks" scr={scrambleTrigger} />
            </div>
            </section>
            <section className={`dash-mid${expanded ? " dash-mid-expanded" : ""}`}>
            <section className="dash-charts">
            <div className={`tl ai${bootVisible[2] ? " booted" : ""}`}>
              <div className="tl-h"><span className="tl-l">PAYBACK TIMELINE</span><span className="tl-v" style={{ color: r.payback <= 2 ? GREEN : r.payback <= 4 ? BLUE : YELLOW }}>{r.payback < 6 ? `${r.payback} MONTHS` : "EXTENDED"}</span></div>
              <div className="tl-track"><div className="tl-fill" style={{ width: `${pbPct}%`, background: `linear-gradient(90deg, ${accent}44, ${accent})`, boxShadow: `0 0 18px ${accent}40` }} /><div className="tl-marker" style={{ left: `${Math.min(95, pbPct)}%` }}><div className="tl-pip" style={{ background: accent, boxShadow: `0 0 14px ${accent}, 0 0 28px ${accent}55` }} /><div className="tl-pip-lbl" style={{ color: accent }}>{r.payback}mo</div></div></div>
              <div className="tl-ticks">{[0,1,2,3,4,5,6].map(m => <span key={m} className="tl-tick" style={{ left: `${(m/6)*100}%` }}><span className="tl-tick-ln" /><span className="tl-tick-n">{m}</span></span>)}</div>
            </div>
            </section>
            <section className="dash-bds">
            <div className={`dist dash-dist-block ai${bootVisible[3] ? " booted" : ""}`}>
              <div className="dist-h"><span className="dist-l">VALUE DISTRIBUTION</span><span className="dist-total" style={{ color: accent }}>{`${fmt(r.total)} TOTAL`}</span></div>
              <div className="dist-bar" aria-hidden="true"><div className="dist-seg" style={{ width: `${tPct}%`, background: GREEN }} /><div className="dist-seg" style={{ width: `${cPct}%`, background: BLUE }} /><div className="dist-seg" style={{ width: `${pPct}%`, background: ORANGE }} /></div>
              <p className="dash-bds-hint">{expanded ? "Tap the highlighted category again to close" : "Tap a category for line-item breakdown"}</p>
            </div>
            <div className="bds-wrap">
              <div className={`bds-item ai${bootVisible[4] ? " booted" : ""}`}>
                <Bd hideBody color={GREEN} tag="TIME SAVINGS" total={r.t.total} pct={tPct} scr={scrambleTrigger} open={expanded === "t"} toggle={() => handleBarToggle("t")} rows={[]} highlight="" />
              </div>
              <div className={`bds-item ai${bootVisible[5] ? " booted" : ""}`}>
                <Bd hideBody color={BLUE} tag="COST SAVINGS" total={r.c.total} pct={cPct} scr={scrambleTrigger} open={expanded === "c"} toggle={() => handleBarToggle("c")} rows={[]} highlight="" />
              </div>
              <div className={`bds-item ai${bootVisible[6] ? " booted" : ""}`}>
                <Bd hideBody color={ORANGE} tag="PRODUCTIVITY" total={r.p.total} pct={pPct} scr={scrambleTrigger} open={expanded === "p"} toggle={() => handleBarToggle("p")} rows={[]} highlight="" />
              </div>
            </div>
            {activeBreakdown && (
              <div className="bds-detail-slot" key={expanded}>
                <BreakdownDetail
                  color={activeBreakdown.color}
                  title={activeBreakdown.title}
                  highlight={activeBreakdown.highlight}
                  rows={activeBreakdown.rows}
                  scr={scrambleTrigger}
                />
              </div>
            )}
            </section>
            </section>
            <section className="dash-foot">
            <p className="dash-sec-label">Context</p>
            <div className="ctx-wrap dash-foot-ctx">
              <div className={`ctx ai${bootVisible[7] ? " booted" : ""}`}>
                <div className="ctx-i"><span className="ctx-ic" style={{ color: CYAN }}>◆</span><div><span className="ctx-l">WORKFORCE EQUIVALENT</span><span className="ctx-v">{`${Math.max(1, Math.round(r.total / 155000))} additional site engineers`}</span></div></div>
                <div className="ctx-i"><span className="ctx-ic" style={{ color: CYAN }}>◆</span><div><span className="ctx-l">CONSERVATIVE (50%)</span><span className="ctx-v">{`${fmt(Math.round(r.total * 0.5))} still recovered annually`}</span></div></div>
                <div className="ctx-i"><span className="ctx-ic" style={{ color: CYAN }}>◆</span><div><span className="ctx-l">REGION · {selectedState}</span><span className="ctx-v">{`${STATES[selectedState]?.full} · ${STATES[selectedState]?.factor.toFixed(2)}× factor`}</span></div></div>
              </div>
            </div>
            </section>
          </>) : (
            <div className={`compare ai${bootVisible[0] ? " booted" : ""}`}>
              {savedCount < 2 ? (<div className="cmp-empty"><div className="cmp-empty-ic">⇄</div><div className="cmp-empty-t">Scenario comparison</div><div className="cmp-empty-s">Pin two versions (baseline vs proposed) to compare side by side. First pinned slot is the baseline.</div><div className="cmp-status">{[0,1,2].map(i => <span key={i} style={{ color: scenarios[i] ? scColors()[i] : "rgba(var(--trgb),0.6)" }}>{scenarios[i] ? `● ${scenarioNames[i]}` : `◌ ${scenarioNames[i]}`}</span>)}</div><button type="button" className="gi-load cmp-pin-cta" onClick={() => saveSlot(0)}>Pin current as baseline</button></div>
              ) : (<>
                <div className="cmp-grid desk-show">
                  <div className="cmp-hdr" style={{ gridTemplateColumns: `180px ${scenarios.map((s,i) => s ? "1fr" : "").filter(Boolean).join(" ")}` }}>
                    <div className="cmp-hdr-hint">METRICS</div>
                    {scenarios.map((s, i) => s ? (
                      editingScenario === i && editingAt === "compare" ? (
                        <div key={`cmp-edit-${i}`}><NameEditor key={`cmp-edit-${i}`} className="cmp-ch-edit" value={scenarioNames[i]} onCommit={(v) => finishScenarioEdit(i, v)} style={{ color: scColors()[i], borderColor: `${scColors()[i]}55` }} /></div>
                      ) : (
                        <div key={i} className="cmp-ch" style={{ color: scColors()[i] }}>
                          <span className="cmp-ch-name" onClick={() => { setEditingScenario(i); setEditingAt("compare"); }} title="Rename">
                            <Scramble text={scenarioNames[i]} duration={300} trigger={scenarioNameScrambles[i]} />
                            <span className="cmp-ch-pencil">✎</span>
                          </span>
                          <button type="button" className="cmp-ch-x" title="Unsave" onClick={() => clearSlot(i)}>✕</button>
                        </div>
                      )
                    ) : null)}
                  </div>
                  {cmpRows(scenarioResults, scenarios).map((row, ri) => {
                    const numVals = row.rawVals || [];
                    const best = row.higherIsBetter !== false ? Math.max(...numVals) : Math.min(...numVals);
                    const worst = row.higherIsBetter !== false ? Math.min(...numVals) : Math.max(...numVals);
                    const delta = best - worst;
                    return (
                    <div key={ri} className="cmp-row" style={{ gridTemplateColumns: `180px ${scenarios.map((s) => s ? "1fr" : "").filter(Boolean).join(" ")}` }}>
                      <div className="cmp-label">{row.label}</div>
                      {row.vals.map((v, vi) => {
                        const isBest = numVals[vi] === best && numVals.length > 1 && delta > 0;
                        const base = numVals[0];
                        const cur = numVals[vi];
                        const diff = vi > 0 ? cur - base : 0;
                        const higher = row.higherIsBetter !== false;
                        const good = vi > 0 && (higher ? diff > 0 : diff < 0);
                        let vs = null;
                        if (vi > 0 && diff !== 0) {
                          vs = row.dollar
                            ? (diff > 0 ? `+${fmt(diff)}` : fmt(diff))
                            : `${diff > 0 ? "+" : ""}${diff.toLocaleString()}${row.suf || ""} vs baseline`;
                        }
                        return (
                          <div key={vi} className="cmp-val" style={isBest ? { color: GREEN } : {}}>
                            {v}
                            {vs && <span className="cmp-vs" style={{ color: good ? GREEN : RED }}>{vs}</span>}
                          </div>
                        );
                      })}
                    </div>
                  );})}
                  {(() => {
                    const active = scenarioResults.filter(Boolean);
                    if (active.length >= 2) {
                      const totals = active.map(r => r.total);
                      const delta = Math.max(...totals) - Math.min(...totals);
                      if (delta > 0) return (
                        <div className="cmp-delta-row">
                          <span className="cmp-delta-l">DELTA</span>
                          <span className="cmp-delta-v" style={{ color: GREEN }}>+{fmt(delta)}</span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
                <div className="cmp-cards mob-show">
                  {cmpRows(scenarioResults, scenarios).map((row, ri) => (
                    <div key={ri} className="cmp-card">
                      <div className="cmp-card-l">{row.label}</div>
                      <div className="cmp-card-v">
                        {row.vals.map((v, vi) => <div key={vi}><span className="cmp-tag" style={{ color: scColors()[row.indices[vi]] }}>{scTag(scenarioNames[row.indices[vi]])}</span>{v}</div>)}
                      </div>
                    </div>
                  ))}
                </div>
              </>)}
            </div>
          )}
        </div>
      </div>
      {inactionToast && <InactionToast startTime={inactionToast} dailyLoss={r.dailyLoss} onDismiss={() => setInactionToast(null)} />}
      <AssumptionsPanel open={showAssumptions} onClose={() => setShowAssumptions(false)} inputs={{ ...inputs, state: selectedState }} results={r} />
      <footer className="ftr"><span>Indicative analysis · Novade field benchmarks · AUD</span><span>Prescience Technology · Model v{MODEL_VERSION}</span></footer>
    </div>
  );
}

function cmpRows(results, scenarios) {
  const active = results.map((r, i) => r ? { r, i } : null).filter(Boolean);
  const fields = [
    { label: "Total Annual Value", get: r => r.total, dollar: true, higherIsBetter: true },
    { label: "Net Savings", get: r => r.net, dollar: true, higherIsBetter: true },
    { label: "3-Year Projection", get: r => r.yr3, dollar: true, higherIsBetter: true },
    { label: "ROI Multiple", get: r => r.roiX, suf: "x", higherIsBetter: true },
    { label: "Payback", get: r => r.payback, suf: "mo", higherIsBetter: false },
    { label: "Hours Saved", get: r => r.hrs, higherIsBetter: true },
    { label: "Time Savings", get: r => r.t.total, dollar: true, higherIsBetter: true },
    { label: "Cost Savings", get: r => r.c.total, dollar: true, higherIsBetter: true },
    { label: "Productivity", get: r => r.p.total, dollar: true, higherIsBetter: true },
    { label: "Daily Loss", get: r => r.dailyLoss, dollar: true, higherIsBetter: false },
  ];
  return fields.map(f => ({
    label: f.label,
    vals: active.map(a => { const v = f.get(a.r); return f.dollar ? fmt(v) : `${v.toLocaleString()}${f.suf || ""}`; }),
    rawVals: active.map(a => f.get(a.r)),
    higherIsBetter: f.higherIsBetter,
    indices: active.map(a => a.i),
    dollar: !!f.dollar,
    suf: f.suf || "",
  }));
}
function Sl({ k, label, val, min, max, step, fmt: f, bench, bL, set, accent, sens }) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState("");
  const editRef = useRef(null);
  const pct = ((val - min) / (max - min)) * 100;
  const bP = bench ? ((bench - min) / (max - min)) * 100 : null;
  const above = bench && val > bench;
  const mult = bench && bench > 0 ? val / bench : null;
  const multStr = mult !== null && above ? `${mult.toFixed(1)}x` : null;
  const isHigh = sens === "high";

  const startEdit = useCallback(() => { setEditVal(String(val)); setEditing(true); setTimeout(() => editRef.current?.select(), 30); }, [val]);
  const commitEdit = useCallback(() => {
    const n = Math.max(min, Math.min(max, Math.round(Number(editVal) / step) * step));
    if (!isNaN(n)) set(k, n);
    setEditing(false);
  }, [editVal, min, max, step, k, set]);

  return (
    <div className={`si ${isHigh ? "si-high" : ""}`}>
      <div className="si-h">
        <span className="si-l">
          {label}
          {isHigh && <span className="si-impact">▲</span>}
          {TIPS[k] && <Tip text={TIPS[k]}><span className="si-q">?</span></Tip>}
        </span>
        <span className="si-rv">
          {multStr && <span className="si-mult" style={{ color: accent }}>{multStr}</span>}
          {editing ? (
            <input ref={editRef} className="si-edit" type="text" inputMode="numeric" value={editVal}
              onChange={e => setEditVal(e.target.value.replace(/[^0-9.-]/g, ""))}
              onBlur={commitEdit} onKeyDown={e => { if (e.key === "Enter") { e.target.blur(); } if (e.key === "Escape") setEditing(false); }} />
          ) : (
            <span className="si-v" style={{ color: above ? accent : "var(--txhi)", cursor: "pointer" }} onClick={startEdit} title="Click to type">{f ? f(val) : val.toLocaleString()}</span>
          )}
        </span>
      </div>
      <div className="si-w">
        <div className="si-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${accent}22, ${accent})` }} />
        {bP !== null && <div className="si-bench" style={{ left: `${bP}%` }}><div className="si-bl" /><span className="si-blt">{bL}</span></div>}
        <input type="range" min={min} max={max} step={step} value={val} onChange={e => set(k, e.target.value)} className="si-input" />
      </div>
    </div>
  );
}
function Kpi({ label, val, color, g, tip, scr }) { const [hover, setHover] = useState(false); const gl = Math.max(0.1, Math.min(1, g)); const bO = Math.round(30 + gl * 70).toString(16).padStart(2, "0"); const sO = Math.round(15 + gl * 45).toString(16).padStart(2, "0"); const iO = Math.round(5 + gl * 18).toString(16).padStart(2, "0"); return (<div className="kpi" style={{ borderColor: `${color}${bO}`, boxShadow: `0 0 ${Math.round(12 + gl * 40)}px ${color}${sO}, inset 0 0 ${Math.round(gl * 30)}px ${color}${Math.round(gl * 8).toString(16).padStart(2, "0")}`, background: `radial-gradient(ellipse 120% 140% at 50% 110%, ${color}${iO} 0%, transparent 55%), rgba(var(--trgb),0.025)` }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}><div className="kpi-l">{label}</div><div className="kpi-v" style={{ color, textShadow: `0 0 ${Math.round(12 + gl * 28)}px ${color}66, 0 0 ${Math.round(20 + gl * 40)}px ${color}22` }}><Scramble text={val} duration={300} trigger={scr || 0} /></div>{hover && tip && <div className="kpi-tip">{tip}</div>}</div>); }
function Bd({ color, tag, total, pct, scr, open, toggle, rows, highlight, hideBody }) {
  const onKey = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };
  return (
    <div
      className={`bd ${open ? "open" : ""}`}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-label={`${tag}: ${fmt(total)}, ${pct} percent. ${open ? "Collapse" : "Expand"} line items.`}
      style={{
        borderLeftColor: open ? color : "transparent",
        background: open
          ? `radial-gradient(ellipse 100% 80% at 0% 0%, ${color}0C 0%, transparent 50%), rgba(var(--trgb),0.03)`
          : `rgba(var(--trgb),0.025)`,
        boxShadow: open ? `0 0 20px ${color}0A` : "none",
      }}
      onClick={toggle}
      onKeyDown={onKey}
    >
      <div className="bd-h">
        <div className="bd-hl">
          <span className="bd-tag" style={{ color, borderColor: `${color}55` }}>{tag}</span>
          <span className="bd-tot"><Scramble text={fmt(total)} duration={300} trigger={scr} /></span>
          <span className="bd-pct" style={{ color: `${color}88` }}>{pct}%</span>
        </div>
        <span className="bd-chev" style={{ transform: open ? "rotate(90deg)" : "", color: open ? color : "rgba(var(--trgb),0.3)" }} aria-hidden>
          ›
        </span>
      </div>
      <div className="bd-minibar"><div className="bd-minibar-f" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 12px ${color}45` }} /></div>
      {!hideBody && highlight && <div className="bd-hl-row" style={{ color }}>{highlight}</div>}
      {!hideBody && (
        <div className="bd-b">
          <div className="bd-bi">
            {rows.map(([n, v, note], i) => (
              <div key={i} className="bd-r">
                <span className="bd-rn">{n}<span className="bd-rno">{note}</span></span>
                <span className="bd-rv" style={{ color: `${color}CC` }}><Scramble text={`$${v.toLocaleString()}`} duration={280} trigger={scr} /></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InactionToast({ startTime, dailyLoss, onDismiss }) {
  const [lost, setLost] = useState(0);
  const perMs = dailyLoss / (8 * 3600 * 1000);
  useEffect(() => {
    const tick = () => { setLost(Math.round((Date.now() - startTime) * perMs)); raf.current = requestAnimationFrame(tick); };
    const raf = { current: requestAnimationFrame(tick) };
    return () => cancelAnimationFrame(raf.current);
  }, [startTime, perMs]);
  return (
    <div className="toast-inaction" onClick={onDismiss}>
      <span className="toast-label">ELAPSED VALUE LOSS</span>
      <span className="toast-val">${lost.toLocaleString()}</span>
      <span className="toast-sub">since this session opened</span>
    </div>
  );
}

