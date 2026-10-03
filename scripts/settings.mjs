/**
 * Settings, and the way the settings form greys out the ones that don't apply.
 */

import { DEFAULTS, MODULE_ID, OWNERSHIP, SETTINGS } from "./config.mjs";
import { rerenderEntries } from "./render.mjs";

/** World settings, in the order the form lists them. */
const WORLD = [
  [SETTINGS.allowPlayerView, Boolean],
  [SETTINGS.minPlayerPermission, Number],
  [SETTINGS.allowPlayerUndo, Boolean],
  [SETTINGS.showLimitedInfo, Boolean],
  [SETTINGS.hideHealingInLimitedInfo, Boolean],
  [SETTINGS.gmOnlyHiddenTokens, Boolean],
  [SETTINGS.clampToMax, Boolean],
  [SETTINGS.clampToMin, Boolean],
  [SETTINGS.suppressNotify, Boolean],
  [SETTINGS.ignoreRests, Boolean],
  [SETTINGS.showDamageTypes, Boolean]
];

/** Settings that change what a viewer sees on entries already in the log. */
const RERENDER = new Set([
  SETTINGS.allowPlayerView, SETTINGS.minPlayerPermission, SETTINGS.showLimitedInfo,
  SETTINGS.hideHealingInLimitedInfo, SETTINGS.gmOnlyHiddenTokens, SETTINGS.showDamageTypes
]);

/**
 * Which settings depend on which: a setting is greyed out unless every one it lists is ticked.
 * Player undo, permission and limited info mean nothing unless players can view the log at all.
 */
const DEPENDS_ON = {
  [SETTINGS.minPlayerPermission]: [SETTINGS.allowPlayerView],
  [SETTINGS.allowPlayerUndo]: [SETTINGS.allowPlayerView],
  [SETTINGS.showLimitedInfo]: [SETTINGS.allowPlayerView],
  [SETTINGS.hideHealingInLimitedInfo]: [SETTINGS.allowPlayerView, SETTINGS.showLimitedInfo]
};

export function registerSettings() {
  for ( const [key, type] of WORLD ) {
    const config = {
      name: `${MODULE_ID}.settings.${key}.name`,
      hint: `${MODULE_ID}.settings.${key}.hint`,
      scope: "world",
      config: true,
      type,
      default: DEFAULTS[key]
    };
    if ( key === SETTINGS.minPlayerPermission ) {
      config.choices = Object.fromEntries(Object.entries(OWNERSHIP)
        .map(([name, level]) => [level, `${MODULE_ID}.settings.minPlayerPermission.${name.toLowerCase()}`]));
    }
    if ( RERENDER.has(key) ) config.onChange = () => rerenderEntries();
    game.settings.register(MODULE_ID, key, config);
  }

  game.settings.register(MODULE_ID, SETTINGS.debug, {
    name: `${MODULE_ID}.settings.${SETTINGS.debug}.name`,
    hint: `${MODULE_ID}.settings.${SETTINGS.debug}.hint`,
    scope: "client",
    config: true,
    type: Boolean,
    default: DEFAULTS[SETTINGS.debug]
  });
}

/** Hooked on `renderSettingsConfig`: grey out settings whose parent is off, live as the GM ticks. */
export function onRenderSettingsConfig(_app, html) {
  if ( !game.user.isGM || !(html instanceof HTMLElement) ) return;
  const input = key => html.querySelector(`[name="${MODULE_ID}.${key}"]`);
  const checked = key => !!input(key)?.checked;

  const apply = () => {
    for ( const [key, parents] of Object.entries(DEPENDS_ON) ) {
      const field = input(key);
      if ( !field ) continue;
      const enabled = parents.every(checked);
      field.disabled = !enabled;
      field.closest(".form-group")?.classList.toggle("sdl-disabled", !enabled);
    }
  };

  const parents = new Set(Object.values(DEPENDS_ON).flat());
  for ( const key of parents ) input(key)?.addEventListener("change", apply);
  apply();
}
