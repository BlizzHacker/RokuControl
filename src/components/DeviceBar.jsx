const STATUS_TEXT = {
  online: 'Connected',
  standby: 'Screen off',
  offline: 'Not responding',
  limited: 'Limited mode',
  checking: 'Checking…',
  scanning: 'Searching…',
  none: 'No Roku found',
};

function ago(ts) {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  return s < 5 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
}

export default function DeviceBar({ devices, selected, select, status, scanning, onRescan, onManage }) {
  const detail = selected
    ? [selected.model, selected.softwareVersion && `Roku OS ${selected.softwareVersion}`].filter(Boolean).join(' · ')
    : '';
  return (
    <div className="device-bar">
      <div className="device-row">
        <span className={`dot ${status.state}`} title={status.checkedAt ? `Checked ${ago(status.checkedAt)}` : undefined} />
        {devices.length > 0 ? (
          <select
            className="device-select"
            value={selected?.id ?? ''}
            onChange={(e) => {
              select(e.target.value);
              // Hand the arrow keys back to the remote.
              e.target.blur();
            }}
            aria-label="Roku device"
          >
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.location && d.location !== d.name ? ` — ${d.location}` : ''}
              </option>
            ))}
          </select>
        ) : (
          <div className="device-select empty">{scanning ? 'Searching your network…' : 'No Roku found yet'}</div>
        )}
        <button type="button" className="icon-btn" onClick={onRescan} disabled={scanning} title="Search for Rokus again" aria-label="Search again">
          <span className={scanning ? 'spin' : ''}>⟳</span>
        </button>
        <button type="button" className="icon-btn" onClick={onManage} title="Add by IP or manage devices" aria-label="Add or manage devices">
          ＋
        </button>
      </div>
      <div className="device-status">
        <span className={`status-text ${status.state}`}>{STATUS_TEXT[status.state] ?? ''}</span>
        {detail && <span className="status-detail">{detail}</span>}
      </div>
    </div>
  );
}
