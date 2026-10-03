/**
 * Entry point — module.json points Foundry here.
 *
 *   init   settings, the API, the table template, and every hook but one
 *   ready  dnd5e.preApplyDamage (see capture.mjs for why it waits), then `simpleDamageLog.ready`
 *
 * Everything lives in the chat log; nothing here patches Foundry's classes.
 */

import { HOOKS, MODULE_ID, fireHook } from "./config.mjs";
import { api, registerApi } from "./api.mjs";
import { onCalculateDamage, onPreApplyDamage } from "./capture.mjs";
import { onGetChatMessageContextOptions } from "./context-menu.mjs";
import { onPreUpdateActor } from "./logger.mjs";
import { onRenderChatMessage, preloadTemplates } from "./render.mjs";
import { onRenderSettingsConfig, registerSettings } from "./settings.mjs";
import { onPreUpdateChatMessage, onUpdateActor, onUpdateChatMessage } from "./sync.mjs";

/** Whether this world runs the system the module is written for. */
const isDnd5e = () => game.system?.id === "dnd5e";

Hooks.once("init", () => {
  if ( !isDnd5e() ) {
    console.error(`${MODULE_ID} | requires the dnd5e game system; the damage log is disabled.`);
    return;
  }

  registerSettings();
  registerApi();
  preloadTemplates();

  Hooks.on("renderSettingsConfig", onRenderSettingsConfig);
  Hooks.on("dnd5e.calculateDamage", onCalculateDamage);
  Hooks.on("preUpdateActor", onPreUpdateActor);
  Hooks.on("updateActor", onUpdateActor);
  Hooks.on("preUpdateChatMessage", onPreUpdateChatMessage);
  Hooks.on("updateChatMessage", onUpdateChatMessage);
  Hooks.on("renderChatMessageHTML", onRenderChatMessage);
  Hooks.on("getChatMessageContextOptions", onGetChatMessageContextOptions);
});

Hooks.once("ready", () => {
  if ( !isDnd5e() ) return;
  Hooks.on("dnd5e.preApplyDamage", onPreApplyDamage);
  fireHook(HOOKS.ready, { api, version: game.modules.get(MODULE_ID)?.version ?? "" });
});
