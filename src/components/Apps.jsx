import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const EMOJI = {
  netflix: '🔴', prime: '📦', hulu: '💚', youtube: '▶️', spotify: '🎵', plex: '🎬', disney: '🏰',
  apple: '🍎', max: '🟣', hbo: '🟣', peacock: '🦚', starz: '⭐', paramount: '⛰️', espn: '🏈',
  crunchyroll: '🍥', tubi: '📺', pluto: '🪐', pandora: '🔷', jellyfin: '🎞️', emby: '📀', news: '📰',
  sling: '📡', fubo: '⚽', twitch: '🟪', music: '🎵', weather: '⛅', photo: '🖼️', game: '🕹️',
};
const emojiFor = (name) => {
  const n = (name || '').toLowerCase();
  return Object.entries(EMOJI).find(([k]) => n.includes(k))?.[1] ?? '📺';
};

// Real channel art, fetched from the Roku a few at a time and cached.
const icons = new Map();
const waiting = [];
let running = 0;

function loadIcon(ip, appId, cacheKey) {
  if (icons.has(cacheKey)) return Promise.resolve(icons.get(cacheKey));
  return new Promise((resolve) => {
    waiting.push({ ip, appId, cacheKey, resolve });
    pump();
  });
}

function pump() {
  while (running < 4 && waiting.length) {
    const job = waiting.shift();
    running++;
    api
      .appIcon(job.ip, job.appId)
      .catch(() => null)
      .then((url) => {
        icons.set(job.cacheKey, url);
        job.resolve(url);
        running--;
        pump();
      });
  }
}

function AppTile({ device, app, active, onLaunch }) {
  const cacheKey = `${device.id}/${app.id}`;
  const [src, setSrc] = useState(() => icons.get(cacheKey));

  useEffect(() => {
    if (src !== undefined) return undefined;
    let live = true;
    loadIcon(device.ip, app.id, cacheKey).then((url) => live && setSrc(url));
    return () => {
      live = false;
    };
    // Tiles are keyed by device + app, so this runs once per tile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <button type="button" className={`app-tile${active ? ' active' : ''}`} onClick={() => onLaunch(app.id)} title={`Open ${app.name}`}>
      {src ? <img src={src} alt="" draggable={false} /> : <span className="app-fallback">{emojiFor(app.name)}</span>}
      <span className="app-name">{app.name}</span>
      {active && <span className="badge">On now</span>}
    </button>
  );
}

export default function Apps({ device, apps, activeAppId, loading, error, onLaunch, onReload }) {
  const [filter, setFilter] = useState('');
  const channels = apps.filter((a) => a.type !== 'tvin');
  const q = filter.trim().toLowerCase();
  const shown = q ? channels.filter((a) => a.name.toLowerCase().includes(q)) : channels;

  return (
    <section className="card apps" aria-label="Channels">
      <div className="card-head">
        <h2>
          📺 Channels {channels.length > 0 && <span className="count">{channels.length}</span>}
        </h2>
        {channels.length > 6 && (
          <input className="filter" type="search" placeholder="Find a channel…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Find a channel" />
        )}
      </div>
      {loading && !channels.length ? (
        <p className="muted">Loading channels…</p>
      ) : error ? (
        <p className="muted">
          {error}{' '}
          <button type="button" className="link-btn" onClick={onReload}>
            Try again
          </button>
        </p>
      ) : shown.length ? (
        <div className="app-grid">
          {shown.map((a) => (
            <AppTile key={`${device.id}/${a.id}`} device={device} app={a} active={a.id === activeAppId} onLaunch={onLaunch} />
          ))}
        </div>
      ) : (
        <p className="muted">{q ? 'No channel matches that.' : 'No channels yet.'}</p>
      )}
    </section>
  );
}
