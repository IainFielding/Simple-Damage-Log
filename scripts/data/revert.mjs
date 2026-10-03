/**
 * The actor update that undoes or redoes an entry.
 */

import { TRACKED, num } from "./tracked.mjs";

/**
 * Build the update that takes an entry's changes back off the actor (`undo`) or puts them on again
 * (`redo`), relative to the actor's HP *now*, so anything that happened since is kept.
 *
 * Clamps, when on:
 *   hp       0 … max + tempmax, using the tempmax this same update leaves behind
 *   temp     0 …
 *   tempmax  not clamped; it can legitimately be negative
 *
 * @param {object} args
 * @param {{value: number, temp: number, tempmax: number, max: number}} args.hp  Current prepared HP.
 * @param {import("./changes.mjs").HpChange[]} args.changes  The entry's changes.
 * @param {"undo"|"redo"} args.direction
 * @param {boolean} [args.clampMin=true]
 * @param {boolean} [args.clampMax=true]
 * @returns {Record<string, number>}  Flat update keys, e.g. `system.attributes.hp.value`.
 */
export function revertUpdate({ hp, changes, direction, clampMin = true, clampMax = true }) {
  const sign = direction === "undo" ? -1 : 1;
  const update = {};
  let tempmax = num(hp.tempmax);

  // TRACKED lists tempmax first, so the hp clamp below sees its new value.
  for ( const field of TRACKED ) {
    const change = changes.find(c => c.id === field.id);
    if ( !change ) continue;
    let value = num(hp[field.key]) + (sign * num(change.diff));

    if ( field.id === "tempmax" ) tempmax = value;
    else {
      if ( clampMin ) value = Math.max(value, 0);
      if ( clampMax && (field.id === "hp") ) value = Math.min(value, Math.max(num(hp.max) + tempmax, 0));
    }
    update[`system.attributes.hp.${field.key}`] = value;
  }
  return update;
}
