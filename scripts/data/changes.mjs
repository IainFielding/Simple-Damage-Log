/**
 * Working out what an HP update changed, and whether that was damage or healing.
 */

import { DISPLAY_ORDER, TRACKED, num, trackedById } from "./tracked.mjs";

/**
 * @typedef {object} HpChange
 * @property {string} id    A tracked field id: "hp", "temp" or "tempmax".
 * @property {number} old
 * @property {number} new
 * @property {number} diff  `new − old`, never 0.
 */

/**
 * Compare an actor's current HP source data with the HP part of an update.
 * Fields the update doesn't mention are unchanged; fields it sets to the same value are dropped.
 * @param {object} current  `actor.system.attributes.hp`, as prepared.
 * @param {object} update   The `system.attributes.hp` object from the update, possibly partial.
 * @returns {HpChange[]}    In display order.
 */
export function diffChanges(current, update) {
  if ( !current || !update || (typeof update !== "object") ) return [];
  const changes = [];
  for ( const field of TRACKED ) {
    if ( !(field.key in update) ) continue;
    const before = num(current[field.key]);
    const after = num(update[field.key]);
    if ( after !== before ) changes.push({ id: field.id, old: before, new: after, diff: after - before });
  }
  return changes.sort((a, b) => DISPLAY_ORDER.indexOf(a.id) - DISPLAY_ORDER.indexOf(b.id));
}

/**
 * Classify a set of changes as damage or healing, and give the amount for the flavour line.
 *
 * HP and temp HP count towards the total; a positive total is healing, anything else damage. When
 * only temporary max HP moved, its sign decides, so Aid reads as healing and Life Drain as damage.
 * @param {HpChange[]} changes
 * @returns {{kind: "damage"|"healing", total: number}}
 */
export function classify(changes) {
  let counted = 0;
  let counts = false;
  let tempmax = 0;
  for ( const change of changes ) {
    const field = trackedById(change.id);
    if ( field?.counts ) {
      counted += change.diff;
      counts = true;
    } else if ( change.id === "tempmax" ) tempmax += change.diff;
  }
  const amount = (counts || !tempmax) ? counted : tempmax;
  return { kind: amount > 0 ? "healing" : "damage", total: Math.abs(amount) };
}
