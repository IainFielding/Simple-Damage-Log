/**
 * Dressing an entry when Foundry renders it in the chat log, the chat popout or a notification.
 *
 * The stored message is only the flavour line. The Old/Diff/New table is rendered here, from the
 * entry's flags, for each viewer, so who sees it follows the settings as they are now, and labels
 * are in the viewer's language.
 */

import { CSS, MODULE_ID, SETTINGS, settingsSnapshot, t, tpl } from "./config.mjs";
import { actorOf, trustedEntry } from "./actions.mjs";
import { shownParts } from "./data/entry.mjs";
import { DISPLAY_ORDER } from "./data/tracked.mjs";
import { canViewTable, hideNameFrom, isHiddenFrom } from "./data/visibility.mjs";
import { damageTypeLabel } from "./logger.mjs";

const TABLE = tpl("entry-table.hbs");

/** The compiled table template, once loaded, so most renders need not wait a tick. */
let compiled = null;

/** Compile the table template ahead of the first entry. Called at init. */
export function preloadTemplates() {
  return foundry.applications.handlebars.getTemplate(TABLE)
    .then(fn => compiled = fn)
    .catch(err => console.error(`${MODULE_ID} | could not load ${TABLE}`, err));
}

/** Hooked on `renderChatMessageHTML`. */
export async function onRenderChatMessage(message, html) {
  const entry = trustedEntry(message);
  if ( !entry || !(html instanceof HTMLElement) ) return;
  const settings = settingsSnapshot();

  html.classList.add(CSS.entry, entry.kind === "healing" ? CSS.healing : CSS.damage);
  html.classList.toggle(CSS.reverted, !!entry.reverted);

  const actor = actorOf(entry);
  const hasPermission = (user, level) => !!actor?.testUserPermission(user, level);
  const canTable = canViewTable({ user: game.user, entry, settings, hasPermission });
  html.classList.toggle(CSS.hidden, isHiddenFrom({ canTable, entry, settings }));

  const content = html.querySelector(".message-content");
  if ( !content ) return;
  if ( !canTable ) {
    content.replaceChildren(); // the flavour line is all a limited viewer gets
    return;
  }

  compiled ??= await foundry.applications.handlebars.getTemplate(TABLE);
  content.innerHTML = compiled(tableData(entry, settings), {
    allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true
  });
}

/**
 * Hooked on `dnd5e.renderChatMessage`, which fires after dnd5e has built the message header
 * (`renderChatMessageHTML` fires before it). Shows "Unknown creature" and a blank portrait to a
 * viewer who shouldn't learn the speaker's name. The name is still in the message data.
 */
export function onDnd5eRenderChatMessage(message, html) {
  const entry = trustedEntry(message);
  if ( !entry?.anonymous || !(html instanceof HTMLElement) ) return;
  const settings = settingsSnapshot();
  const actor = actorOf(entry);
  const hasPermission = (user, level) => !!actor?.testUserPermission(user, level);
  const canTable = canViewTable({ user: game.user, entry, settings, hasPermission });
  if ( !hideNameFrom({ user: game.user, entry, canTable, settings, hasPermission }) ) return;

  const unknown = t("unknownCreature");
  const sender = html.querySelector(".message-sender");
  const title = sender?.querySelector(".title");
  if ( title ) title.textContent = unknown;
  else if ( sender ) sender.textContent = unknown;
  const img = sender?.querySelector(".avatar img, .avatar video");
  if ( img ) img.replaceWith(Object.assign(document.createElement("img"), { src: CONST.DEFAULT_TOKEN, alt: unknown }));
  const avatar = sender?.querySelector(".avatar");
  if ( avatar ) {
    avatar.classList.remove("token");
    delete avatar.dataset.actorUuid;
    delete avatar.dataset.tokenUuid;
  }
}

/** The data the table template reads. */
function tableData(entry, settings) {
  const rows = [...entry.changes]
    .sort((a, b) => DISPLAY_ORDER.indexOf(a.id) - DISPLAY_ORDER.indexOf(b.id))
    .map(c => ({
      label: t(`field.${c.id}`),
      old: c.old,
      diff: c.diff > 0 ? `+${c.diff}` : `${c.diff}`,
      new: c.new,
      cls: c.diff > 0 ? "up" : "down"
    }));

  const showDetail = !!settings[SETTINGS.showDamageTypes] && !!entry.damage;
  const parts = shownParts(entry, showDetail).map(p => ({
    label: damageTypeLabel(p.type),
    value: p.value,
    mods: p.mods.map(m => t(`mod.${m}`)).join(", ")
  }));
  const source = showDetail ? visibleSource(entry.damage.source) : null;

  return {
    rows,
    parts,
    source,
    sourceText: source ? (source.item
      ? t("table.sourceItem", { alias: source.alias, item: source.item })
      : t("table.source", { alias: source.alias })) : "",
    headers: { old: t("table.old"), diff: t("table.diff"), new: t("table.new") }
  };
}

/**
 * The card the damage came from, if this viewer can see it. Its alias may name an attacker they
 * shouldn't know, a private or blind roll, so it is shown only to those who can read the card.
 * @param {{messageId: string, alias: string, item?: string}|null} source
 * @returns {object|null}
 */
function visibleSource(source) {
  if ( !source?.messageId ) return null;
  const card = game.messages.get(source.messageId);
  return (card?.visible && card.isContentVisible) ? source : null;
}

/**
 * Re-render the entries on screen, after a setting that changes what viewers see.
 *
 * Only those already rendered: `ChatLog#updateMessage` *posts* a visible message it can't find,
 * taking it for one that has just become visible, so calling it on every entry in the world would
 * push every older entry not yet loaded into the log at once.
 */
export function rerenderEntries() {
  const ids = new Set([...document.querySelectorAll(`.chat-log .message.${CSS.entry}[data-message-id]`)]
    .map(li => li.dataset.messageId));
  for ( const id of ids ) {
    const message = game.messages.get(id);
    if ( message ) ui.chat?.updateMessage(message);
  }
}
