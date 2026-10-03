/**
 * Dressing an entry when Foundry renders it in the chat log, the chat popout or a notification.
 *
 * The stored message is only the flavour line. The Old/Diff/New table is rendered here, from the
 * entry's flags, for each viewer, so who sees it follows the settings as they are now, and labels
 * are in the viewer's language.
 */

import { CSS, MODULE_ID, SETTINGS, settingsSnapshot, t, tpl } from "./config.mjs";
import { actorOf } from "./actions.mjs";
import { readEntry, shownParts } from "./data/entry.mjs";
import { DISPLAY_ORDER } from "./data/tracked.mjs";
import { canViewTable, isHiddenFrom } from "./data/visibility.mjs";
import { damageTypeLabel } from "./logger.mjs";

const TABLE = tpl("entry-table.hbs");

/** The compiled table template, once loaded, so most renders need not wait a tick. */
let compiled = null;

/** Compile the table template ahead of the first entry. Called at init. */
export function preloadTemplates() {
  return foundry.applications.handlebars.getTemplate(TABLE).then(fn => compiled = fn);
}

/** Hooked on `renderChatMessageHTML`. */
export async function onRenderChatMessage(message, html) {
  const entry = readEntry(message);
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
  content.querySelector("[data-sdl-source]")?.addEventListener("click", onSourceClick);
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
  const source = showDetail ? (entry.damage.source ?? null) : null;

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

/** Scroll to, and briefly highlight, the chat card the damage was applied from. */
function onSourceClick(event) {
  event.preventDefault();
  const id = event.currentTarget.dataset.sdlSource;
  const log = event.currentTarget.closest(".chat-log") ?? document.querySelector("#chat .chat-log");
  const card = log?.querySelector(`.message[data-message-id="${cssEscape(id)}"]`);
  if ( !card ) {
    ui.notifications.info(t("notify.sourceNotLoaded"));
    return;
  }
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.add("sdl-flash");
  setTimeout(() => card.classList.remove("sdl-flash"), 1500);
}

function cssEscape(value) {
  return globalThis.CSS?.escape ? globalThis.CSS.escape(value) : String(value).replace(/"/g, "");
}

/** Re-render every entry already in the log, after a setting that changes what viewers see. */
export function rerenderEntries() {
  for ( const message of game.messages ) {
    if ( message.flags?.[MODULE_ID] ) ui.chat?.updateMessage(message);
  }
}
