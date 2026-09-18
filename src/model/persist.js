const STORAGE_KEY = "fo-session-v1";

export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveSession(payload) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        updatedAt: Date.now(),
        ...payload,
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

export function hasStoredSession() {
  return loadSession() != null;
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
