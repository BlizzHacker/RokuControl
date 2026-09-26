import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, createSender, toError } from '../lib/api';
import { load, save } from '../lib/storage';
import { usage } from '../lib/usage';

const POLL_MS = 8000;
const REDISCOVER_MS = 60_000;
const VOLUME_KEYS = new Set(['VolumeUp', 'VolumeDown', 'VolumeMute']);

const uniq = (xs) => [...new Set(xs.filter(Boolean))];

/**
 * Fold a device-info result into the saved list. Rokus are matched by serial,
 * so when the router hands one a new IP the saved entry follows it instead of
 * stranding the user on a dead address.
 */
export function mergeDevice(list, info, extra = {}) {
  const i = list.findIndex((d) =>
    info.serial ? d.serial === info.serial || (!d.serial && d.ip === info.ip) : d.ip === info.ip,
  );
  const prev = i >= 0 ? list[i] : null;
  const { wifiMac, ethernetMac, ...rest } = info;
  const fields = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== '' && v != null));
  // A Roku in Limited mode can come back with only an IP; keep what we knew.
  if (prev && !info.serial) delete fields.name;
  const record = {
    ...prev,
    ...fields,
    ...extra,
    id: prev?.id ?? (info.serial || info.deviceId || `ip:${info.ip}`),
    macs: uniq([...(prev?.macs ?? []), wifiMac, ethernetMac]),
    lastSeen: Date.now(),
  };
  const next = [...list];
  if (i >= 0) next[i] = record;
  else next.push(record);
  return next;
}

export function statusFromInfo(info) {
  const mode = (info.ecpMode || '').toLowerCase();
  let state = 'online';
  if (mode === 'limited' || mode === 'disabled') state = 'limited';
  else if (info.powerMode && info.powerMode !== 'PowerOn') state = 'standby';
  return { state, checkedAt: Date.now() };
}

export function useRoku({ notify }) {
  const [devices, setDevices] = useState(() => load('devices', []));
  const [selectedId, setSelectedId] = useState(() => load('selected', null));
  const [status, setStatus] = useState({ state: 'checking' });
  const [scanning, setScanning] = useState(false);
  const [waking, setWaking] = useState(false);
  const [lastError, setLastError] = useState(null);

  const selected = devices.find((d) => d.id === selectedId) ?? devices[0] ?? null;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => save('devices', devices), [devices]);
  useEffect(() => save('selected', selected?.id ?? null), [selected?.id]);

  const discover = useCallback(async ({ deep = false, quiet = false } = {}) => {
    if (!quiet) setScanning(true);
    try {
      const found = await api.discover(deep);
      setDevices((list) => found.reduce((acc, info) => mergeDevice(acc, info), list));
      return found;
    } catch (e) {
      if (!quiet) notifyRef.current(toError(e).message);
      return [];
    } finally {
      if (!quiet) setScanning(false);
    }
  }, []);

  const lastRediscover = useRef(0);
  const macLookups = useRef(new Set());

  // A real check against the device every few seconds. The status dot shows
  // only what the last check found, never a guess.
  const check = useCallback(async () => {
    const dev = selectedRef.current;
    if (!dev) return;
    try {
      const info = await api.deviceInfo(dev.ip);
      if (dev.serial && info.serial && info.serial !== dev.serial) {
        throw { kind: 'unreachable', message: `${dev.name} isn't at ${dev.ip} any more.` };
      }
      if (selectedRef.current?.id !== dev.id) return;
      setDevices((list) => mergeDevice(list, info));
      setStatus(statusFromInfo(info));
      // Remember the MAC while the TV is on, so Wake-on-LAN can find it later.
      if (!info.wifiMac && !info.ethernetMac && !dev.macs?.length && !macLookups.current.has(dev.id)) {
        macLookups.current.add(dev.id);
        const mac = await api.lookupMac(dev.ip).catch(() => null);
        if (mac) setDevices((list) => list.map((d) => (d.id === dev.id ? { ...d, macs: uniq([...(d.macs ?? []), mac]) } : d)));
      }
    } catch (e) {
      const err = toError(e);
      if (selectedRef.current?.id !== dev.id) return;
      setStatus({ state: err.kind === 'limited' ? 'limited' : 'offline', checkedAt: Date.now(), error: err });
      // Most "it stopped working" reports are a new DHCP address. Go find it.
      if (err.kind === 'unreachable' && dev.serial && Date.now() - lastRediscover.current > REDISCOVER_MS) {
        lastRediscover.current = Date.now();
        const found = await discover({ quiet: true });
        const moved = found.find((f) => f.serial === dev.serial);
        if (moved && selectedRef.current?.id === dev.id) setStatus(statusFromInfo(moved));
      }
    }
  }, [discover]);

  // First launch: look for Rokus right away (the old build waited for a click).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    discover({ quiet: devices.length > 0 });
  }, [discover, devices.length]);

  useEffect(() => {
    if (!selected) return undefined;
    setStatus({ state: 'checking' });
    check();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') check();
    }, POLL_MS);
    return () => clearInterval(id);
    // Re-arm when the device or its address changes, not on every field update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.ip]);

  const send = useMemo(
    () =>
      createSender((err, meta) => {
        if (!err) {
          usage.recordCommand();
          setLastError(null);
          // Volume works even in Limited mode; anything else getting through means it's fixed.
          if (meta && !VOLUME_KEYS.has(meta)) {
            setStatus((s) => (s.state === 'limited' || s.state === 'offline' ? { state: 'online', checkedAt: Date.now() } : s));
          }
          return;
        }
        setLastError(err);
        if (err.kind === 'limited') setStatus((s) => ({ ...s, state: 'limited', error: err }));
        else if (err.kind === 'unreachable') {
          setStatus((s) => ({ ...s, state: 'offline', error: err }));
          check();
        } else notifyRef.current(err.message);
      }),
    [check],
  );

  const press = useCallback(
    (key, opts) => {
      const dev = selectedRef.current;
      if (!dev) return Promise.resolve(false);
      return send(() => api.keypress(dev.ip, key), { ...opts, meta: key });
    },
    [send],
  );

  const typeText = useCallback(
    (text) => {
      const dev = selectedRef.current;
      if (!dev || !text) return Promise.resolve(false);
      return send(() => api.sendText(dev.ip, text), { meta: 'text' });
    },
    [send],
  );

  const launch = useCallback(
    (appId) => {
      const dev = selectedRef.current;
      if (!dev) return Promise.resolve(false);
      return send(() => api.launch(dev.ip, appId), { meta: 'launch' });
    },
    [send],
  );

  const powerOn = useCallback(async () => {
    const dev = selectedRef.current;
    if (!dev || waking) return;
    setWaking(true);
    try {
      const report = await api.powerOn(dev.ip, dev.macs ?? []);
      usage.recordCommand();
      notifyRef.current(report.method === 'wakeOnLan' ? `${dev.name} woke up.` : `Turning on ${dev.name}…`, 'info');
      setTimeout(check, 1500);
    } catch (e) {
      const err = toError(e);
      setLastError(err);
      if (err.kind === 'limited') setStatus((s) => ({ ...s, state: 'limited', error: err }));
      else notifyRef.current(err.message, 'error', 12000);
    } finally {
      setWaking(false);
    }
  }, [check, waking]);

  const devicesRef = useRef(devices);
  devicesRef.current = devices;

  const addByIp = useCallback(async (ip) => {
    const info = await api.deviceInfo(ip);
    const next = mergeDevice(devicesRef.current, info, { manual: true });
    setDevices(next);
    const added = next.find((d) => (info.serial && d.serial === info.serial) || d.ip === info.ip);
    if (added) setSelectedId(added.id);
    return info;
  }, []);

  const forget = useCallback((id) => {
    setDevices((list) => list.filter((d) => d.id !== id));
  }, []);

  return {
    devices,
    selected,
    select: setSelectedId,
    status: selected ? status : { state: scanning ? 'scanning' : 'none' },
    scanning,
    waking,
    lastError,
    discover,
    check,
    press,
    typeText,
    launch,
    powerOn,
    addByIp,
    forget,
  };
}
