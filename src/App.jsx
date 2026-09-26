import { useCallback, useEffect, useRef, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { useRoku } from './hooks/useRoku';
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
  const { selected: sel, status, press } = roku;

  const [dialog, setDialog] = useState(null);
  const dialogRef = useRef(dialog);
  dialogRef.current = dialog;
  const closeDialog = useCallback(() => setDialog(null), []);

  // ── Mini remote: small, always on top ──
  const [compact, setCompact] = useState(() => load('compact', false));
  useEffect(() => {
    if (compact) applyWindowMode(true);
    // Only restore the saved mode on launch; toggling applies it directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggleCompact = () => {
    const next = !compact;
    setCompact(next);
    save('compact', next);
    applyWindowMode(next);
  };

  // ── Keyboard shortcuts ──
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
      // A button reached with Tab keeps Enter/Space for itself.
      if ((e.key === 'Enter' || e.key === ' ') && target?.closest('button')) return;
      e.preventDefault();
      if (item.action === 'help') return setDialog({ type: 'help', tab: 'keys' });
      if (item.action === 'type') return typingRef.current?.focus();
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
  }, [press]);

  // ── Channels and what's playing ──
  const [apps, setApps] = useState([]);
  const [appsState, setAppsState] = useState({ loading: false, error: null });
  const [activeAppId, setActiveAppId] = useState(null);

  const selIdRef = useRef(sel?.id);
  selIdRef.current = sel?.id;

  const loadApps = useCallback(async () => {
    if (!sel) return;
    const forId = sel.id;
    setAppsState({ loading: true, error: null });
    try {
      const list = await api.apps(sel.ip);
      // The user may have switched Rokus while this was loading.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.id, sel?.ip]);

  useEffect(() => {
    setApps([]);
    setActiveAppId(null);
    setAppsState({ loading: false, error: null });
  }, [sel?.id]);

  const reachable = status.state === 'online' || status.state === 'standby';
  useEffect(() => {
    if (reachable && !apps.length) loadApps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reachable, sel?.id]);

  const selIp = sel?.ip;
  useEffect(() => {
    if (!selIp || compact || status.state !== 'online') return undefined;
    let live = true;
    const poll = () => {
      if (document.visibilityState !== 'visible') return;
      api.activeApp(selIp).then(
        (a) => live && setActiveAppId(a?.id ?? null),
        () => {},
      );
    };
    poll();
    const id = setInterval(poll, 10_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [selIp, compact, status.state]);

  const launchApp = async (appId) => {
    if (await roku.launch(appId)) setActiveAppId(appId);
  };

  // ── One-time rating prompt after ten minutes of use ──
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

  // ── Feedback straight to GitHub ──
  const reportProblem = () => openLink(issueUrl('bug', { device: sel, lastError: roku.lastError ?? status.error }));
  const suggestIdea = () => openLink(issueUrl('idea'));
  const rate = () => openLink(rateUrl());
  const openHelp = (tab = 'fix') => setDialog({ type: 'help', tab });

  return (
    <div className={`app${compact ? ' compact' : ''}`}>
      <TitleBar deviceName={sel?.name} compact={compact} onToggleCompact={toggleCompact} onHelp={() => openHelp()} />
      <DeviceBar
        devices={roku.devices}
        selected={sel}
        select={roku.select}
        status={status}
        scanning={roku.scanning}
        onRescan={() => roku.discover()}
        onManage={() => setDialog({ type: 'devices' })}
      />

      <main className="main">
        <Banner
          status={status}
          device={sel}
          scanning={roku.scanning}
          waking={roku.waking}
          onRecheck={roku.check}
          onPowerOn={roku.powerOn}
          onRescan={() => roku.discover()}
          onManage={() => setDialog({ type: 'devices' })}
          onHelp={() => openHelp()}
        />

        <Remote
          device={sel}
          press={press}
          launch={launchApp}
          flash={flash}
          powerOn={roku.powerOn}
          waking={roku.waking}
          inputs={apps.filter((a) => a.type === 'tvin')}
          compact={compact}
        />

        {!compact && (
          <>
            <Keyboard key={sel?.id ?? 'none'} ref={typingRef} device={sel} press={press} typeText={roku.typeText} />
            {sel && (
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
            <p className="tip">
              Tip: your keyboard is a remote too — arrows, Enter, Backspace, Space.{' '}
              <button type="button" className="link-btn" onClick={() => openHelp('keys')}>
                All shortcuts (?)
              </button>
            </p>
            <Footer onReport={reportProblem} onIdea={suggestIdea} onRate={rate} />
          </>
        )}
      </main>

      <Toast toast={toast} onClose={() => setToast(null)} />

      {dialog?.type === 'help' && (
        <HelpDialog initialTab={dialog.tab} device={sel} lastError={roku.lastError ?? status.error} onReport={reportProblem} onClose={closeDialog} />
      )}
      {dialog?.type === 'devices' && (
        <DevicesDialog
          devices={roku.devices}
          selected={sel}
          scanning={roku.scanning}
          onAdd={roku.addByIp}
          onScan={() => roku.discover({ deep: true })}
          onForget={roku.forget}
          onSelect={roku.select}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === 'rate' && <RatePrompt onIdea={suggestIdea} onClose={closeDialog} />}
    </div>
  );
}
