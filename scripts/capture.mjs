/**
 * Picking up the damage types behind an HP change, without wrapping anything.
 *
 * dnd5e's `Actor5e#applyDamage` runs in three steps:
 *   1. `calculateDamage` works out every part, then fires `dnd5e.calculateDamage(actor, damages, options)`
 *   2. it fires `dnd5e.preApplyDamage(actor, amount, updates, options)`, which may be cancelled
 *   3. it calls `actor.update(updates)`, *without* `options`, so `preUpdateActor` can't see them
 *
 * `calculateDamage` also runs for the damage dialog's previews, so step 1 alone proves nothing. The
 * summary from step 1 is parked against the `options` object; step 2 promotes it to "pending" for
 * the actor; step 3's `preUpdateActor` takes it only if it is fresh and the update's HP values are
 * the ones step 2 announced. Anything else means the context belongs to some other change, and
 * the entry is simply logged without types.
 */

import { log } from "./config.mjs";
import { hasTypedParts, summariseDamage } from "./data/damage-parts.mjs";

/** How long a pending context may wait for its update. applyDamage awaits nothing in between. */
const PENDING_TTL_MS = 2000;

const HP_KEYS = ["value", "temp", "tempmax"];

/** options object → damage summary, from the most recent calculation that used it. */
const calculated = new WeakMap();

/** actor uuid → {damage, expected, at} */
const pending = new Map();

/**
 * Drop entries older than the TTL. An entry is normally taken by its actor's next update, but one
 * whose update never comes (a hit die rolled at full HP, damage another module cancelled after this
 * one saw it) would otherwise stay for the session, and unlinked tokens each have their own uuid.
 * Called on every write, so neither map outgrows the handful of changes in flight.
 * @param {Map<string, {at: number}|number>} map
 */
function prune(map) {
  const cutoff = Date.now() - PENDING_TTL_MS;
  for ( const [key, value] of map ) {
    if ( (typeof value === "number" ? value : value.at) < cutoff ) map.delete(key);
  }
}

/** How many contexts are held, for the leak tests. */
export function heldCounts() {
  return { pending: pending.size, hitDice: hitDice.size };
}

/** Hooked at init: a calculation, possibly only a preview. */
export function onCalculateDamage(_actor, damages, options) {
  if ( options && (typeof options === "object") ) calculated.set(options, summariseDamage(damages));
}

/**
 * Hooked at ready, so that a handler another module registers in init, and which cancels the
 * application by returning `false`, runs before this one and nothing is left pending.
 */
export function onPreApplyDamage(actor, _amount, updates, options) {
  if ( !actor?.uuid ) return;
  // A token bar edit or a bare number comes through untyped; there is no breakdown to keep.
  const calc = calculated.get(options);
  const summary = hasTypedParts(calc) ? calc : null;
  const source = sourceOf(options?.originatingMessage);
  prune(pending);
  pending.set(actor.uuid, {
    damage: (summary || source) ? { ...(summary ?? { parts: [], threshold: false }), ...(source ? { source } : {}) } : null,
    expected: updates ?? {},
    at: Date.now()
  });
}

/**
 * Take the pending context for an actor's HP update, if it belongs to it.
 * @param {object} actor
 * @param {object} hpUpdate  The `system.attributes.hp` part of the update.
 * @returns {object|null}    The `damage` value for the entry.
 */
export function consume(actor, hpUpdate) {
  const entry = pending.get(actor?.uuid);
  if ( !entry ) return null;
  pending.delete(actor.uuid);
  if ( (Date.now() - entry.at) > PENDING_TTL_MS ) return null;
  for ( const key of HP_KEYS ) {
    const expected = entry.expected[`system.attributes.hp.${key}`];
    if ( (expected !== undefined) && (key in hpUpdate) && (hpUpdate[key] !== expected) ) {
      log("damage context did not match the update; logging without types", { expected: entry.expected, hpUpdate });
      return null;
    }
  }
  return entry.damage;
}

/** actor uuid → when dnd5e last announced a hit die roll for it. */
const hitDice = new Map();

/**
 * Hooked on `dnd5e.rollHitDieV2`, which fires just before dnd5e writes the healing. Unlike a rest's
 * own update, that write carries no `isRest` option, so this is how it is recognised as rest healing.
 */
export function onRollHitDie(_rolls, { subject } = {}) {
  if ( !subject?.uuid ) return;
  prune(hitDice);
  hitDice.set(subject.uuid, Date.now());
}

/**
 * Whether an actor's update is the healing from a hit die just rolled. Taken once.
 * @param {object} actor
 * @returns {boolean}
 */
export function consumeHitDie(actor) {
  const at = hitDice.get(actor?.uuid);
  if ( at === undefined ) return false;
  hitDice.delete(actor.uuid);
  return (Date.now() - at) <= PENDING_TTL_MS;
}

/** Where the damage came from, from the chat card it was applied from. */
function sourceOf(message) {
  if ( !message?.id ) return null;
  let item = null;
  try {
    item = message.getAssociatedItem?.()?.name ?? null;
  } catch {}
  return { messageId: message.id, alias: message.speaker?.alias ?? message.alias ?? "", item };
}
