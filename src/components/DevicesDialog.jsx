import { useState } from 'react';
import Modal from './Modal';
import { toError } from '../lib/api';

export default function DevicesDialog({ devices, selected, onAdd, onScan, onForget, onSelect, scanning, onClose }) {
  const [ip, setIp] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const add = async (e) => {
    e.preventDefault();
    if (!ip.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const info = await onAdd(ip.trim());
      setMessage({ tone: 'ok', text: `Added ${info.name}.` });
      setIp('');
    } catch (err) {
      setMessage({ tone: 'error', text: toError(err).message });
    } finally {
      setBusy(false);
    }
  };

  const scan = async () => {
    setMessage(null);
    const found = await onScan();
    setMessage({ tone: found.length ? 'ok' : 'error', text: found.length ? `Found ${found.length} Roku${found.length > 1 ? 's' : ''}.` : 'No Rokus answered. Try adding one by IP.' });
  };

  return (
    <Modal title="Your Rokus" onClose={onClose}>
      <form className="add-form" onSubmit={add}>
        <label htmlFor="add-ip">Add by IP address</label>
        <div className="kb-row">
          <input id="add-ip" type="text" inputMode="decimal" placeholder="e.g. 192.168.1.20" value={ip} onChange={(e) => setIp(e.target.value)} autoFocus />
          <button type="submit" className="btn small primary" disabled={busy || !ip.trim()}>
            {busy ? 'Checking…' : 'Add'}
          </button>
        </div>
        <p className="fine">On the Roku: Settings › Network › About.</p>
      </form>
      {message && <p className={`form-msg ${message.tone}`}>{message.text}</p>}
      <button type="button" className="btn wide-btn" onClick={scan} disabled={scanning}>
        {scanning ? 'Scanning your network…' : '🔎 Scan my whole network'}
      </button>
      {devices.length > 0 && (
        <ul className="device-list">
          {devices.map((d) => (
            <li key={d.id} className={d.id === selected?.id ? 'current' : ''}>
              <button type="button" className="device-pick" onClick={() => { onSelect(d.id); onClose(); }}>
                <b>{d.name}</b>
                <span>{[d.model, d.ip].filter(Boolean).join(' · ')}</span>
              </button>
              <button type="button" className="link-btn" onClick={() => onForget(d.id)}>
                Forget
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
