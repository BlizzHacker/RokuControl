import { getCurrentWindow } from '@tauri-apps/api/window';
import { exit } from '@tauri-apps/plugin-process';

const win = () => getCurrentWindow();

// Frameless window: drag anywhere on the bar that isn't a button.
function startDrag(e) {
  if (e.button !== 0 || e.target.closest('button')) return;
  win().startDragging().catch(() => {});
}

export default function TitleBar({ deviceName, compact, onToggleCompact, onHelp }) {
  return (
    <header className="titlebar" onMouseDown={startDrag}>
      <div className="titlebar-left">
        <span className="logo" aria-hidden>
          <svg viewBox="0 0 24 24" focusable="false">
            <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 3.5v5M12 20.5v-5M3.5 12h5M20.5 12h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="12" r="2.3" fill="currentColor" />
          </svg>
        </span>
        <span className="titlebar-text">Open Remote Control</span>
        {deviceName && !compact && <span className="titlebar-device">· {deviceName}</span>}
      </div>
      <div className="titlebar-buttons">
        <button type="button" className="tb-btn" onClick={onHelp} title="Help & shortcuts (?)" aria-label="Help">
          ?
        </button>
        <button
          type="button"
          className={`tb-btn${compact ? ' on' : ''}`}
          onClick={onToggleCompact}
          title={compact ? 'Back to the full remote' : 'Mini remote — stays on top of other windows'}
          aria-label="Mini remote"
          aria-pressed={compact}
        >
          📌
        </button>
        <button type="button" className="tb-btn" onClick={() => win().minimize().catch(() => {})} title="Minimize" aria-label="Minimize">
          ─
        </button>
        <button type="button" className="tb-btn close" onClick={() => exit(0).catch(() => win().close())} title="Close" aria-label="Close">
          ✕
        </button>
      </div>
    </header>
  );
}
