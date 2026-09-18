export function fmt(n) {
  const a = Math.abs(n);
  const s = n < 0 ? "−" : "";
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${s}$${Math.round(a / 1e3)}K`;
  return `${s}$${a}`;
}

export function scTag(n) {
  const m = /^SCENARIO\s+(\d+)$/i.exec((n || "").trim());
  if (m) return `S${m[1]}`;
  return (n || "").slice(0, 3).toUpperCase();
}

export function fmtPlain(n) {
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}
