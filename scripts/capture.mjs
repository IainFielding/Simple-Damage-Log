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
import { summariseDamage } from "./data/damage-parts.mjs";

/** How long a pending context may wait for its update. applyDamage awaits nothing in between. */
const PENDING_TTL_MS = 2000;

const HP_KEYS = ["value", "temp", "tempmax"];

/** options object → damage summary, from the most recent calculation that used it. */
const calculated = new WeakMap();

/** actor uuid → {damage, expected, at} */
const pending = new Map();

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
  const summary = calculated.get(options) ?? null;
  const source = sourceOf(options?.originatingMessage);
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

/** Where the damage came from, from the chat card it was applied from. */
function sourceOf(message) {
  if ( !message?.id ) return null;
  let item = null;
  try {
    item = message.getAssociatedItem?.()?.name ?? null;
  } catch {}
  return { messageId: message.id, alias: message.speaker?.alias ?? message.alias ?? "", item };
}
