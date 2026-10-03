/**
 * Shared constants and small runtime helpers for the Damage Log.
 *
 * Kept free of Application and DOM concerns so the pure `data/` logic can import from here and be
 * unit tested under plain Node.
 */

/** The module's id. Must match `id` in module.json; `tools/validate-package.mjs` checks it. */
export const MODULE_ID = "sogrom-simple-damage-log";

/** Prefix for every hook this module emits, camelCase of the title as the sibling modules do. */
export const HOOK_PREFIX = "simpleDamageLog";

/** Hooks this module fires. Each takes a single payload object. */
export const HOOKS = Object.freeze({
  /** `{api, version}` — the module is initialised. */
  ready: `${HOOK_PREFIX}.ready`,
  /** `{actor, data}` — cancellable; return `false` to stop an entry being posted. `data` may be edited. */
  preCreateEntry: `${HOOK_PREFIX}.preCreateEntry`,
  /** `{actor, message}` — an entry was posted. Fires on the client that made the HP change. */
  entryCreated: `${HOOK_PREFIX}.entryCreated`,
  /** `{message, reverted}` — an entry was undone (`true`) or redone (`false`). Fires on every client. */
  reverted: `${HOOK_PREFIX}.reverted`
});

/** Keys of every setting this module registers. */
export const SETTINGS = Object.freeze({
  allowPlayerView: "allowPlayerView",
  minPlayerPermission: "minPlayerPermission",
  allowPlayerUndo: "allowPlayerUndo",
  showLimitedInfo: "showLimitedInfo",
  hideHealingInLimitedInfo: "hideHealingInLimitedInfo",
  gmOnlyHiddenTokens: "gmOnlyHiddenTokens",
  hideUnknownNames: "hideUnknownNames",
  clampToMax: "clampToMax",
  clampToMin: "clampToMin",
  suppressNotify: "suppressNotify",
  ignoreRests: "ignoreRests",
  showDamageTypes: "showDamageTypes",
  debug: "debugLogging"
});

/** Foundry's token name display modes that show the name to everyone, duplicated for Node. */
export const PUBLIC_NAME_MODES = Object.freeze([30, 50]); // HOVER, ALWAYS

/** Foundry's ownership levels, duplicated so `data/` does not need `CONST` under Node. */
export const OWNERSHIP = Object.freeze({ NONE: 0, LIMITED: 1, OBSERVER: 2, OWNER: 3 });

export const DEFAULTS = Object.freeze({
  [SETTINGS.allowPlayerView]: false,
  [SETTINGS.minPlayerPermission]: OWNERSHIP.OWNER,
  [SETTINGS.allowPlayerUndo]: false,
  [SETTINGS.showLimitedInfo]: false,
  [SETTINGS.hideHealingInLimitedInfo]: false,
  [SETTINGS.gmOnlyHiddenTokens]: true,
  [SETTINGS.hideUnknownNames]: true,
  [SETTINGS.clampToMax]: true,
  [SETTINGS.clampToMin]: true,
  [SETTINGS.suppressNotify]: true,
  [SETTINGS.ignoreRests]: false,
  [SETTINGS.showDamageTypes]: true,
  [SETTINGS.debug]: false
});

/** Version of the shape stored in `flags[MODULE_ID]` on each entry. */
export const FLAG_SCHEMA = 1;

/** CSS classes put on a rendered entry. */
export const CSS = Object.freeze({
  entry: "sdl-entry",
  damage: "sdl-damage",
  healing: "sdl-healing",
  reverted: "sdl-reverted",
  hidden: "sdl-hidden"
});

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/**
 * Read a setting, returning the default rather than throwing when it is not registered yet.
 * @param {string} key  A value from {@link SETTINGS}.
 * @returns {*}
 */
export function setting(key) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch {
    return DEFAULTS[key];
  }
}

/** Every setting the pure logic needs, read once. */
export function settingsSnapshot() {
  return Object.fromEntries(Object.values(SETTINGS).map(key => [key, setting(key)]));
}

/**
 * Localise one of this module's keys: `t("menu.undoDamage")`.
 * @param {string} key     Key below the module namespace in lang/en.json.
 * @param {object} [data]  Interpolation data; when given, `format` is used.
 * @returns {string}
 */
export function t(key, data) {
  const full = `${MODULE_ID}.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

/**
 * Full path of one of this module's templates.
 * @param {string} rel  Path below `templates/`, including the extension.
 * @returns {string}
 */
export function tpl(rel) {
  return `modules/${MODULE_ID}/templates/${rel}`;
}

/** Debug log, silent unless this client switched debug logging on. */
export function log(...args) {
  if ( !setting(SETTINGS.debug) ) return;
  console.log(`${MODULE_ID} |`, ...args);
}

/**
 * Fire a notification-only hook. A listener in another module throwing must never take an HP
 * change down with it, so failures are logged and swallowed.
 * @param {string} hook
 * @param {object} payload
 */
export function fireHook(hook, payload) {
  log(`hook ${hook}`, payload);
  try {
    Hooks.callAll(hook, payload);
  } catch ( err ) {
    console.error(`${MODULE_ID} | listener threw on ${hook}`, err);
  }
}

/**
 * Fire a cancellable hook: `false` from any listener vetoes. A *throwing* listener is not a veto.
 * @param {string} hook
 * @param {object} payload
 * @returns {boolean}  Whether the action may proceed.
 */
export function callCancellable(hook, payload) {
  log(`hook ${hook}`, payload);
  try {
    return Hooks.call(hook, payload) !== false;
  } catch ( err ) {
    console.error(`${MODULE_ID} | listener threw on ${hook}`, err);
    return true;
  }
}
