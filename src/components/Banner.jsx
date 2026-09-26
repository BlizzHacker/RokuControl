// What's wrong and how to fix it, in plain words, right where the user looks.
export default function Banner({ status, device, scanning, waking, onRecheck, onPowerOn, onRescan, onManage, onHelp }) {
  if (status.state === 'limited') {
    return (
      <div className="banner warn" role="alert">
        <strong>Your Roku is blocking this app</strong>
        <p>
          It's set to <em>Limited</em> mode, so only volume works. On the TV, open{' '}
          <b>Settings › System › Advanced system settings › Control by mobile apps</b> and choose <b>Enabled</b> (or set{' '}
          <b>Network access</b> to <b>Permissive</b>).
        </p>
        <div className="banner-actions">
          <button type="button" className="btn small primary" onClick={onRecheck}>
            I changed it — check again
          </button>
          <button type="button" className="btn small ghost" onClick={onHelp}>
            More help
          </button>
        </div>
      </div>
    );
  }
  if (status.state === 'offline' && device) {
    return (
      <div className="banner error" role="alert">
        <strong>Can't reach {device.name}</strong>
        <p>
          {device.isTv === false
            ? 'Make sure it has power and is on the same network as this computer.'
            : 'If the TV is off, try Turn on. Otherwise make sure it’s on the same network as this computer.'}
        </p>
        <div className="banner-actions">
          <button type="button" className="btn small primary" onClick={onPowerOn} disabled={waking}>
            {waking ? 'Waking…' : '⏻ Turn on'}
          </button>
          <button type="button" className="btn small" onClick={onRescan} disabled={scanning}>
            {scanning ? 'Searching…' : 'Search again'}
          </button>
          <button type="button" className="btn small ghost" onClick={onHelp}>
            Help
          </button>
        </div>
      </div>
    );
  }
  if (status.state === 'scanning') {
    return (
      <div className="banner info">
        <strong>
          <span className="spin">⟳</span> Looking for Rokus on your network…
        </strong>
        <p>This takes a few seconds.</p>
      </div>
    );
  }
  if (status.state === 'none') {
    return (
      <div className="banner info">
        <strong>No Roku found</strong>
        <ol>
          <li>Connect this computer to the same Wi-Fi as your Roku (not a guest network).</li>
          <li>On Windows, set that network to Private so the Roku can answer.</li>
          <li>Or add it by IP — on the Roku it's under Settings › Network › About.</li>
        </ol>
        <div className="banner-actions">
          <button type="button" className="btn small primary" onClick={onRescan} disabled={scanning}>
            Search again
          </button>
          <button type="button" className="btn small" onClick={onManage}>
            Add by IP
          </button>
          <button type="button" className="btn small ghost" onClick={onHelp}>
            Help
          </button>
        </div>
      </div>
    );
  }
  return null;
}
