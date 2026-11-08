const STATUS_TEXT = {
  online: 'Connected',
  standby: 'Screen off',
  offline: 'Not responding',
  limited: 'Limited mode',
  checking: 'Checking…',
  scanning: 'Searching…',
  none: 'No TV connected',
};

function ago(ts) {
  if (!ts) return '';
  const seconds = Math.round((Date.now() - ts) / 1000);
  return seconds < 5 ? 'just now' : seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)}m ago`;
}

export default function DeviceBar({ devices, selected, select, status, scanning, onRescan, onManage }) {
  const software = selected?.softwareVersion
    ? `${selected.platform === 'androidtv' ? 'Remote Service' : 'Roku OS'} ${selected.softwareVersion}`
    : '';
  const detail = selected ? [selected.model, software].filter(Boolean).join(' · ') : '';
  return (
    <div className="device-bar">
      <div className="device-row">
        <span className={`dot ${status.state}`} title={status.checkedAt ? `Checked ${ago(status.checkedAt)}` : undefined} />
        {devices.length > 0 ? (
          <select
            className="device-select"
            value={selected?.id ?? ''}
            onChange={(event) => { select(event.target.value); event.target.blur(); }}
            aria-label="TV device"
          >
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}{device.location && device.location !== device.name ? ` — ${device.location}` : ''}
                {device.platform === 'androidtv' ? ' · Android TV' : ' · Roku'}
              </option>
            ))}
          </select>
        ) : (
          <div className="device-select empty">{scanning ? 'Searching your network…' : 'No TV connected yet'}</div>
        )}
        <button type="button" className="icon-btn" onClick={onRescan} disabled={scanning} title="Search for Roku devices" aria-label="Search for Roku devices">
          <span className={scanning ? 'spin' : ''}>⟳</span>
        </button>
        <button type="button" className="icon-btn" onClick={onManage} title="Pair a TV or manage devices" aria-label="Pair or manage TVs">＋</button>
      </div>
      <div className="device-status">
        <span className={`status-text ${status.state}`}>{STATUS_TEXT[status.state] ?? ''}</span>
        {detail && <span className="status-detail">{detail}</span>}
      </div>
    </div>
  );
}
