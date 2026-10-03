/**
 * What the context menu (and the API) can do to an entry: undo, redo, reset visibility.
 */

import { MODULE_ID, SETTINGS, settingsSnapshot, t } from "./config.mjs";
import { readEntry } from "./data/entry.mjs";
import { revertUpdate } from "./data/revert.mjs";
import { canRevert, whisperFor } from "./data/visibility.mjs";

/** Resolve an entry's actor; null if it has been deleted. */
export function actorOf(entry) {
  try {
    return fromUuidSync(entry.actorUuid) ?? null;
  } catch {
    return null;
  }
}

/** Whether the current user may undo or redo this message's entry. */
export function userCanRevert(message) {
  const entry = readEntry(message);
  if ( !entry ) return false;
  const actor = actorOf(entry);
  return canRevert({
    user: game.user,
    settings: settingsSnapshot(),
    hasPermission: (user, level) => !!actor?.testUserPermission(user, level)
  });
}

/**
 * The user whose client marks an entry as reverted once the actor has been updated: the entry's
 * author if they are online, since they own the message, otherwise the active GM.
 */
export function flagWriterFor(message) {
  const author = message.author;
  return author?.active ? author : (game.users.activeGM ?? null);
}

/**
 * Undo an entry, or redo one that was undone.
 * @param {ChatMessage} message
 * @returns {Promise<boolean>}  Whether the actor was updated.
 */
export async function toggleRevert(message) {
  const entry = readEntry(message);
  if ( !entry ) return false;
  // The entry is marked asynchronously, possibly by another client; until then `entry.reverted` is
  // stale, and a second undo would apply the change twice.
  if ( inFlight.has(message.id) ) return false;
  inFlight.add(message.id);
  try {
    return await applyRevert(message, entry);
  } finally {
    inFlight.delete(message.id);
  }
}

/** Messages with an undo or redo under way on this client. */
const inFlight = new Set();

/** How long to wait for the flag writer to mark an entry after its actor was updated. */
const MARK_TIMEOUT_MS = 5000;

async function applyRevert(message, entry) {
  const what = entry.kind === "healing" ? t("word.healing") : t("word.damage");
  const verb = entry.reverted ? t("word.redo") : t("word.undo");

  if ( !userCanRevert(message) ) {
    ui.notifications.warn(t("error.notAllowed", { verb, what }));
    return false;
  }
  const actor = actorOf(entry);
  if ( !actor ) {
    ui.notifications.error(t("error.actorMissing"));
    return false;
  }
  // Somebody has to be able to mark the entry afterwards, or the actor and the log would disagree.
  if ( !flagWriterFor(message) ) {
    ui.notifications.error(t("error.noWriter", { verb, what, user: message.author?.name ?? "?" }));
    return false;
  }

  const settings = settingsSnapshot();
  const hp = actor.system.attributes.hp;
  const update = revertUpdate({
    hp: { value: hp.value, temp: hp.temp, tempmax: hp.tempmax, max: hp.max },
    changes: entry.changes,
    direction: entry.reverted ? "redo" : "undo",
    clampMin: settings[SETTINGS.clampToMin],
    clampMax: settings[SETTINGS.clampToMax]
  });
  const reverted = !entry.reverted;
  const result = await actor.update(update, { [MODULE_ID]: { messageId: message.id, reverted } });

  // Clamping can make the update a no-op, and then no updateActor fires to mark the entry. Mark it
  // here if this client may, so the menu still flips between Undo and Redo.
  if ( !result ) {
    if ( !message.canUserModify(game.user, "update") ) return false;
    await message.setFlag(MODULE_ID, "reverted", reverted);
    return true;
  }
  await entryMarked(message, reverted);
  return true;
}

/** Resolve once the entry's `reverted` flag reads `reverted`, or after a timeout. */
function entryMarked(message, reverted) {
  if ( !!readEntry(message)?.reverted === reverted ) return Promise.resolve(true);
  return new Promise(resolve => {
    const done = ok => {
      Hooks.off("updateChatMessage", hookId);
      clearTimeout(timer);
      resolve(ok);
    };
    const hookId = Hooks.on("updateChatMessage", updated => {
      if ( (updated.id === message.id) && (!!readEntry(updated)?.reverted === reverted) ) done(true);
    });
    const timer = setTimeout(() => done(false), MARK_TIMEOUT_MS);
  });
}

/** Put an entry's whisper list back to what the settings give it, and forget any Reveal/Conceal. */
export async function resetVisibility(message) {
  const entry = readEntry(message);
  if ( !entry || !game.user.isGM ) return;
  const actor = actorOf(entry);
  const whisper = whisperFor({
    kind: entry.kind,
    hiddenToken: !!entry.hidden,
    users: game.users.contents,
    settings: settingsSnapshot(),
    hasPermission: (user, level) => !!actor?.testUserPermission(user, level)
  });
  await message.update({ whisper, [`flags.${MODULE_ID}.public`]: _del });
}
