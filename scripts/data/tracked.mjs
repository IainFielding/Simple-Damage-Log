/**
 * The hit point fields an entry records, in the order its table lists them.
 *
 * Each `key` is a field of dnd5e's `system.attributes.hp` source data. `counts` says whether the
 * change adds to the entry's damage/healing total: temporary max HP is shown but is neither, since
 * gaining 5 max HP from Aid heals nothing.
 *
 * The order also matters when undoing: `tempmax` is restored before `value`, because the maximum
 * that `value` is clamped to depends on it (see revert.mjs).
 */
export const TRACKED = Object.freeze([
  Object.freeze({ id: "tempmax", key: "tempmax", counts: false }),
  Object.freeze({ id: "hp", key: "value", counts: true }),
  Object.freeze({ id: "temp", key: "temp", counts: true })
]);

/** The order rows appear in an entry's table: HP first, as a player reads it. */
export const DISPLAY_ORDER = Object.freeze(["hp", "temp", "tempmax"]);

/** Look a tracked field up by its id. */
export function trackedById(id) {
  return TRACKED.find(f => f.id === id) ?? null;
}

/** dnd5e leaves `temp` and `tempmax` null on a fresh actor; treat anything non-numeric as 0. */
export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
