/**
 * Reading dnd5e's damage calculation into the compact form an entry stores.
 *
 * dnd5e's `Actor5e#calculateDamage` hands its `dnd5e.calculateDamage` hook an array of damage
 * descriptions. By then each one carries its applied `value` (after modification, resistance,
 * vulnerability, immunity and healing inversion) and an `active` record of what applied:
 *
 *   { multiplier: 0.5, threshold?: true, type: {resistance: true}, all: {modification: true} }
 *
 * `type` holds effects specific to the damage type, `all` those from "all damage" traits.
 */

/** Modifiers worth telling the table about, in the order they're listed. */
export const MODIFIERS = Object.freeze(["immunity", "resistance", "vulnerability", "modification", "threshold"]);

/**
 * @typedef {object} DamagePart
 * @property {string|null} type   A key of CONFIG.DND5E.damageTypes or healingTypes, or null if untyped.
 * @property {number} value       The amount applied; positive for both damage and healing.
 * @property {number} multiplier
 * @property {string[]} mods      Values from {@link MODIFIERS}.
 */

/**
 * @param {object[]} damages  The DamageSummary array from `dnd5e.calculateDamage`.
 * @returns {{parts: DamagePart[], threshold: boolean}}
 */
export function summariseDamage(damages) {
  const parts = [];
  let threshold = false;
  for ( const d of damages ?? [] ) {
    const active = d?.active ?? {};
    const mods = new Set();
    for ( const scope of [active.type, active.all] ) {
      for ( const [mod, on] of Object.entries(scope ?? {}) ) if ( on ) mods.add(mod);
    }
    if ( active.threshold ) {
      mods.add("threshold");
      threshold = true;
    }
    parts.push({
      type: d?.type || null,
      value: Math.abs(Number(d?.value) || 0),
      multiplier: Number.isFinite(active.multiplier) ? active.multiplier : 1,
      mods: MODIFIERS.filter(m => mods.has(m))
    });
  }
  return { parts, threshold };
}

/** Whether any part is typed, so there is a breakdown worth showing. */
export function hasTypedParts(summary) {
  return !!summary?.parts?.some(p => p.type);
}
