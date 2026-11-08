import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, createSender, toError } from '../lib/api';
import { load, save } from '../lib/storage';
import { usage } from '../lib/usage';

const POLL_MS = 8000;

export function useAndroidTv({ notify }) {
  const [devices, setDevices] = useState(() => load('androidDevices', []));
  const [selectedId, setSelectedId] = useState(() => load('androidSelected', null));
  const [status, setStatus] = useState({ state: 'none' });
  const [waking, setWaking] = useState(false);
  const [lastError, setLastError] = useState(null);
  const selected = devices.find((device) => device.id === selectedId) ?? devices[0] ?? null;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  useEffect(() => save('androidDevices', devices), [devices]);
  useEffect(() => save('androidSelected', selected?.id ?? null), [selected?.id]);

  const check = useCallback(async () => {
    const device = selectedRef.current;
    if (!device) return;
    try {
      const refreshed = await api.androidTvConnect(device.ip);
      if (selectedRef.current?.id !== device.id) return;
      setDevices((list) => list.map((item) => item.id === device.id ? { ...item, ...refreshed, lastSeen: Date.now() } : item));
      setStatus({ state: 'online', checkedAt: Date.now() });
      setLastError(null);
    } catch (error) {
      const err = toError(error);
      if (selectedRef.current?.id !== device.id) return;
      setStatus({ state: 'offline', checkedAt: Date.now(), error: err });
      setLastError(err);
    }
  }, []);

  useEffect(() => {
    if (!selected) {
      setStatus({ state: 'none' });
      return undefined;
    }
    setStatus({ state: 'checking' });
    check();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') check();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [selected?.id, selected?.ip, check]);

  const startPairing = useCallback((ip) => api.androidTvStartPairing(ip), []);
  const finishPairing = useCallback(async (ip, code) => {
    const result = await api.androidTvFinishPairing(ip, code);
    const device = { ...result, platform: 'androidtv', lastSeen: Date.now() };
    setDevices((list) => {
      const next = [...list];
      const index = next.findIndex((item) => item.id === device.id || item.ip === device.ip);
      if (index >= 0) next[index] = { ...next[index], ...device };
      else next.push(device);
      return next;
    });
    setSelectedId(device.id);
    setStatus({ state: 'online', checkedAt: Date.now() });
    setLastError(null);
    return device;
  }, []);

  const cancelPairing = useCallback((ip) => api.androidTvCancelPairing(ip).catch(() => {}), []);

  const send = useMemo(() => createSender((err, key) => {
    if (!err) {
      usage.recordCommand();
      setLastError(null);
      if (key) setStatus((current) => current.state === 'offline' ? { state: 'online', checkedAt: Date.now() } : current);
      return;
    }
    setLastError(err);
    setStatus((current) => ({ ...current, state: 'offline', error: err }));
    notifyRef.current(err.message, 'error', 9000);
  }), []);

  const press = useCallback((key, options) => {
    const device = selectedRef.current;
    if (!device) return Promise.resolve(false);
    return send(() => api.androidTvKeypress(device.ip, key), { ...options, meta: key });
  }, [send]);

  const powerOn = useCallback(async () => {
    const device = selectedRef.current;
    if (!device || waking) return;
    setWaking(true);
    try {
      await api.androidTvPowerOn(device.ip);
      usage.recordCommand();
      notifyRef.current(`Wake request sent to ${device.name}.`, 'info');
      setTimeout(check, 1200);
    } catch (error) {
      const err = toError(error);
      setLastError(err);
      setStatus((current) => ({ ...current, state: 'offline', error: err }));
      notifyRef.current(err.message, 'error', 10000);
    } finally {
      setWaking(false);
    }
  }, [check, waking]);

  const forget = useCallback((id) => {
    const device = devices.find((item) => item.id === id);
    if (device) api.androidTvForget(device.ip).catch(() => {});
    setDevices((list) => list.filter((item) => item.id !== id));
    if (selectedId === id) setSelectedId(devices.find((item) => item.id !== id)?.id ?? null);
  }, [devices, selectedId]);

  return {
    devices,
    selected,
    select: setSelectedId,
    status: selected ? status : { state: 'none' },
    waking,
    lastError,
    startPairing,
    finishPairing,
    cancelPairing,
    check,
    press,
    powerOn,
    forget,
  };
}
