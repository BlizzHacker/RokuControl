import React, { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

const PRELOADED = [
  { ip: '192.168.0.126', label: "Wade's Room — Hisense 58\"" },
  { ip: '192.168.0.124', label: "Alyra's Room — onn. 32\"" },
];

const ICONS = {
  netflix:'🔴',prime:'📦',hulu:'💚',youtube:'▶️',spotify:'🎵',plex:'🎬',
  disney:'🐭',apple:'🍎',hbo:'👁️',peacock:'🦚',starz:'⭐',paramount:'🏔️',
  espn:'⚽',crunchyroll:'🍥',tubi:'📺',pluto:'📡',pandora:'🔷',jellyfin:'🎞️',
  emby:'📀',cnn:'📰',directv:'📡',cbs:'👁️',fubo:'⚾',backdrops:'🖼️',
  hdmi:'🔌',av:'🔗',xcast:'📲',camdiggity:'📹',romm:'🕹️',
};
const icon = (n) => { const l=(n||'').toLowerCase(); for(const[k,v]of Object.entries(ICONS)) if(l.includes(k)) return v; return '📱'; };

export default function App({ widget = false }) {
  const [devices, setDevices] = useState(PRELOADED);
  const [sel, setSel] = useState(PRELOADED[0]);
  const [apps, setApps] = useState([]);
  const [showApps, setShowApps] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [vol, setVol] = useState(30);
  const [err, setErr] = useState('');
  const [text, setText] = useState('');

  const refresh = async () => {
    setScanning(true); setErr('');
    try {
      const found = await invoke('discover');
      if (found?.length) {
        const merged = [...PRELOADED];
        for (const d of found) {
          if (!merged.find(m => m.ip === d.ip))
            merged.push({ ip: d.ip, label: `${d.name || d.model} — ${d.vendor}` });
        }
        setDevices(merged);
        if (!sel) setSel(merged[0]);
      }
    } catch(e) { setErr(e+''); }
    setScanning(false);
  };

  const loadApps = useCallback(async (ip) => {
    try { const a = await invoke('get_apps', { ip }); if (a?.length) setApps(a); } catch(e) {}
  }, []);

  const selectDevice = (d) => { setSel(d); setApps([]); loadApps(d.ip); };

  const send = async (key) => {
    if (!sel) return;
    setErr('');
    try {
      await invoke('keypress', { ip: sel.ip, key });
      if (key === 'VolumeUp') setVol(v => Math.min(100, v+5));
      if (key === 'VolumeDown') setVol(v => Math.max(0, v-5));
      if (key === 'VolumeMute') setVol(v => v===0 ? 30 : 0);
    } catch(e) { setErr(e+''); }
  };

  const launch = async (appId) => {
    if (!sel) return;
    try { await invoke('launch', { ip: sel.ip, appId }); setShowApps(false); } catch(e) { setErr(e+''); }
  };

  const sendText = async () => {
    if (!sel || !text.trim()) return;
    setErr('');
    try {
      await invoke('send_text', { ip: sel.ip, text: text.trim() });
      setText('');
    } catch(e) { setErr(e+''); }
  };

  const handleTextKey = (e) => {
    if (e.key === 'Enter') sendText();
  };

  const dpad = [
    {r:0,c:1,k:'Up',l:'▲'},{r:1,c:0,k:'Left',l:'◀'},
    {r:1,c:1,k:'Select',l:'OK',cl:'c'},{r:1,c:2,k:'Right',l:'▶'},
    {r:2,c:1,k:'Down',l:'▼'},
  ];

  return (
    <div className={widget ? 'widget' : ''}>
      <div className="titlebar">
        <span className="titlebar-text">📺 Roku Control {sel ? `· ${sel.label.split('—')[0].trim()}` : ''}</span>
        <div style={{display:'flex',gap:4}}>
          <button className="tb-btn close" onClick={() => window.close()}>✕</button>
        </div>
      </div>

      {!widget && (
        <div className="device-bar">
          <div className={`dot ${sel ? 'on' : 'off'}`} />
          <select className="device-select" value={sel?.ip||''} onChange={e => {
            const d = devices.find(x => x.ip===e.target.value); if(d) selectDevice(d);
          }}>
            {devices.map(d => <option key={d.ip} value={d.ip}>{d.label}</option>)}
          </select>
          <button className="btn" onClick={refresh} disabled={scanning} style={{padding:'6px 8px'}}>
            {scanning ? '⏳' : '🔄'}
          </button>
        </div>
      )}

      <div className="main-content">
        {err && <div style={{color:'#ef4444',fontSize:11,padding:'2px 8px',background:'rgba(239,68,68,0.1)',borderRadius:6}}>{err}</div>}
        <div className="status-line">
          <span style={{color:'var(--text-dim)'}}>{sel?.label || 'No device'}</span>
          <button className="btn sp" onClick={() => send('PowerOff')}>⏻ Power</button>
        </div>

        <div className="dpad">
          {dpad.map((k,i) => (
            <button key={i} className={`dbtn ${k.cl||''}`}
              style={{gridColumn:k.c+1, gridRow:k.r+1}}
              onClick={() => send(k.k)}>{k.l}</button>
          ))}
        </div>

        <div className="row">
          {[{l:'⏪',k:'Rev'},{l:'⏯️',k:'Play'},{l:'⏩',k:'Fwd'}].map(m => (
            <button key={m.k} className="btn" onClick={() => send(m.k)}>{m.l}</button>
          ))}
        </div>

        <div className="row">
          {[{l:'⌂',k:'Home'},{l:'←',k:'Back'},{l:'ℹ',k:'Info'},{l:'🔍',k:'Search'}].map(m => (
            <button key={m.k} className="btn" onClick={() => send(m.k)}>{m.l}</button>
          ))}
        </div>

        <div className="vol-row">
          <button className="vbtn" onClick={() => send('VolumeDown')}>🔉</button>
          <input type="range" className="vslider" min="0" max="100" value={vol} onChange={e => setVol(+e.target.value)} />
          <button className="vbtn" onClick={() => send('VolumeUp')}>🔊</button>
          <button className="vbtn" onClick={() => send('VolumeMute')}>{vol===0?'🔇':'🔈'}</button>
        </div>

        <div style={{display:'flex',gap:6,width:'100%',marginTop:2}}>
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleTextKey}
            placeholder="Type to search on TV..."
            style={{
              flex:1, background:'var(--bg3)', border:'1px solid var(--border)',
              borderRadius:'var(--radius-sm)', color:'var(--text)', padding:'8px 10px',
              fontSize:12, outline:'none'
            }}
          />
          <button className="btn sp" onClick={sendText} style={{padding:'8px 14px'}}>Send</button>
          <button className="btn" onClick={() => send('Backspace')} style={{padding:'8px 10px'}} title="Backspace">⌫</button>
        </div>

        {!widget && (
          <>
            <button className="btn sp" style={{padding:'10px 20px',fontSize:13}} onClick={() => { setShowApps(!showApps); if (!showApps && !apps.length) loadApps(sel?.ip); }}>
              {showApps ? '📱 Hide Apps' : `📱 Launch App (${apps.length})`}
            </button>
            {showApps && apps.length > 0 && (
              <div className="app-grid">
                {apps.map((a,i) => (
                  <div key={a.id||i} className="app-item" onClick={() => launch(a.id)} title={a.name}>
                    <span className="app-icon">{icon(a.name)}</span>
                    <span className="app-name">{a.name}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div style={{marginTop:'auto',padding:'10px 0 4px',textAlign:'center'}}>
          <div style={{fontSize:10,color:'var(--text-dim)',opacity:0.5,letterSpacing:'0.5px'}}>
            Brought to you ad-free by
          </div>
          <div style={{fontSize:11,fontWeight:700,color:'var(--purple-glow)',letterSpacing:'1px',marginTop:1}}>
            MOVEWEIGHT.NET
          </div>
          <div style={{fontSize:9,color:'var(--text-dim)',opacity:0.35,marginTop:1,letterSpacing:'0.5px'}}>
            WE MAKE DOPE SHIT!
          </div>
        </div>
      </div>
    </div>
  );
}
