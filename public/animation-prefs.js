// Persistence for the node-pulse pause/toggle control (FACTORY-975/FACTORY-974's ACCESSIBILITY/
// CONTROLS item). A pure module, parameterized on the storage object rather than reaching for the
// global `localStorage` itself, so it's testable with a fake (or a deliberately-throwing one)
// without a browser — every call is wrapped in try/catch internally anyway, since the ticket
// requires this to "work fine without storage available" (a private-browsing mode, or a storage
// object that throws on access, not just on the individual get/set call).

export const ANIMATIONS_STORAGE_KEY = "seer:node-animations-enabled";

function safeStorage(storage) {
  try {
    return storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
  } catch {
    return null;
  }
}

/** Whether node pulses should be enabled, per persisted preference — defaults to enabled (`true`) when nothing is stored yet, or storage is unavailable/throws. */
export function loadAnimationsEnabled(storage) {
  const s = safeStorage(storage);
  if (!s) return true;
  try {
    const value = s.getItem(ANIMATIONS_STORAGE_KEY);
    return value === null ? true : value === "true";
  } catch {
    return true;
  }
}

/** Persists the pulse toggle. Silently does nothing if storage is unavailable or throws — the in-memory toggle still works for the rest of the session either way. */
export function saveAnimationsEnabled(enabled, storage) {
  const s = safeStorage(storage);
  if (!s) return;
  try {
    s.setItem(ANIMATIONS_STORAGE_KEY, String(enabled));
  } catch {
    // Storage unavailable/full/throwing — the toggle still works for this session, it just won't
    // survive a reload. Nothing to recover here.
  }
}
