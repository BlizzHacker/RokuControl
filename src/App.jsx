import React, { useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { exit } from '@tauri-apps/plugin-process';

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

const INPUTS = [
  {k:'InputTuner',l:'📡 Antenna'},{k:'InputHDMI1',l:'HDMI 1'},
  {k:'InputHDMI2',l:'HDMI 2'},{k:'InputHDMI3',l:'HDMI 3'},
  {k:'InputHDMI4',l:'HDMI 4'},{k:'InputAV1',l:'AV'},
];

export default function App({ widget = false }) {
  const [devices, setDevices] = useState(PRELOADED);
  const [sel, setSel] = useState(PRELOADED[0]);
  const [apps, setApps] = useState([]);
  const [showApps, setShowApps] = useState(false);
  const [showInputs, setShowInputs] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [vol, setVol] = useState(30);
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const volRef = useRef(30);
  const volTimer = useRef(null);

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
    try { await invoke('keypress', { ip: sel.ip, key }); } catch(e) { setErr(e+''); }
  };

  const sendVol = (dir) => {
    if (!sel) return;
    const newV = dir === 'up' ? Math.min(100, volRef.current + 3) : Math.max(0, volRef.current - 3);
    volRef.current = newV;
    setVol(newV);
    if (volTimer.current) clearTimeout(volTimer.current);
    volTimer.current = setTimeout(() => send(dir === 'up' ? 'VolumeUp' : 'VolumeDown'), 20);
  };

  const handleVolChange = (v) => {
    const target = Number(v);
    const prev = volRef.current;
    volRef.current = target;
    setVol(target);
    if (volTimer.current) clearTimeout(volTimer.current);
    const diff = target - prev;
    const dir = diff > 0 ? 'VolumeUp' : 'VolumeDown';
    const steps = Math.abs(Math.round(diff / 3));
    let i = 0;
    const step = () => {
      if (i++ >= steps) return;
      send(dir);
      volTimer.current = setTimeout(step, 50);
    };
    step();
  };

  const launch = async (appId) => {
    if (!sel) return;
    try { await invoke('launch', { ip: sel.ip, appId }); setShowApps(false); } catch(e) { setErr(e+''); }
  };

  const sendText = async () => {
    if (!sel || !text.trim()) return;
    setErr('');
    try { await invoke('send_text', { ip: sel.ip, text: text.trim() }); setText(''); } catch(e) { setErr(e+''); }
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
          <button className="tb-btn close" onClick={() => exit(0)}>✕</button>
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
        {err && <div className="error-bar">{err}</div>}

        {/* Power row */}
        <div className="status-line">
          <span style={{color:'var(--text-dim)'}}>{sel?.label || 'No device'}</span>
          <div style={{display:'flex',gap:4}}>
            <button className="btn" onClick={() => send('PowerOn')} title="Wake">⏻ Wake</button>
            <button className="btn sp" onClick={() => send('PowerOff')} title="Sleep">⏻ Sleep</button>
          </div>
        </div>

        {/* D-Pad */}
        <div className="dpad">
          {dpad.map((k,i) => (
            <button key={i} className={`dbtn ${k.cl||''}`}
              style={{gridColumn:k.c+1, gridRow:k.r+1}}
              onClick={() => send(k.k)}>{k.l}</button>
          ))}
        </div>

        {/* Transport: Rewind — PLAY/PAUSE — Fwd — Instant Replay */}
        <div className="row">
          <button className="btn" onClick={() => send('Rev')} title="Rewind">⏪</button>
          <button className="btn sp" onClick={() => send('Play')} title="Play / Pause" style={{fontSize:16,padding:'12px 28px'}}>⏯</button>
          <button className="btn" onClick={() => send('Fwd')} title="Fast Forward">⏩</button>
          <button className="btn" onClick={() => send('InstantReplay')} title="Instant Replay">↺</button>
        </div>

        {/* Navigation */}
        <div className="row">
          <button className="btn" onClick={() => send('Home')} title="Home">⌂ Home</button>
          <button className="btn" onClick={() => send('Back')} title="Back">← Back</button>
          <button className="btn" onClick={() => send('Info')} title="Info">ℹ Info</button>
          <button className="btn" onClick={() => send('Search')} title="Search">🔍</button>
        </div>

        {/* Volume slider — actually sends commands */}
        <div className="vol-row">
          <button className="vbtn" onClick={() => sendVol('down')}>🔉</button>
          <input type="range" className="vslider" min="0" max="100"
            value={vol} onChange={e => handleVolChange(e.target.value)} />
          <button className="vbtn" onClick={() => sendVol('up')}>🔊</button>
          <button className="vbtn" onClick={() => { send('VolumeMute'); setVol(v => v===0 ? 30 : 0); volRef.current = volRef.current===0 ? 30 : 0; }}>
            {vol===0?'🔇':'🔈'}
          </button>
        </div>

        {/* Channel + Inputs */}
        <div className="row">
          <button className="btn" onClick={() => send('ChannelUp')}>▲ Ch</button>
          <button className="btn" onClick={() => send('ChannelDown')}>▼ Ch</button>
          <button className="btn" onClick={() => setShowInputs(!showInputs)}>🔌 Input</button>
          <button className="btn" onClick={() => send('FindRemote')} title="Find Remote">🔔 Find</button>
        </div>
        {showInputs && (
          <div className="row">
            {INPUTS.map(inp => (
              <button key={inp.k} className="btn" onClick={() => { send(inp.k); setShowInputs(false); }}>{inp.l}</button>
            ))}
          </div>
        )}

        {/* Keyboard input */}
        {!widget && (
        <div style={{display:'flex',gap:6,width:'100%',marginTop:2}}>
          <input type="text" value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') sendText(); }}
            placeholder="Type to search on TV..."
            style={{flex:1,background:'var(--bg3)',border:'1px solid var(--border)',
              borderRadius:'var(--radius-sm)',color:'var(--text)',padding:'8px 10px',fontSize:12,outline:'none'}} />
          <button className="btn sp" onClick={sendText} style={{padding:'8px 14px'}}>Send</button>
          <button className="btn" onClick={() => send('Backspace')} style={{padding:'8px 10px'}}>⌫</button>
        </div>
        )}

        {/* App Launcher */}
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

        {/* Branding */}
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
