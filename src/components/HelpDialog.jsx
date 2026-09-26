import { useState } from 'react';
import Modal from './Modal';
import { SHORTCUT_GROUPS } from '../lib/shortcuts';
import { APP_VERSION, REPO, WEBSITE, diagnostics, openLink } from '../lib/links';

const TABS = [
  ['fix', 'Fix a problem'],
  ['keys', 'Keyboard'],
  ['about', 'About'],
];

function Shortcuts() {
  return (
    <div className="shortcuts">
      {SHORTCUT_GROUPS.map((g) => (
        <div key={g.title}>
          <h3>{g.title}</h3>
          <dl>
            {g.items
              .filter((item) => item.desc)
              .map((item) => (
                <div key={item.desc}>
                  <dt>
                    <kbd>{item.label}</kbd>
                  </dt>
                  <dd>{item.desc}</dd>
                </div>
              ))}
          </dl>
        </div>
      ))}
      <p className="muted">Hold an arrow or volume key to keep going. Shortcuts pause while you're typing in a text box.</p>
    </div>
  );
}

function Troubleshooting({ device, lastError, onReport }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(diagnostics(device, lastError)).then(() => setCopied(true), () => {});
  };
  return (
    <div className="troubleshoot">
      <details open>
        <summary>Only volume works, or buttons show “blocking this app”</summary>
        <p>
          Newer Roku software ships in <em>Limited</em> mode. On the TV go to <b>Settings › System › Advanced system settings › Control by
          mobile apps</b> and choose <b>Enabled</b>. If you see <b>Network access</b>, pick <b>Default</b> or <b>Permissive</b> — not Limited.
        </p>
      </details>
      <details>
        <summary>The app can't find my Roku</summary>
        <ol>
          <li>Your computer and Roku must be on the same network — not a guest network.</li>
          <li>On Windows, open Settings › Network &amp; internet, pick your Wi-Fi and set it to <b>Private</b>.</li>
          <li>Press ⟳ to search again; the app also scans your network directly if the quick search gets no answer.</li>
          <li>
            Still nothing? Press ＋ and add it by IP. You'll find it on the Roku under <b>Settings › Network › About</b>.
          </li>
        </ol>
      </details>
      <details>
        <summary>“Turn on” doesn't wake my TV</summary>
        <p>
          A Roku TV that's fully off also switches its network off. Turn on <b>Settings › System › Power › Fast TV start</b> and the app can
          switch it on any time. Without it, the app sends Wake-on-LAN, which works on some TVs (best over Ethernet) — it needs to have seen
          the TV on at least once.
        </p>
      </details>
      <details>
        <summary>It worked before and now it doesn't</summary>
        <p>
          Your router probably gave the Roku a new address. The app notices and finds it again on its own; you can also press ⟳.
        </p>
      </details>
      <div className="modal-actions">
        <button type="button" className="btn primary" onClick={onReport}>
          🐞 Report a problem
        </button>
        <button type="button" className="btn" onClick={copy}>
          {copied ? '✓ Copied' : 'Copy diagnostics'}
        </button>
      </div>
      <p className="fine">Reports open on GitHub in your browser, pre-filled with your Roku's model and software version (never its IP, name or serial). Nothing is sent until you press Submit there.</p>
    </div>
  );
}

function About() {
  return (
    <div className="about">
      <p>
        <b>Roku Control {APP_VERSION}</b> — a free, open-source remote for Roku TVs and players. No ads, no accounts, no tracking: the app
        only ever talks to the Rokus on your own network.
      </p>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={() => openLink(WEBSITE)}>
          MoveWeight.com
        </button>
        <button type="button" className="btn" onClick={() => openLink(REPO)}>
          Source code
        </button>
      </div>
      <p className="fine">MIT licensed · Roku is a trademark of Roku, Inc. This app is not affiliated with Roku.</p>
    </div>
  );
}

export default function HelpDialog({ initialTab = 'fix', device, lastError, onReport, onClose }) {
  const [tab, setTab] = useState(initialTab);
  return (
    <Modal title="Help" onClose={onClose}>
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button type="button" key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'fix' && <Troubleshooting device={device} lastError={lastError} onReport={onReport} />}
      {tab === 'keys' && <Shortcuts />}
      {tab === 'about' && <About />}
    </Modal>
  );
}
