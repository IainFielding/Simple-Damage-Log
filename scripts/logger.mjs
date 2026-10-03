/**
 * Posting an entry when an actor's hit points change.
 *
 * Two halves, both on the client making the change:
 *   preUpdateActor  the actor still holds the old values, so the diff is worked out here and
 *                   carried in the update's options
 *   updateActor     the update went through, so the entry is posted here. An update that another
 *                   module vetoes, or the server refuses, never gets this far and leaves no entry
 */

import {
  HOOKS, MODULE_ID, SETTINGS, callCancellable, fireHook, log, setting, settingsSnapshot, t
} from "./config.mjs";
import { consume, consumeHitDie } from "./capture.mjs";
import { classify, diffChanges } from "./data/changes.mjs";
import { buildEntry, flavorText } from "./data/entry.mjs";
import { whisperFor } from "./data/visibility.mjs";

/**
 * The update option that carries drafted entries from preUpdateActor to updateActor, keyed by actor
 * uuid. Foundry hands one options object to every actor in a batched update, so a single draft
 * would be overwritten by the next actor's and posted against all of them.
 */
const DRAFT = `${MODULE_ID}:draft`;

/** Hooked on `preUpdateActor`. Must stay synchronous: it must not delay the update. */
export function onPreUpdateActor(actor, changes, options, userId) {
  if ( userId !== game.user.id ) return;
  if ( options?.[MODULE_ID] ) return; // our own undo / redo

  // The prepared values, not `_source`: dnd5e caps a stored HP above max to max when it prepares
  // the actor, so the prepared value is the one the sheet showed and the "Old" the user expects.
  const current = actor.system?.attributes?.hp;
  const update = foundry.utils.getProperty(changes, "system.attributes.hp");
  if ( !current || !update ) return; // group actors have no HP

  // Both are taken whether or not they're used, so they can't attach to a later update.
  const damage = consume(actor, update);
  const fromHitDie = consumeHitDie(actor);

  const hpChanges = diffChanges(current, update);
  if ( !hpChanges.length ) return;
  // A hit die only ever heals. If the roll wrote nothing (already at max HP), its marker must not
  // swallow whatever this update is instead.
  const restHealing = options.isRest || (fromHitDie && (classify(hpChanges).kind === "healing"));
  if ( restHealing && setting(SETTINGS.ignoreRests) ) return;

  (options[DRAFT] ??= {})[actor.uuid] = { changes: hpChanges, damage };
}

/** Hooked on `updateActor`: post the entry drafted for an update that has now happened. */
export function onUpdateActor(actor, _changes, options, userId) {
  const draft = options?.[DRAFT]?.[actor.uuid];
  if ( !draft || (userId !== game.user.id) ) return;
  try {
    postEntry(actor, draft.changes, draft.damage ?? null);
  } catch ( err ) {
    // A logging failure must never take anything else down with it.
    console.error(`${MODULE_ID} | could not log an HP change`, err);
  }
}

/** Build and create the chat message for one HP change. */
function postEntry(actor, hpChanges, damage) {
  const settings = settingsSnapshot();
  const speaker = ChatMessage.getSpeaker({ actor, token: actor.token });
  const token = actor.token ?? tokenFromSpeaker(speaker);
  const hidden = !!token?.hidden;

  const entry = buildEntry({
    actorUuid: actor.uuid,
    tokenUuid: actor.isToken ? actor.token?.uuid : null,
    changes: hpChanges,
    hidden,
    damage
  });

  const flavor = foundry.utils.escapeHTML(flavorText(entry, {
    showTypes: settings[SETTINGS.showDamageTypes], t, typeLabel: damageTypeLabel
  }));

  const data = {
    speaker,
    style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    flavor,
    // Never the numbers: the table renders from flags for those allowed to see it. This is only
    // what anyone would read if the module were switched off.
    content: `<p>${flavor}</p>`,
    whisper: whisperFor({
      kind: entry.kind,
      hiddenToken: hidden,
      users: game.users.contents,
      settings,
      hasPermission: (user, level) => actor.testUserPermission(user, level)
    }),
    flags: { [MODULE_ID]: entry }
  };

  if ( !callCancellable(HOOKS.preCreateEntry, { actor, data }) ) return;

  log("posting entry", data);
  ChatMessage.create(data, { notify: !settings[SETTINGS.suppressNotify] })
    .then(message => message && fireHook(HOOKS.entryCreated, { actor, message }))
    .catch(err => console.error(`${MODULE_ID} | could not post an entry`, err));
}

/** The token document a speaker names, if it still exists. */
function tokenFromSpeaker(speaker) {
  if ( !speaker?.token ) return null;
  return game.scenes.get(speaker.scene)?.tokens.get(speaker.token) ?? null;
}

/** A damage or healing type's label, from dnd5e's config. */
export function damageTypeLabel(type) {
  const config = CONFIG.DND5E?.damageTypes?.[type] ?? CONFIG.DND5E?.healingTypes?.[type];
  return config?.label ? game.i18n.localize(config.label) : type;
}
