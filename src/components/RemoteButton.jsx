import { useEffect, useRef } from 'react';

const HOLD_DELAY_MS = 450;
const REPEAT_MS = 130;

/**
 * A remote key. Click to press once; with `repeat`, hold to keep pressing
 * (scrolling a long list, stepping the volume). It never takes focus on
 * click, so Enter on the keyboard still means OK instead of re-clicking it.
 */
export default function RemoteButton({ rokuKey, onPress, repeat = false, flash, className = '', children, ...rest }) {
  const timers = useRef({});
  const held = useRef(false);

  const stop = () => {
    clearTimeout(timers.current.delay);
    clearInterval(timers.current.every);
    timers.current = {};
  };
  useEffect(() => stop, []);

  const onPointerDown = (e) => {
    if (!repeat || e.button !== 0) return;
    held.current = false;
    stop();
    timers.current.delay = setTimeout(() => {
      held.current = true;
      onPress(rokuKey, { droppable: true });
      timers.current.every = setInterval(() => onPress(rokuKey, { droppable: true }), REPEAT_MS);
    }, HOLD_DELAY_MS);
  };

  const onClick = () => {
    if (held.current) {
      held.current = false;
      return;
    }
    onPress(rokuKey);
  };

  return (
    <button
      type="button"
      className={`${className}${flash === rokuKey ? ' pressed' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={onPointerDown}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
}
