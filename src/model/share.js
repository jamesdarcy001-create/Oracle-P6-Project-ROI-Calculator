import { buildInputsFromSector, defaultPlatformCost } from "./calc.js";
import { DEFAULT_SCENARIO_NAMES } from "./constants.js";

function b64Encode(obj) {
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64Decode(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return JSON.parse(decodeURIComponent(escape(atob(base64))));
}

export function buildSharePayload(explorerState) {
  return {
    v: 1,
    gd: explorerState.guidedData,
    sec: explorerState.sector,
    st: explorerState.selectedState,
    in: explorerState.inputs,
    pn: explorerState.projectName,
    cn: explorerState.confirmedName,
    sc: explorerState.scenarios,
    sn: explorerState.scenarioNames,
  };
}

export function parseShareHash(hash) {
  if (!hash || typeof hash !== "string") return null;
  const m = hash.match(/^#?s=([^&]+)/);
  if (!m) return null;
  try {
    const data = b64Decode(m[1]);
    if (!data || data.v !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function buildShareUrl(explorerState) {
  const payload = buildSharePayload(explorerState);
  const base = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "";
  return `${base}#s=${b64Encode(payload)}`;
}

export async function copyShareUrl(explorerState) {
  const url = buildShareUrl(explorerState);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return url;
  }
  const ta = document.createElement("textarea");
  ta.value = url;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  return url;
}

export function explorerStateFromShare(data) {
  const sector = data.sec || data.gd?.sector || "infrastructure";
  const inputs =
    data.in ||
    buildInputsFromSector(sector, {
      ...data.gd,
      platformCost: data.gd?.platformCost ?? defaultPlatformCost(data.gd?.projectValue),
    });

  return {
    guidedData: data.gd || {
      projectName: data.cn || data.pn || "PROJECT",
      sector,
      state: data.st || inputs.state,
      ...inputs,
    },
    sector,
    selectedState: data.st || inputs.state,
    inputs,
    projectName: data.pn || data.gd?.projectName || "",
    confirmedName: data.cn || (data.gd?.projectName || "").toUpperCase(),
    scenarios: data.sc || [null, null, null],
    scenarioNames: data.sn || [...DEFAULT_SCENARIO_NAMES],
  };
}

export function explorerStateFromSession(session) {
  const sector = session.sector || "infrastructure";
  return {
    guidedData: session.guidedData,
    sector,
    selectedState: session.selectedState || session.inputs?.state,
    inputs: session.inputs,
    projectName: session.projectName || "",
    confirmedName: session.confirmedName || "",
    scenarios: session.scenarios || [null, null, null],
    scenarioNames: session.scenarioNames || [...DEFAULT_SCENARIO_NAMES],
  };
}
