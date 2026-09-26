import { APP_VERSION, REPO, WEBSITE, isWindows, openLink } from '../lib/links';

export default function Footer({ onReport, onIdea, onRate }) {
  return (
    <footer className="footer">
      <div className="credit">Brought to you ad-free by</div>
      <button type="button" className="brand" onClick={() => openLink(WEBSITE)}>
        MOVEWEIGHT.COM
      </button>
      <div className="tagline">WE MAKE DOPE SHIT!</div>
      <nav className="footer-links" aria-label="Links">
        <button type="button" onClick={() => openLink(WEBSITE)}>MoveWeight.com</button>
        <button type="button" onClick={() => openLink(REPO)}>Source code</button>
        <button type="button" onClick={onReport}>Report a problem</button>
        <button type="button" onClick={onIdea}>Suggest an idea</button>
        <button type="button" onClick={onRate}>{isWindows ? '★ Rate us' : '★ Star us'}</button>
      </nav>
      <div className="fine">v{APP_VERSION} · Free &amp; open source (MIT) · No ads · No tracking</div>
    </footer>
  );
}
