import Modal from './Modal';
import { isWindows, openLink, rateUrl } from '../lib/links';

// Shown once, after ten minutes of use — see lib/usage.js.
export default function RatePrompt({ onIdea, onClose }) {
  return (
    <Modal title="Enjoying Roku Control?" onClose={onClose}>
      <div className="rate">
        <div className="stars" aria-hidden>
          ★★★★★
        </div>
        <p>
          Roku Control is free and open source, with <b>no ads, no tracking and no upsells</b> — we don't make a cent from you. But your
          input is what helps this grow.
        </p>
        <p>A quick rating helps other people find the app, and your ideas decide what we build next.</p>
        <div className="modal-actions column">
          <button type="button" className="btn primary" onClick={() => { openLink(rateUrl()); onClose(); }}>
            {isWindows ? '★ Rate it in the Microsoft Store' : '★ Star it on GitHub'}
          </button>
          <button type="button" className="btn" onClick={() => { onIdea(); onClose(); }}>
            💡 Suggest an idea
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            Not now
          </button>
        </div>
        <p className="fine">We'll only ask this once.</p>
      </div>
    </Modal>
  );
}
