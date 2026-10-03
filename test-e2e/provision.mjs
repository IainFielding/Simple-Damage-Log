/**
 * One-time (idempotent) setup of the test worlds.
 *
 *   node provision.mjs                   # every world
 *   node provision.mjs damage-log-e2e  # just one
 *   node provision.mjs --reset           # delete the databases first and rebuild
 *
 * For each world: write the manifest, activate it (Foundry creates the database and a passwordless
 * Gamemaster), enable exactly the configured modules, reload, verify they came up, then create the
 * player and the two characters. The characters' gear is rebuilt at the start of every run as well,
 * so provisioning only has to happen once.
 */

import { MODULE_ID, PLAYERS, WORLDS } from "./config.mjs";
import { startFoundry } from "./lib/server.mjs";
import { Session } from "./lib/session.mjs";
import { ensureWorld, resetWorldData, worldInitialised } from "./lib/worlds.mjs";

const argv = process.argv.slice(2);
const reset = argv.includes("--reset");
const force = argv.includes("--force");
const targets = argv.filter(a => !a.startsWith("--"));
const worlds = targets.length ? targets : Object.keys(WORLDS);

for ( const id of worlds ) {
  if ( !WORLDS[id] ) {
    console.error(`Unknown world "${id}". Known: ${Object.keys(WORLDS).join(", ")}`);
    process.exit(1);
  }
}

for ( const worldId of worlds ) await provision(worldId);

async function provision(worldId) {
  const spec = WORLDS[worldId];
  console.log(`\n=== Provisioning "${spec.title}" (${worldId}) ===`);

  if ( reset ) {
    resetWorldData(worldId);
    console.log("  database reset");
  }
  const { created } = ensureWorld(worldId, { force });
  console.log(`  manifest ${created ? "created" : "already present"}; database `
    + `${worldInitialised(worldId) ? "exists" : "will be created on first launch"}`);

  const server = await startFoundry(worldId);
  let session;
  try {
    session = await Session.open();
    console.log("  joined as Gamemaster");

    const changed = await session.eval(async wanted => {
      const current = game.settings.get("core", "moduleConfiguration") ?? {};
      const next = { ...current };
      let dirty = false;
      for ( const id of game.modules.keys() ) {
        const on = wanted.includes(id);
        if ( !!next[id] === on ) continue;
        next[id] = on;
        dirty = true;
      }
      if ( dirty ) await game.settings.set("core", "moduleConfiguration", next);
      return dirty;
    }, spec.modules);
    if ( changed ) {
      console.log("  module configuration written, reloading…");
      await session.page.reload({ waitUntil: "domcontentloaded" });
      await session.waitForReady();
    }

    const status = await session.eval(wanted => wanted.map(id => ({ id, active: game.modules.get(id)?.active === true })), spec.modules);
    for ( const m of status ) console.log(`    ${m.active ? "on " : "OFF"} ${m.id}`);
    const missing = status.filter(m => !m.active);
    if ( missing.length ) throw new Error(`Modules did not come up active: ${missing.map(m => m.id).join(", ")}`);

    await session.eval(async id => {
      try { await game.settings.set(id, "debugLogging", true); } catch { /* not registered */ }
    }, MODULE_ID);

    const result = await session.inWorld("provision.mjs", "ensureWorld", PLAYERS);
    for ( const line of result ) console.log(`    ${line}`);

    await session.close({ returnToSetup: true });
    session = null;
    console.log("  done");
  } catch ( err ) {
    if ( session ) {
      console.error(`\n--- console tail ---\n${session.tail(40)}\n`);
      await session.close();
    }
    throw err;
  } finally {
    await server.stop();
  }
}
