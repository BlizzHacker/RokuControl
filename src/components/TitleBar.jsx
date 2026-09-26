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
          ⏻
        </span>
        <span className="titlebar-text">Roku Control</span>
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
