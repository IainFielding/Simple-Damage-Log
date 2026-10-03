/**
 * Just-enough Foundry globals for the pure logic under plain Node.
 *
 * Nothing in `scripts/data/` needs a real Foundry; `config.mjs` reaches for `game.settings`,
 * `game.i18n` and `Hooks` in its helpers, and that is all this provides. Vitest loads it through
 * `setupFiles`, before any test imports resolve. Tests that mutate a piece call
 * {@link installFoundryShims} in `beforeEach`.
 */

import { DEFAULTS } from "../../scripts/config.mjs";

export function installFoundryShims() {
  globalThis.game = {
    settings: {
      _values: structuredClone({ ...DEFAULTS }),
      get(_module, key) {
        if ( !(key in this._values) ) throw new Error(`setting ${key} is not registered`);
        return this._values[key];
      },
      set(_module, key, value) { this._values[key] = value; }
    },
    // Echo the key back, with interpolation data appended, so text assertions stay stable.
    i18n: {
      localize: key => key,
      format: (key, data) => `${key}:${JSON.stringify(data ?? {})}`
    },
    modules: { get: () => null },
    user: { isGM: false }
  };

  globalThis.Hooks = {
    _listeners: {},
    on(hook, fn) { (this._listeners[hook] ??= []).push(fn); },
    callAll(hook, ...args) { for ( const fn of this._listeners[hook] ?? [] ) fn(...args); return true; },
    call(hook, ...args) {
      for ( const fn of this._listeners[hook] ?? [] ) if ( fn(...args) === false ) return false;
      return true;
    }
  };
}

installFoundryShims();
