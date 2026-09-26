// localStorage can throw (private mode, full disk, locked-down WebView), and
// nothing in this app is worth crashing over, so every access is guarded.
const PREFIX = 'rokucontrol.';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Non-essential; the app works without persistence.
  }
}
