import { load, save } from './storage';

// One-time "rate us" prompt: after 10 minutes of actual use, and only once
// the app has worked for this person (asking someone it failed for to rate
// it helps nobody).
export const RATE_AFTER_MS = 10 * 60 * 1000;
const MIN_COMMANDS = 5;
const KEY = 'usage';

const state = { activeMs: 0, commands: 0, ratePromptShown: false, ...load(KEY, {}) };
const persist = () => save(KEY, state);

export const usage = {
  recordCommand() {
    state.commands += 1;
    persist();
  },
  addActiveTime(ms) {
    state.activeMs += ms;
    persist();
  },
  shouldAskForRating() {
    return !state.ratePromptShown && state.activeMs >= RATE_AFTER_MS && state.commands >= MIN_COMMANDS;
  },
  markRatingAsked() {
    state.ratePromptShown = true;
    persist();
  },
};
