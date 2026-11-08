import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { useRoku } from './hooks/useRoku';
import { useAndroidTv } from './hooks/useAndroidTv';
import { api, toError } from './lib/api';
import { load, save } from './lib/storage';
import { usage } from './lib/usage';
import { issueUrl, openLink, rateUrl } from './lib/links';
import { REPEATABLE, SHORTCUTS, normalizeKey } from './lib/shortcuts';
import TitleBar from './components/TitleBar';
import DeviceBar from './components/DeviceBar';
import Banner from './components/Banner';
import Remote from './components/Remote';
import Keyboard from './components/Keyboard';
import Apps from './components/Apps';
import Footer from './components/Footer';
import Toast from './components/Toast';
import HelpDialog from './components/HelpDialog';
import DevicesDialog from './components/DevicesDialog';
import RatePrompt from './components/RatePrompt';

const FULL = { w: 480, h: 820, minW: 400, minH: 650 };
const MINI = { w: 300, h: 540, minW: 280, minH: 460 };

async function applyWindowMode(compact) {
  const m = compact ? MINI : FULL;
  try {
    const win = getCurrentWindow();
    await win.setAlwaysOnTop(compact);
    await win.setMinSize(new LogicalSize(m.minW, m.minH));
    await win.setSize(new LogicalSize(m.w, m.h));
  } catch {
    // Not inside Tauri (plain browser dev server).
  }
}

export default function App() {
  const [toast, setToast] = useState(null);
  const toastTimer = useRef();
  const notify = useCallback((message, tone = 'error', ms = 6000) => {
    setToast({ message, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  const roku = useRoku({ notify });
  const android = useAndroidTv({ notify });
  const devices = [...roku.devices, ...android.devices];
  const [activeId, setActiveId] = useState(() => load('activeDevice', load('selected', null)));
  const sel = devices.find((device) => device.id === activeId) ?? roku.selected ?? android.selected ?? null;
  const isAndroidTv = sel?.platform === 'androidtv';
  const status = sel ? (isAndroidTv ? android.status : roku.status) : { state: roku.scanning ? 'scanning' : 'none' };
  const waking = isAndroidTv ? android.waking : roku.waking;
  const scanning = roku.scanning;
  const lastError = isAndroidTv ? android.lastError : roku.lastError;

  const selectDevice = useCallback((id) => {
    setActiveId(id);
    save('activeDevice', id);
    const device = devices.find((item) => item.id === id);
    if (device?.platform === 'androidtv') android.select(id);
    else if (device) roku.select(id);
  }, [devices, android.select, roku.select]);

  useEffect(() => {
    if (!sel) return;
    save('activeDevice', sel.id);
    if (sel.platform === 'androidtv') android.select(sel.id);
    else roku.select(sel.id);
  }, [sel?.id, sel?.platform, android.select, roku.select]);

  const press = useCallback((key, options) => isAndroidTv ? android.press(key, options) : roku.press(key, options), [isAndroidTv, android.press, roku.press]);
  const powerOn = useCallback(() => isAndroidTv ? android.powerOn() : roku.powerOn(), [isAndroidTv, android.powerOn, roku.powerOn]);
  const check = useCallback(() => isAndroidTv ? android.check() : roku.check(), [isAndroidTv, android.check, roku.check]);

  const [dialog, setDialog] = useState(null);
  const dialogRef = useRef(dialog);
  dialogRef.current = dialog;
  const closeDialog = useCallback(() => setDialog(null), []);

  const [compact, setCompact] = useState(() => load('compact', false));
  useEffect(() => {
    if (compact) applyWindowMode(true);
  }, []);
  const toggleCompact = () => {
    const next = !compact;
    setCompact(next);
    save('compact', next);
    applyWindowMode(next);
  };

  const typingRef = useRef(null);
  const [flash, setFlash] = useState(null);
  const flashTimer = useRef();
  const lastRepeat = useRef(0);
  useEffect(() => {
    const onKey = (e) => {
      if (dialogRef.current || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const item = SHORTCUTS.get(normalizeKey(e.key));
      if (!item) return;
      if ((e.key === 'Enter' || e.key === ' ') && target?.closest('button')) return;
      e.preventDefault();
      if (item.action === 'help') return setDialog({ type: 'help', tab: 'keys' });
      if (item.action === 'type') {
        if (!isAndroidTv) typingRef.current?.focus();
        return;
      }
      if (e.repeat) {
        if (!REPEATABLE.has(item.roku) || performance.now() - lastRepeat.current < 110) return;
        lastRepeat.current = performance.now();
      }
      press(item.roku, { droppable: e.repeat });
      setFlash(item.roku);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 160);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press, isAndroidTv]);

  const [apps, setApps] = useState([]);
  const [appsState, setAppsState] = useState({ loading: false, error: null });
  const [activeAppId, setActiveAppId] = useState(null);
  const selIdRef = useRef(sel?.id);
  selIdRef.current = sel?.id;

  const loadApps = useCallback(async () => {
    if (!sel || sel.platform === 'androidtv') return;
    const forId = sel.id;
    setAppsState({ loading: true, error: null });
    try {
      const list = await api.apps(sel.ip);
      if (selIdRef.current !== forId) return;
      setApps(list);
      setAppsState({ loading: false, error: null });
    } catch (e) {
      if (selIdRef.current !== forId) return;
      const err = toError(e);
      setAppsState({
        loading: false,
        error: err.kind === 'limited' ? 'Channels are hidden while the Roku is in Limited mode.' : err.message,
      });
    }
  }, [sel?.id, sel?.ip, sel?.platform]);

  useEffect(() => {
    setApps([]);
    setActiveAppId(null);
    setAppsState({ loading: false, error: null });
  }, [sel?.id]);

  const reachable = status.state === 'online' || status.state === 'standby';
  useEffect(() => {
    if (reachable && sel?.platform !== 'androidtv' && !apps.length) loadApps();
  }, [reachable, sel?.id, sel?.platform, apps.length, loadApps]);

  useEffect(() => {
    if (!sel?.ip || sel.platform === 'androidtv' || compact || status.state !== 'online') return undefined;
    let live = true;
    const poll = () => {
      if (document.visibilityState !== 'visible') return;
      api.activeApp(sel.ip).then((app) => live && setActiveAppId(app?.id ?? null), () => {});
    };
    poll();
    const id = setInterval(poll, 10_000);
    return () => { live = false; clearInterval(id); };
  }, [sel?.ip, sel?.platform, compact, status.state]);

  const launchApp = async (appId) => {
    if (isAndroidTv) return false;
    if (await roku.launch(appId)) setActiveAppId(appId);
    return true;
  };

  useEffect(() => {
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      if (document.visibilityState === 'visible') usage.addActiveTime(Math.min(now - last, 30_000));
      last = now;
      if (!dialogRef.current && usage.shouldAskForRating()) {
        usage.markRatingAsked();
        setDialog({ type: 'rate' });
      }
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  const reportProblem = () => openLink(issueUrl('bug', { device: sel, lastError: lastError ?? status.error }));
  const suggestIdea = () => openLink(issueUrl('idea'));
  const rate = () => openLink(rateUrl());
  const openHelp = (tab = 'fix') => setDialog({ type: 'help', tab });

  const addRoku = useCallback(async (ip) => {
    const info = await roku.addByIp(ip);
    const id = info.serial || info.deviceId || `ip:${info.ip}`;
    selectDevice(id);
    return info;
  }, [roku.addByIp, selectDevice]);

  const finishAndroidPairing = useCallback(async (ip, code) => {
    const device = await android.finishPairing(ip, code);
    selectDevice(device.id);
    return device;
  }, [android.finishPairing, selectDevice]);

  const forgetDevice = useCallback((id) => {
    const device = devices.find((item) => item.id === id);
    if (device?.platform === 'androidtv') android.forget(id);
    else roku.forget(id);
    if (activeId === id) {
      const next = devices.find((item) => item.id !== id);
      setActiveId(next?.id ?? null);
      if (next) save('activeDevice', next.id);
    }
  }, [devices, android.forget, roku.forget, activeId]);

  return (
    <div className={`app${compact ? ' compact' : ''}`}>
      <TitleBar deviceName={sel?.name} compact={compact} onToggleCompact={toggleCompact} onHelp={() => openHelp()} />
      <DeviceBar
        devices={devices}
        selected={sel}
        select={selectDevice}
        status={status}
        scanning={scanning}
        onRescan={() => roku.discover()}
        onManage={() => setDialog({ type: 'devices' })}
      />

      <main className="main">
        <Banner
          status={status}
          device={sel}
          scanning={scanning}
          waking={waking}
          onRecheck={check}
          onPowerOn={powerOn}
          onRescan={() => roku.discover()}
          onManage={() => setDialog({ type: 'devices' })}
          onHelp={() => openHelp()}
        />

        <Remote
          device={sel}
          press={press}
          launch={launchApp}
          flash={flash}
          powerOn={powerOn}
          waking={waking}
          inputs={apps.filter((a) => a.type === 'tvin')}
          compact={compact}
        />

        {!compact && (
          <>
            {isAndroidTv
              ? <p className="tip">Paired to Android TV / Google TV. Use the directional pad, Back, Home, playback and volume controls.</p>
              : <Keyboard key={sel?.id ?? 'none'} ref={typingRef} device={sel} press={press} typeText={roku.typeText} />}
            {sel && !isAndroidTv && (
              <Apps
                device={sel}
                apps={apps}
                activeAppId={activeAppId}
                loading={appsState.loading}
                error={appsState.error}
                onLaunch={launchApp}
                onReload={loadApps}
              />
            )}
            {!isAndroidTv && <p className="tip">
              Tip: your keyboard is a remote too — arrows, Enter, Backspace, Space.{' '}
              <button type="button" className="link-btn" onClick={() => openHelp('keys')}>All shortcuts (?)</button>
            </p>}
            <Footer onReport={reportProblem} onIdea={suggestIdea} onRate={rate} />
          </>
        )}
      </main>

      <Toast toast={toast} onClose={() => setToast(null)} />

      {dialog?.type === 'help' && (
        <HelpDialog initialTab={dialog.tab} device={sel} lastError={lastError ?? status.error} onReport={reportProblem} onClose={closeDialog} />
      )}
      {dialog?.type === 'devices' && (
        <DevicesDialog
          devices={devices}
          selected={sel}
          scanning={scanning}
          onAdd={addRoku}
          onStartPairing={android.startPairing}
          onFinishPairing={finishAndroidPairing}
          onCancelPairing={android.cancelPairing}
          onScan={() => roku.discover({ deep: true })}
          onForget={forgetDevice}
          onSelect={selectDevice}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === 'rate' && <RatePrompt onIdea={suggestIdea} onClose={closeDialog} />}
    </div>
  );
}
