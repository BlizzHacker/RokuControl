import { useState } from 'react';
import Modal from './Modal';
import { toError } from '../lib/api';

export default function DevicesDialog({ devices, selected, onAdd, onStartPairing, onFinishPairing, onCancelPairing, onScan, onForget, onSelect, scanning, onClose }) {
  const [platform, setPlatform] = useState('roku');
  const [ip, setIp] = useState('');
  const [pairingIp, setPairingIp] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const add = async (event) => {
    event.preventDefault();
    if (!ip.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      if (platform === 'roku') {
        const info = await onAdd(ip.trim());
        setMessage({ tone: 'ok', text: `Added ${info.name}.` });
        setIp('');
      } else {
        const pairing = await onStartPairing(ip.trim());
        setPairingIp(ip.trim());
        setPairingCode('');
        const tvName = pairing.serverName || 'your TV';
        setMessage({ tone: 'ok', text: `Enter the six-character code shown on ${tvName}.` });
      }
    } catch (error) {
      setMessage({ tone: 'error', text: toError(error).message });
    } finally {
      setBusy(false);
    }
  };

  const finishPairing = async (event) => {
    event.preventDefault();
    if (pairingCode.trim().length !== 6) return;
    setBusy(true);
    setMessage(null);
    try {
      const device = await onFinishPairing(pairingIp, pairingCode.trim());
      setMessage({ tone: 'ok', text: `Paired with ${device.name}.` });
      setPairingIp('');
      setPairingCode('');
      setIp('');
    } catch (error) {
      setMessage({ tone: 'error', text: toError(error).message });
    } finally {
      setBusy(false);
    }
  };

  const cancelPairing = () => {
    onCancelPairing(pairingIp);
    setPairingIp('');
    setPairingCode('');
    setMessage(null);
  };

  const scan = async () => {
    setMessage(null);
    const found = await onScan();
    setMessage({ tone: found.length ? 'ok' : 'error', text: found.length ? `Found ${found.length} Roku${found.length > 1 ? 's' : ''}.` : 'No Roku devices answered. Try adding one by IP.' });
  };

  return (
    <Modal title="Your TVs" onClose={onClose}>
      <form className="add-form" onSubmit={add}>
        <label htmlFor="device-platform">TV platform</label>
        <select id="device-platform" className="platform-select" value={platform} onChange={(event) => setPlatform(event.target.value)}>
          <option value="roku">Roku TV or player</option>
          <option value="androidtv">Android TV or Google TV</option>
        </select>
        <label htmlFor="add-ip">{platform === 'roku' ? 'Add by IP address' : 'Pair by IP address'}</label>
        <div className="kb-row">
          <input id="add-ip" type="text" inputMode="decimal" placeholder="e.g. 192.168.1.20" value={ip} onChange={(event) => setIp(event.target.value)} autoFocus />
          <button type="submit" className="btn small primary" disabled={busy || !ip.trim()}>
            {busy ? 'Connecting…' : platform === 'roku' ? 'Add Roku' : 'Pair Android TV'}
          </button>
        </div>
        <p className="fine">{platform === 'roku'
          ? 'Find the address on the TV under Settings › Network › About.'
          : 'Open Android TV Remote Service on the TV and keep it on the same network.'}</p>
      </form>

      {pairingIp && (
        <form className="add-form pair-form" onSubmit={finishPairing}>
          <label htmlFor="pair-code">Enter the six-character code shown on your TV</label>
          <div className="kb-row">
            <input id="pair-code" type="text" autoComplete="one-time-code" maxLength={6} placeholder="A1B2C3" value={pairingCode} onChange={(event) => setPairingCode(event.target.value.toUpperCase())} />
            <button type="submit" className="btn small primary" disabled={busy || pairingCode.trim().length !== 6}>{busy ? 'Pairing…' : 'Confirm'}</button>
          </div>
          <button type="button" className="link-btn" onClick={cancelPairing}>Cancel pairing</button>
        </form>
      )}

      {message && <p className={`form-msg ${message.tone}`}>{message.text}</p>}
      <button type="button" className="btn wide-btn" onClick={scan} disabled={scanning}>
        {scanning ? 'Scanning your network…' : '🔎 Find Roku devices on my network'}
      </button>
      {devices.length > 0 && (
        <ul className="device-list">
          {devices.map((device) => (
            <li key={device.id} className={device.id === selected?.id ? 'current' : ''}>
              <button type="button" className="device-pick" onClick={() => { onSelect(device.id); onClose(); }}>
                <b>{device.name}</b>
                <span>{[device.platform === 'androidtv' ? 'Android TV / Google TV' : 'Roku', device.model, device.ip].filter(Boolean).join(' · ')}</span>
              </button>
              <button type="button" className="link-btn" onClick={() => onForget(device.id)}>Forget</button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
