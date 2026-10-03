/**
 * The public API, at `game.modules.get("sogrom-simple-damage-log").api`.
 *
 *   isEntry(message)        whether a chat message is a genuine damage log entry (not a forgery)
 *   entryFor(message)       its entry data (a copy), or null
 *   revert(messageOrId)     undo an entry; false if it is already undone or not allowed
 *   reapply(messageOrId)    redo an undone entry; false if it isn't undone or not allowed
 */

import { MODULE_ID } from "./config.mjs";
import { toggleRevert, trustedEntry } from "./actions.mjs";

const resolve = m => (typeof m === "string" ? game.messages.get(m) : m) ?? null;

export const api = Object.freeze({
  isEntry: message => !!trustedEntry(resolve(message)),
  entryFor: message => {
    const entry = trustedEntry(resolve(message));
    return entry ? foundry.utils.deepClone(entry) : null;
  },
  async revert(message) {
    message = resolve(message);
    const entry = trustedEntry(message);
    if ( !entry || entry.reverted ) return false;
    return toggleRevert(message);
  },
  async reapply(message) {
    message = resolve(message);
    const entry = trustedEntry(message);
    if ( !entry?.reverted ) return false;
    return toggleRevert(message);
  }
});

export function registerApi() {
  const module = game.modules.get(MODULE_ID);
  if ( module ) module.api = api;
}
