import { invoke } from '@tauri-apps/api/core';

/** Anything `invoke` throws, as `{ kind, message }` (the Rust side sends that shape). */
export function toError(e) {
  if (e && typeof e === 'object' && typeof e.kind === 'string') return e;
  return { kind: 'other', message: String(e?.message ?? e) };
}

export const api = {
  discover: (deep = false) => invoke('discover', { deep }),
  deviceInfo: (ip) => invoke('device_info', { ip }),
  apps: (ip) => invoke('get_apps', { ip }),
  activeApp: (ip) => invoke('active_app', { ip }),
  appIcon: (ip, appId) => invoke('app_icon', { ip, appId }),
  keypress: (ip, key) => invoke('keypress', { ip, key }),
  launch: (ip, appId) => invoke('launch', { ip, appId }),
  sendText: (ip, text) => invoke('send_text', { ip, text }),
  powerOn: (ip, macs) => invoke('power_on', { ip, macs }),
  lookupMac: (ip) => invoke('lookup_mac', { ip }),
  openLink: (url) => invoke('open_link', { url }),
};

/**
 * Commands to a Roku must land in order ("Down, Down, OK" is not "OK, Down,
 * Down"), so they run one at a time. When one fails, everything still queued
 * is dropped, so a TV that comes back doesn't replay a backlog of presses.
 */
export function createSender(onResult) {
  let chain = Promise.resolve();
  let pending = 0;
  let generation = 0;

  return function enqueue(task, { droppable = false, meta } = {}) {
    // Held keys repeat fast; don't let them pile up behind a slow TV.
    if (droppable && pending >= 4) return Promise.resolve(false);
    pending++;
    const gen = generation;
    chain = chain.then(async () => {
      try {
        if (gen !== generation) return false;
        await task();
        onResult(null, meta);
        return true;
      } catch (e) {
        generation++;
        onResult(toError(e), meta);
        return false;
      } finally {
        pending--;
      }
    });
    return chain;
  };
}
