import { useState } from 'react';
import RemoteButton from './RemoteButton';

const FALLBACK_INPUTS = [
  { key: 'InputTuner', label: 'Antenna TV' },
  { key: 'InputHDMI1', label: 'HDMI 1' },
  { key: 'InputHDMI2', label: 'HDMI 2' },
  { key: 'InputHDMI3', label: 'HDMI 3' },
  { key: 'InputHDMI4', label: 'HDMI 4' },
  { key: 'InputAV1', label: 'AV' },
];

export default function Remote({ device, press, launch, flash, powerOn, waking, inputs, compact }) {
  const [showInputs, setShowInputs] = useState(false);
  // Unknown (e.g. a Limited-mode Roku we couldn't query) counts as a TV.
  const isTv = device?.isTv !== false;
  const key = (rokuKey, children, props = {}) => (
    <RemoteButton rokuKey={rokuKey} onPress={press} flash={flash} {...props}>
      {children}
    </RemoteButton>
  );

  return (
    <section className={`remote${device ? '' : ' disabled'}`} aria-label="Remote" aria-disabled={!device}>
      <div className="power-row">
        <button type="button" className="btn power-on" onClick={powerOn} disabled={!device || waking} title="Turns the TV on — even from standby">
          {waking ? <span className="spin">⟳</span> : '⏻'} {waking ? 'Waking…' : 'Turn on'}
        </button>
        {key('PowerOff', '⏻ Turn off', { className: 'btn power-off', title: 'Turn off' })}
        {!compact && device?.supportsFindRemote !== false &&
          key('FindRemote', '🔔', { className: 'btn ghost square', title: 'Find my remote (makes it beep)', 'aria-label': 'Find remote' })}
      </div>

      <div className="nav-row">
        {key('Back', '← Back', { className: 'btn', title: 'Back (Backspace / Esc)' })}
        {key('Home', '⌂ Home', { className: 'btn', title: 'Home (H)' })}
      </div>

      <div className="dpad">
        {key('Up', '▲', { className: 'dbtn up', repeat: true, title: 'Up (↑)', 'aria-label': 'Up' })}
        {key('Left', '◀', { className: 'dbtn left', repeat: true, title: 'Left (←)', 'aria-label': 'Left' })}
        {key('Select', 'OK', { className: 'dbtn ok', title: 'OK (Enter)' })}
        {key('Right', '▶', { className: 'dbtn right', repeat: true, title: 'Right (→)', 'aria-label': 'Right' })}
        {key('Down', '▼', { className: 'dbtn down', repeat: true, title: 'Down (↓)', 'aria-label': 'Down' })}
      </div>

      <div className="row">
        {key('InstantReplay', '↺', { className: 'btn round', title: 'Instant replay (R)', 'aria-label': 'Instant replay' })}
        {key('Info', '✱', { className: 'btn round', title: 'Options (I or *)', 'aria-label': 'Options' })}
        {key('Search', '🔍', { className: 'btn round', title: 'Search (S)', 'aria-label': 'Search' })}
      </div>

      <div className="row transport">
        {key('Rev', '⏪', { className: 'btn round', repeat: true, title: 'Rewind (,)', 'aria-label': 'Rewind' })}
        {key('Play', '⏯', { className: 'btn round play', title: 'Play / Pause (Space)', 'aria-label': 'Play or pause' })}
        {key('Fwd', '⏩', { className: 'btn round', repeat: true, title: 'Fast forward (.)', 'aria-label': 'Fast forward' })}
      </div>

      <div className="volume">
        {key('VolumeMute', '🔇', { className: 'vbtn', title: 'Mute (M)', 'aria-label': 'Mute' })}
        {key('VolumeDown', '−', { className: 'vbtn wide', repeat: true, title: 'Volume down (−) — hold to keep going', 'aria-label': 'Volume down' })}
        <span className="vol-label">VOL</span>
        {key('VolumeUp', '+', { className: 'vbtn wide', repeat: true, title: 'Volume up (+) — hold to keep going', 'aria-label': 'Volume up' })}
      </div>

      {isTv && !compact && (
        <>
          <div className="row">
            {key('ChannelDown', 'Ch −', { className: 'btn', repeat: true, title: 'Channel down (Page Down)' })}
            {key('ChannelUp', 'Ch +', { className: 'btn', repeat: true, title: 'Channel up (Page Up)' })}
            <button type="button" className={`btn${showInputs ? ' on' : ''}`} onClick={() => setShowInputs((v) => !v)} aria-expanded={showInputs}>
              🔌 Input
            </button>
          </div>
          {showInputs && (
            <div className="row inputs">
              {inputs.length > 0
                ? inputs.map((inp) => (
                    <button type="button" key={inp.id} className="btn small" onClick={() => { launch(inp.id); setShowInputs(false); }}>
                      {inp.name}
                    </button>
                  ))
                : FALLBACK_INPUTS.map((inp) => (
                    <button type="button" key={inp.key} className="btn small" onClick={() => { press(inp.key); setShowInputs(false); }}>
                      {inp.label}
                    </button>
                  ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
