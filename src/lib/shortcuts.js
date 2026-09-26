// Keyboard shortcuts that work whenever you're not typing into a text box.
// Keys are KeyboardEvent.key values; single characters are matched lowercase.
export const SHORTCUT_GROUPS = [
  {
    title: 'Navigate',
    items: [
      { keys: ['ArrowUp'], label: '↑ ↓ ← →', roku: 'Up', desc: 'Move' },
      { keys: ['ArrowDown'], roku: 'Down' },
      { keys: ['ArrowLeft'], roku: 'Left' },
      { keys: ['ArrowRight'], roku: 'Right' },
      { keys: ['Enter'], label: 'Enter', roku: 'Select', desc: 'OK' },
      { keys: ['Backspace', 'Escape'], label: 'Backspace / Esc', roku: 'Back', desc: 'Back' },
      { keys: ['h', 'Home'], label: 'H', roku: 'Home', desc: 'Home' },
      { keys: ['i', '*'], label: 'I or *', roku: 'Info', desc: 'Options (✱)' },
      { keys: ['s'], label: 'S', roku: 'Search', desc: 'Search' },
    ],
  },
  {
    title: 'Playback',
    items: [
      { keys: [' ', 'p'], label: 'Space or P', roku: 'Play', desc: 'Play / Pause' },
      { keys: [',', '<', '['], label: ', or [', roku: 'Rev', desc: 'Rewind' },
      { keys: ['.', '>', ']'], label: '. or ]', roku: 'Fwd', desc: 'Fast forward' },
      { keys: ['r'], label: 'R', roku: 'InstantReplay', desc: 'Instant replay' },
    ],
  },
  {
    title: 'Volume & TV',
    items: [
      { keys: ['+', '='], label: '+', roku: 'VolumeUp', desc: 'Volume up' },
      { keys: ['-', '_'], label: '−', roku: 'VolumeDown', desc: 'Volume down' },
      { keys: ['m'], label: 'M', roku: 'VolumeMute', desc: 'Mute' },
      { keys: ['PageUp'], label: 'Page Up / Down', roku: 'ChannelUp', desc: 'Channel up / down' },
      { keys: ['PageDown'], roku: 'ChannelDown' },
    ],
  },
  {
    title: 'App',
    items: [
      { keys: ['/', 't'], label: '/ or T', action: 'type', desc: 'Type on the TV' },
      { keys: ['?'], label: '?', action: 'help', desc: 'Show these shortcuts' },
    ],
  },
];

export const SHORTCUTS = new Map(
  SHORTCUT_GROUPS.flatMap((g) => g.items).flatMap((item) => item.keys.map((k) => [k, item])),
);

// Keys that make sense to hold down.
export const REPEATABLE = new Set(['Up', 'Down', 'Left', 'Right', 'VolumeUp', 'VolumeDown', 'Rev', 'Fwd', 'ChannelUp', 'ChannelDown']);

export const normalizeKey = (key) => (key.length === 1 ? key.toLowerCase() : key);
