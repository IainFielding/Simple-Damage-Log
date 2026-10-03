/**
 * Keeping an entry's flags in step with what happens to it after it is posted.
 */

import { HOOKS, MODULE_ID, fireHook } from "./config.mjs";
import { flagWriterFor } from "./actions.mjs";
import { readEntry } from "./data/entry.mjs";

/**
 * Hooked on `updateActor`, which runs on every client. After an undo or redo, exactly one client,
 * the one {@link flagWriterFor} picks, marks the entry. Whoever clicked Undo may not own the message.
 */
export function onUpdateActor(actor, _changes, options) {
  const context = options?.[MODULE_ID];
  if ( !context?.messageId ) return;
  const message = game.messages.get(context.messageId);
  if ( !message || (flagWriterFor(message)?.id !== game.user.id) ) return;
  // Only an update to the entry's own actor may mark it; the option can be put on any update.
  if ( readEntry(message)?.actorUuid !== actor?.uuid ) return;
  message.setFlag(MODULE_ID, "reverted", !!context.reverted)
    .catch(err => console.error(`${MODULE_ID} | could not mark entry ${message.id}`, err));
}

/**
 * Hooked on `preUpdateChatMessage`. When a GM uses Reveal or Conceal on an entry, remember that
 * choice, so a viewer's table follows the GM's decision rather than the settings. Reset Visibility
 * deletes the flag in the same update; that is left alone.
 */
export function onPreUpdateChatMessage(message, changes) {
  if ( !readEntry(message) || !("whisper" in changes) ) return;
  const current = foundry.utils.getProperty(changes, `flags.${MODULE_ID}.public`);
  if ( current instanceof foundry.data.operators.ForcedDeletion ) return;
  foundry.utils.setProperty(changes, `flags.${MODULE_ID}.public`, !changes.whisper?.length);
}

/** Hooked on `updateChatMessage`: announce undo / redo on every client. */
export function onUpdateChatMessage(message, changes) {
  const reverted = foundry.utils.getProperty(changes, `flags.${MODULE_ID}.reverted`);
  if ( (reverted === undefined) || !readEntry(message) ) return;
  fireHook(HOOKS.reverted, { message, reverted: !!reverted });
}
