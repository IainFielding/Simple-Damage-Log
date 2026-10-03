/**
 * Who receives an entry, who sees its table, and who may undo it.
 *
 * Pure: the caller passes the settings and a permission test, so these run under Node. In the game
 * the test is `(user, level) => actor.testUserPermission(user, level)`.
 *
 * Three tiers of player access, from the settings:
 *   - none        entries are whispered to GMs (and permitted players, if player view is on)
 *   - full        players with the minimum permission on the actor see the Old/Diff/New table
 *   - limited     everyone receives the entry and sees its flavour line; only permitted players
 *                 see the table. Healing can be kept out of this tier.
 * A hidden token's entries go to GMs only, whatever the tiers say.
 */

import { OWNERSHIP, SETTINGS } from "../config.mjs";

/**
 * @callback PermissionTest
 * @param {{id: string, isGM: boolean}} user
 * @param {number} level  An ownership level.
 * @returns {boolean}
 */

/** Whether limited info applies to an entry of this kind. */
export function limitedInfoApplies(kind, settings) {
  return !!settings[SETTINGS.allowPlayerView] && !!settings[SETTINGS.showLimitedInfo]
    && !((kind === "healing") && settings[SETTINGS.hideHealingInLimitedInfo]);
}

/** Whether a (non-GM) user has the permission the settings ask for to see an actor's numbers. */
export function hasPlayerAccess(user, settings, hasPermission) {
  return !!settings[SETTINGS.allowPlayerView]
    && hasPermission(user, Number(settings[SETTINGS.minPlayerPermission] ?? OWNERSHIP.OWNER));
}

/**
 * The whisper list a new entry is created with. An empty list means public.
 * @param {object} args
 * @param {"damage"|"healing"} args.kind
 * @param {boolean} args.hiddenToken     Whether the speaker token was hidden when the HP changed.
 * @param {{id: string, isGM: boolean}[]} args.users  Every user in the world.
 * @param {object} args.settings         From `settingsSnapshot()`.
 * @param {PermissionTest} args.hasPermission
 * @returns {string[]}
 */
export function whisperFor({ kind, hiddenToken, users, settings, hasPermission }) {
  const gms = users.filter(u => u.isGM).map(u => u.id);
  if ( hiddenToken && settings[SETTINGS.gmOnlyHiddenTokens] ) return gms;
  if ( limitedInfoApplies(kind, settings) ) return [];
  return users.filter(u => u.isGM || hasPlayerAccess(u, settings, hasPermission)).map(u => u.id);
}

/**
 * Whether a user who has received an entry sees its Old/Diff/New table.
 * @param {object} args
 * @param {{id: string, isGM: boolean}} args.user
 * @param {object} args.entry   The entry's flags; `public` is set by a GM's Reveal/Conceal.
 * @param {object} args.settings
 * @param {PermissionTest} args.hasPermission
 * @returns {boolean}
 */
export function canViewTable({ user, entry, settings, hasPermission }) {
  if ( user.isGM || (entry.public === true) ) return true;
  return hasPlayerAccess(user, settings, hasPermission);
}

/**
 * Whether a received entry is hidden from a user altogether: they may not see its table and the
 * limited tier doesn't cover it. This happens to a player who authored an entry they may not see,
 * since Foundry always shows authors their own whispers.
 */
export function isHiddenFrom({ canTable, entry, settings }) {
  if ( canTable ) return false;
  if ( entry.public === true ) return false;
  return !limitedInfoApplies(entry.kind, settings) || (!!entry.hidden && !!settings[SETTINGS.gmOnlyHiddenTokens]);
}

/**
 * Whether a user may undo or redo an entry: GMs always; players when player undo (and player
 * view, which the settings form makes it depend on) is on and they own the actor.
 */
export function canRevert({ user, settings, hasPermission }) {
  if ( user.isGM ) return true;
  return !!settings[SETTINGS.allowPlayerView] && !!settings[SETTINGS.allowPlayerUndo]
    && hasPermission(user, OWNERSHIP.OWNER);
}
