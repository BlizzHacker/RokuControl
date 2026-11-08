export default function Banner({ status, device, scanning, waking, onRecheck, onPowerOn, onRescan, onManage, onHelp }) {
  const isAndroidTv = device?.platform === 'androidtv';
  if (status.state === 'limited' && !isAndroidTv) {
    return (
      <div className="banner warn" role="alert">
        <strong>Roku is blocking remote commands</strong>
        <p>
          It's set to <em>Limited</em> mode. On the TV, open <b>Settings › System › Advanced system settings › Control by mobile apps</b> and choose <b>Enabled</b> (or set <b>Network access</b> to <b>Permissive</b>).
        </p>
        <div className="banner-actions">
          <button type="button" className="btn small primary" onClick={onRecheck}>I changed it — check again</button>
          <button type="button" className="btn small ghost" onClick={onHelp}>More help</button>
        </div>
      </div>
    );
  }
  if (status.state === 'offline' && device) {
    return (
      <div className="banner error" role="alert">
        <strong>Can't reach {device.name}</strong>
        <p>{isAndroidTv
          ? 'Check that it has power, is on the same network, and that Open Remote Control is paired in Android TV Remote Service.'
          : device.isTv === false
            ? 'Make sure it has power and is on the same network as this computer.'
            : 'If the TV is off, try Turn on. Otherwise make sure it’s on the same network as this computer.'}</p>
        <div className="banner-actions">
          <button type="button" className="btn small primary" onClick={onPowerOn} disabled={waking}>{waking ? 'Waking…' : '⏻ Turn on'}</button>
          <button type="button" className="btn small" onClick={onRescan} disabled={scanning}>{scanning ? 'Searching…' : 'Search again'}</button>
          <button type="button" className="btn small ghost" onClick={onHelp}>Help</button>
        </div>
      </div>
    );
  }
  if (status.state === 'scanning') {
    return <div className="banner info"><strong><span className="spin">⟳</span> Looking for Roku devices…</strong><p>This takes a few seconds.</p></div>;
  }
  if (status.state === 'none') {
    return (
      <div className="banner info">
        <strong>No TV connected</strong>
        <ol>
          <li>Connect this computer and TV to the same home network.</li>
          <li>Roku devices are found automatically; Android TV / Google TV can be paired by IP.</li>
          <li>Guest Wi-Fi and network isolation can block remote control.</li>
        </ol>
        <div className="banner-actions">
          <button type="button" className="btn small primary" onClick={onRescan} disabled={scanning}>{scanning ? 'Searching…' : 'Search for Roku'}</button>
          <button type="button" className="btn small" onClick={onManage}>Pair or add a TV</button>
          <button type="button" className="btn small ghost" onClick={onHelp}>Help</button>
        </div>
      </div>
    );
  }
  return null;
}
