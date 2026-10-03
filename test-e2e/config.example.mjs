/**
 * Configuration for the end-to-end harness. Copy to config.mjs (gitignored) and adjust the paths.
 *
 * The harness drives a *real* Foundry install, so the paths below are specific to the machine it
 * runs on.
 */

/** Where Foundry Virtual Tabletop itself is installed (the dir holding `main.mjs`). */
export const FOUNDRY_ROOT = "C:/FoundryVTT";

/** Foundry's user data root (the dir holding `Data/`, `Config/`, `Logs/`). */
export const DATA_PATH = "C:/Users/makar/AppData/Local/FoundryVTT";

/** Foundry's `Data/` dir, where worlds/modules/systems live. */
export const DATA_DIR = `${DATA_PATH}/Data`;

/**
 * Port for the harness's own Foundry instance. None of 30000 (a Foundry you already have running)
 * or the sibling harnesses' 30097–30099. Foundry's data-directory lock still means only one of
 * them can run at a time.
 */
export const PORT = 30096;

export const BASE_URL = `http://127.0.0.1:${PORT}`;

/** The module under test, junction-linked into `Data/modules` by `npm run link-module`. */
export const MODULE_ID = "sogrom-simple-damage-log";

/** The repo root, i.e. the junction target. */
export const MODULE_SOURCE = "H:/Code/FoundryModules/Simple-Damage-Log";

/** The system the test world runs, and the version this harness was written against. */
export const SYSTEM = "dnd5e";
export const SYSTEM_VERSION = "6.0.5";
export const CORE_VERSION = "14.368";

/** The test world. `id` doubles as the directory name under `Data/worlds`. */
export const WORLDS = {
  "damage-log-e2e": {
    id: "damage-log-e2e",
    title: "Damage Log (e2e)",
    description: "<p>Automated harness for the Simple Damage Log. Actors and scenes named "
      + "[e2e] are rebuilt every run.</p>",
    modules: [MODULE_ID]
  }
};

/** The Gamemaster Foundry auto-creates on a world with none. */
export const GM_USER = "Gamemaster";

/** One player, who owns the hero and can only observe the bystander. */
export const PLAYERS = [
  { name: "Player One", owns: "[e2e] Hero", observes: "[e2e] Bystander" }
];

/** Set true to watch the browser drive Foundry. `HEADED=1 npm test` also flips it. */
export const HEADED = process.env.HEADED === "1";

export const SERVER_TIMEOUT_MS = 120_000;
export const WORLD_READY_TIMEOUT_MS = 90_000;
