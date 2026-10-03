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

import { OWNERSHIP, PUBLIC_NAME_MODES, SETTINGS } from "../config.mjs";

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
 * Whether an actor's name is kept from players: no player owns it, and its token shows its name
 * only to owners, or never. Decided when the entry is posted.
 * @param {{hasPlayerOwner: boolean, displayName: number|undefined}} args
 * @returns {boolean}
 */
export function nameIsSecret({ hasPlayerOwner, displayName }) {
  return !hasPlayerOwner && !PUBLIC_NAME_MODES.includes(displayName);
}

/**
 * Whether to show a viewer "Unknown creature" in place of an entry's speaker: the setting is on,
 * the name was secret when posted, and the viewer neither sees the table nor has any permission on
 * the actor (someone with Limited or better already knows it).
 */
export function hideNameFrom({ user, entry, canTable, settings, hasPermission }) {
  if ( !settings[SETTINGS.hideUnknownNames] || !entry.anonymous || canTable || user.isGM ) return false;
  return !hasPermission(user, OWNERSHIP.LIMITED);
}

/**
 * Whether an entry could have been posted by this module for its actor: its author is a GM or
 * owns the actor, i.e. could have made that HP change themselves. Any player can create a chat
 * message carrying these flags, so an entry from anyone else is a forgery, and undoing it would
 * let them change an actor they can't touch through whoever clicks Undo.
 * @param {{isGM: boolean}|null} author
 * @param {PermissionTest} hasPermission
 */
export function isTrustedAuthor(author, hasPermission) {
  if ( !author ) return false;
  return author.isGM || hasPermission(author, OWNERSHIP.OWNER);
}

/**
 * Whether a user may undo or redo an entry: GMs always; players when player undo (and player
 * view, which the settings form makes it depend on) is on and they own the actor. Never for an
 * entry whose author couldn't have made the change (see {@link isTrustedAuthor}).
 */
export function canRevert({ user, author, settings, hasPermission }) {
  if ( !isTrustedAuthor(author, hasPermission) ) return false;
  if ( user.isGM ) return true;
  return !!settings[SETTINGS.allowPlayerView] && !!settings[SETTINGS.allowPlayerUndo]
    && hasPermission(user, OWNERSHIP.OWNER);
}
