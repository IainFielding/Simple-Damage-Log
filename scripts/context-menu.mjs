/**
 * The entries this module adds to a chat message's right-click menu.
 */

import { MODULE_ID } from "./config.mjs";
import { resetVisibility, toggleRevert, userCanRevert } from "./actions.mjs";
import { readEntry } from "./data/entry.mjs";

const messageOf = li => game.messages.get(li?.dataset?.messageId);

/** A menu action's promise rejected, e.g. the server refused the actor update. */
const reportFailure = (what, err) => console.error(`${MODULE_ID} | ${what} failed`, err);

/** An Undo/Redo item, shown for one kind of entry in one state. */
function revertItem(kind, reverted, key, icon) {
  return {
    label: `${MODULE_ID}.menu.${key}`,
    icon: `fa-solid ${icon}`,
    visible: li => {
      const message = messageOf(li);
      const entry = readEntry(message);
      return !!entry && (entry.kind === kind) && (!!entry.reverted === reverted) && userCanRevert(message);
    },
    onClick: (_event, li) => {
      const message = messageOf(li);
      if ( message ) toggleRevert(message).catch(err => reportFailure("undo / redo", err));
    }
  };
}

/** Hooked on `getChatMessageContextOptions`. */
export function onGetChatMessageContextOptions(_app, options) {
  const reset = {
    label: `${MODULE_ID}.menu.resetVisibility`,
    icon: "fa-solid fa-glasses",
    visible: li => game.user.isGM && (typeof readEntry(messageOf(li))?.public === "boolean"),
    onClick: (_event, li) => {
      const message = messageOf(li);
      if ( message ) resetVisibility(message).catch(err => reportFailure("reset visibility", err));
    }
  };

  // Beside core's Reveal / Conceal, which it undoes.
  const conceal = options.findIndex(o => o.label === "CHAT.ConcealMessage");
  options.splice(conceal >= 0 ? conceal + 1 : options.length, 0, reset);

  options.push(
    revertItem("damage", false, "undoDamage", "fa-rotate-left"),
    revertItem("healing", false, "undoHealing", "fa-rotate-left"),
    revertItem("damage", true, "redoDamage", "fa-rotate-right"),
    revertItem("healing", true, "redoHealing", "fa-rotate-right")
  );
}
