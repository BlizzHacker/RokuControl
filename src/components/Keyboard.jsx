import { forwardRef, useRef, useState } from 'react';

const chars = (s) => Array.from(s);

/**
 * Live typing: every character you type shows up in the TV's search box as
 * you type it. We track what we've sent, and turn any edit (typing, paste,
 * deleting, fixing a typo in the middle) into Backspaces plus new letters.
 * Keyed by device in App, so switching Rokus starts from an empty box.
 */
const Keyboard = forwardRef(function Keyboard({ device, press, typeText }, inputRef) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const sent = useRef('');
  const composing = useRef(false);

  const sync = (next) => {
    const a = chars(sent.current);
    const b = chars(next);
    let same = 0;
    while (same < a.length && same < b.length && a[same] === b[same]) same++;
    for (let i = same; i < a.length; i++) press('Backspace');
    const added = b.slice(same).join('');
    if (added) typeText(added);
    sent.current = next;
  };

  const reset = () => {
    sent.current = '';
    setValue('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      press('Enter');
      reset();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  const backspace = () => {
    press('Backspace');
    const next = chars(sent.current).slice(0, -1).join('');
    sent.current = next;
    setValue(next);
  };

  const clear = () => {
    for (let i = 0; i < chars(sent.current).length; i++) press('Backspace');
    reset();
  };

  return (
    <section className={`card keyboard${focused ? ' active' : ''}`} aria-label="Type on TV">
      <div className="card-head">
        <h2>⌨ Type on your TV</h2>
        <span className="hint">{focused ? 'Typing mode · Esc for remote keys' : 'Press / to start typing'}</span>
      </div>
      <div className="kb-row">
        <input
          ref={inputRef}
          type="text"
          value={value}
          disabled={!device}
          placeholder="Open a search box on the TV, then type here…"
          spellCheck={false}
          autoComplete="off"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            setValue(e.target.value);
            if (!composing.current) sync(e.target.value);
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(e) => {
            composing.current = false;
            sync(e.currentTarget.value);
          }}
          onKeyDown={onKeyDown}
        />
        <button type="button" className="btn small" onClick={backspace} disabled={!device} title="Delete one character" aria-label="Backspace">
          ⌫
        </button>
        <button type="button" className="btn small primary" onClick={() => { press('Enter'); reset(); }} disabled={!device} title="Press Enter on the TV">
          ⏎
        </button>
      </div>
      {value && (
        <button type="button" className="link-btn" onClick={clear}>
          Clear what I typed on the TV
        </button>
      )}
    </section>
  );
});

export default Keyboard;
