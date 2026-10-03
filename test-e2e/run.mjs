/**
 * Run the end-to-end suites against a real Foundry world.
 *
 *   node run.mjs                          # every suite
 *   node run.mjs --only=undoSuite,menuSuite
 *   node run.mjs --hold                   # leave the browsers open at the end
 *   HEADED=1 node run.mjs                 # watch it
 *
 * Exits non-zero if any assertion fails or any client logged an error, so it can gate a release.
 * Foundry locks its data directory: close the Foundry desktop app first.
 */

import { fileURLToPath } from "node:url";
import { PLAYERS, WORLDS } from "./config.mjs";
import { startFoundry } from "./lib/server.mjs";
import { Session } from "./lib/session.mjs";
import { ensureWorld, worldInitialised } from "./lib/worlds.mjs";

const argv = process.argv.slice(2);
const flag = name => argv.find(a => a.startsWith(`--${name}=`))?.split("=")[1];
const has = name => argv.includes(`--${name}`);

const worldId = flag("world") ?? Object.keys(WORLDS)[0];
const only = flag("only")?.split(",").map(s => s.trim()).filter(Boolean) ?? null;
const spec = WORLDS[worldId];

if ( !spec ) {
  console.error(`Unknown world "${worldId}". Known: ${Object.keys(WORLDS).join(", ")}`);
  process.exit(1);
}
if ( !worldInitialised(worldId) ) {
  console.error(`World "${worldId}" has no database yet. Run: node provision.mjs ${worldId}`);
  process.exit(1);
}
ensureWorld(worldId);

console.log(`\n=== ${spec.title} (${worldId}) ===`);

const server = await startFoundry(worldId);
let gm = null;
const players = [];
let failed = 0;

try {
  gm = await Session.open();
  console.log(`joined as ${gm.userName}`);
  for ( const line of await gm.inWorld("provision.mjs", "ensureWorld", PLAYERS) ) console.log(`  ${line}`);

  failed += report(await gm.inWorld("harness.mjs", "all"), only);

  if ( !only || only.includes("playerSuite") ) {
    await gm.inWorld("harness.mjs", "preparePlayer");
    for ( const player of PLAYERS ) {
      const session = await Session.open({ user: player.name });
      players.push(session);
      console.log(`\njoined as ${session.userName}`);
      failed += report(await session.inWorld("player.mjs", "all"), only);
    }
  }

  // A picture for eyes: the GM's chat log with a few kinds of entry in it. Nothing asserts on it.
  try {
    const clip = await gm.inWorld("harness.mjs", "showcase");
    await gm.page.screenshot({ path: fileURLToPath(new URL(`showcase-${worldId}.png`, import.meta.url)), clip });
    console.log(`\n  screenshot: test-e2e/showcase-${worldId}.png`);
  } catch ( err ) {
    console.log(`  ..  could not write the screenshot: ${err.message.split("\n")[0]}`);
  }
  if ( !has("hold") ) await gm.inWorld("harness.mjs", "teardown");

  // The world's own console is an assertion.
  for ( const session of [gm, ...players] ) {
    const errors = session.errors();
    if ( !errors.length ) continue;
    failed++;
    console.log(`\n  FAIL  ${session.userName}'s client logged ${errors.length} error(s):`);
    for ( const line of errors.slice(0, 10) ) console.log(`        ${line.split("\n").slice(0, 3).join("\n        ")}`);
  }

  if ( has("hold") ) {
    console.log("\n--hold: browsers left open. Ctrl+C to finish.");
    await new Promise(() => {});
  }
} catch ( err ) {
  failed++;
  console.error(`\nRUN FAILED: ${err.message}`);
  if ( err.stack ) console.error(err.stack.split("\n").slice(1, 4).join("\n"));
  if ( gm ) console.error(`\n--- GM console tail ---\n${gm.tail(30)}`);
} finally {
  for ( const session of players ) await session.close().catch(() => {});
  if ( gm ) await gm.close({ returnToSetup: true }).catch(() => {});
  await server.stop();
}

console.log(failed ? `\n${failed} failure(s).\n` : "\nAll green.\n");
process.exit(failed ? 1 : 0);

/**
 * Print suite reports and count failures.
 * @param {Record<string, {total: number, failed: number, cases: object[]}>} results
 * @param {string[]|null} filter
 * @returns {number}
 */
function report(results, filter) {
  let failures = 0;
  for ( const [suite, result] of Object.entries(results) ) {
    if ( filter && !filter.includes(suite) ) continue;
    console.log(`\n[${result.failed ? "FAIL" : " ok "}] ${suite} — ${result.total - result.failed}/${result.total}`);
    for ( const item of result.cases ) {
      if ( item.pass ) {
        console.log(`       ok  ${item.name}`);
        continue;
      }
      failures++;
      console.log(`       ->  ${item.name}`);
      for ( const line of String(item.detail).split("\n").slice(0, 5) ) if ( line.trim() ) console.log(`           ${line}`);
    }
  }
  return failures;
}
