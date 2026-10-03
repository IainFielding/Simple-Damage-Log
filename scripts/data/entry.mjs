/**
 * The data an entry stores in `flags[MODULE_ID]`, and reading it back.
 *
 *   {
 *     schema: 1,
 *     actorUuid, tokenUuid?,       who changed; undo resolves the actor from actorUuid
 *     kind, total,                 "damage" | "healing", and the amount for the flavour line
 *     changes: HpChange[],         non-zero rows only, ids not labels (labels localise on render)
 *     hidden?: true,               the token was hidden when the HP changed
 *     damage?: {parts, threshold, source?}   when the change came through dnd5e's applyDamage
 *     reverted?: boolean,          undone
 *     public?: boolean             set by a GM's Reveal / Conceal; deleted by Reset Visibility
 *   }
 */

import { FLAG_SCHEMA, MODULE_ID } from "../config.mjs";
import { classify } from "./changes.mjs";

/**
 * @param {object} args
 * @param {string} args.actorUuid
 * @param {string|null} [args.tokenUuid]
 * @param {import("./changes.mjs").HpChange[]} args.changes
 * @param {boolean} [args.hidden]
 * @param {{parts: object[], threshold: boolean, source?: object}|null} [args.damage]
 * @returns {object}
 */
export function buildEntry({ actorUuid, tokenUuid = null, changes, hidden = false, damage = null }) {
  const { kind, total } = classify(changes);
  const entry = { schema: FLAG_SCHEMA, actorUuid, kind, total, changes };
  if ( tokenUuid ) entry.tokenUuid = tokenUuid;
  if ( hidden ) entry.hidden = true;
  if ( damage ) entry.damage = damage;
  return entry;
}

/**
 * This module's entry on a chat message, or null if the message isn't one.
 * @param {{flags?: object}|null} message
 * @returns {object|null}
 */
export function readEntry(message) {
  const entry = message?.flags?.[MODULE_ID];
  return (entry && Array.isArray(entry.changes)) ? entry : null;
}

/**
 * The flavour line: "Took 12 damage", or with types "Took 12 damage (8 slashing, 4 fire)".
 *
 * @param {object} entry
 * @param {object} args
 * @param {boolean} args.showTypes
 * @param {(key: string, data?: object) => string} args.t            Module localiser.
 * @param {(type: string) => string} args.typeLabel                  Damage type key → label.
 * @returns {string}  Plain text; the caller escapes it.
 */
export function flavorText(entry, { showTypes, t, typeLabel }) {
  const parts = shownParts(entry, showTypes).filter(p => p.value);
  const types = parts.map(p => `${p.value} ${typeLabel(p.type).toLowerCase()}`).join(", ");
  const onlyTempmax = entry.changes.every(c => c.id === "tempmax");
  const key = onlyTempmax ? `flavor.tempmax.${entry.kind}` : `flavor.${entry.kind}`;
  const text = t(key, { amount: entry.total });
  return (types && !onlyTempmax) ? t("flavor.withTypes", { text, types }) : text;
}

/**
 * The typed damage parts worth showing. Only damage has a breakdown: healing's one type is
 * "healing" or "temp HP", which the entry already says.
 * @param {object} entry
 * @param {boolean} showTypes  The Show damage types setting.
 * @returns {object[]}
 */
export function shownParts(entry, showTypes) {
  if ( !showTypes || (entry.kind !== "damage") ) return [];
  return entry.damage?.parts?.filter(p => p.type) ?? [];
}
