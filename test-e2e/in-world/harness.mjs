/**
 * The assertions only a real world can answer, run inside Foundry's own page as the Gamemaster.
 *
 * The rules (diffs, classification, visibility, undo maths) are unit-tested and not repeated here.
 * What lives here is what a unit test cannot see: that the hooks fire where expected on real
 * documents; that dnd5e's damage application really hands over its types; that an entry renders in
 * the real chat log with its table; that the context menu offers Undo; that undo really moves HP and
 * marks the entry; that Reveal / Reset Visibility round-trip; that a quiet entry raises no pip.
 */

import {
  BYSTANDER, HERO, LURKER, MAX_HP, MODULE, SEEN, reset, tokenActor
} from "./provision.mjs";

/* -------------------------------------------- */
/*  A very small test framework                 */
/* -------------------------------------------- */

export class Report {
  cases = [];

  check(name, condition, detail = "") {
    this.cases.push({ name, pass: !!condition, detail: condition ? "" : String(detail) });
    return !!condition;
  }

  equal(name, actual, expected) {
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    return this.check(name, pass, pass ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }

  fail(name, err) {
    this.cases.push({ name, pass: false, detail: `${err?.message ?? err}\n${err?.stack ?? ""}` });
  }

  get summary() {
    const failed = this.cases.filter(c => !c.pass);
    return { total: this.cases.length, failed: failed.length, cases: this.cases };
  }
}

/** Poll until `fn` returns truthy, or throw after `timeout` ms with `label` in the message. */
export async function waitFor(fn, label, timeout = 5000) {
  const start = performance.now();
  for ( ;; ) {
    const value = await fn();
    if ( value ) return value;
    if ( performance.now() - start > timeout ) throw new Error(`timed out waiting for ${label}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

export const api = () => game.modules.get(MODULE).api;

/** Every damage log entry in the world, oldest first. */
export const entries = () => game.messages.contents.filter(m => api().isEntry(m));

/** Wait for the `n`th entry and return it. */
export async function nthEntry(n, label = `entry #${n}`) {
  await waitFor(() => entries().length >= n, label);
  return entries()[n - 1];
}

/** The rendered `<li>` for a message in the sidebar chat log. */
export function rowOf(message) {
  return document.querySelector(`#sidebar .chat-log .message[data-message-id="${message.id}"]`);
}

/** Wait for a message's row to be rendered with our table (or without, if `table` is false). */
export async function renderedRow(message, { table = true } = {}) {
  return waitFor(() => {
    const li = rowOf(message);
    if ( !li?.classList.contains("sdl-entry") ) return null;
    return (!!li.querySelector(".sdl-table") === table) ? li : null;
  }, `entry ${message.id} to render${table ? " with its table" : ""}`);
}

const hp = actor => actor.system.attributes.hp;
const set = (key, value) => game.settings.set(MODULE, key, value);

/** Run one suite: reset first, catch anything thrown as a failed case. */
async function suite(name, fn) {
  const report = new Report();
  try {
    await reset();
    await fn(report);
  } catch ( err ) {
    report.fail(`${name} threw`, err);
  }
  return [name, report.summary];
}

/* -------------------------------------------- */
/*  Entry point                                 */
/* -------------------------------------------- */

export async function all() {
  ui.sidebar.changeTab("chat", "primary");
  const results = [];
  results.push(await suite("logSuite", logSuite));
  results.push(await suite("damageTypeSuite", damageTypeSuite));
  results.push(await suite("undoSuite", undoSuite));
  results.push(await suite("menuSuite", menuSuite));
  results.push(await suite("visibilitySuite", visibilitySuite));
  results.push(await suite("restSuite", restSuite));
  results.push(await suite("quietSuite", quietSuite));
  results.push(await suite("forgerySuite", forgerySuite));
  results.push(await suite("apiSuite", apiSuite));
  results.push(await suite("settingsSuite", settingsSuite));
  results.push(await suite("rerenderSuite", rerenderSuite));
  results.push(await suite("leakSuite", leakSuite));
  return Object.fromEntries(results);
}

/* -------------------------------------------- */
/*  Suites                                      */
/* -------------------------------------------- */

/** A plain HP edit is logged, rendered, and nothing else is. */
async function logSuite(report) {
  const hero = game.actors.getName(HERO);

  await hero.update({ "system.attributes.hp.value": 22 });
  const message = await nthEntry(1, "an entry for a sheet edit");
  const entry = api().entryFor(message);
  report.equal("a sheet edit records old, new and the change", entry.changes, [{ id: "hp", old: 30, new: 22, diff: -8 }]);
  report.equal("…as 8 damage", [entry.kind, entry.total], ["damage", 8]);
  report.check("…against the actor's uuid", entry.actorUuid === hero.uuid, entry.actorUuid);
  report.check("…with no damage types, since none were given", !entry.damage);
  report.equal("…public by default, through limited info", message.whisper, []);
  report.check("…with the flavour line", /8/.test(message.flavor) && /damage/i.test(message.flavor), message.flavor);
  report.check("…and content that holds no numbers", !/22|30/.test(message.content), message.content);

  const li = await renderedRow(message);
  report.check("the entry renders as damage", li.classList.contains("sdl-damage") && !li.classList.contains("sdl-healing"));
  const cells = [...li.querySelectorAll(".sdl-table tbody td")].map(td => td.textContent.trim());
  report.equal("…with an HP row of 30, -8, 22", cells, ["HP", "30", "-8", "22"]);

  await hero.update({ "system.attributes.hp.value": 25, "system.attributes.hp.temp": 4 });
  const heal = await nthEntry(2, "an entry for healing plus temp HP");
  const healEntry = api().entryFor(heal);
  report.equal("HP and temp HP together are one healing entry of 7", [healEntry.kind, healEntry.total], ["healing", 7]);
  report.equal("…with both rows", healEntry.changes.map(c => c.id), ["hp", "temp"]);
  report.check("…rendered as healing", (await renderedRow(heal)).classList.contains("sdl-healing"));

  await hero.update({ "system.attributes.hp.tempmax": 5 });
  const aid = await nthEntry(3, "an entry for temp max HP");
  report.equal("a max HP change gets its own row and wording",
    [api().entryFor(aid).changes[0].id, api().entryFor(aid).kind], ["tempmax", "healing"]);

  // One batched update for two actors: Foundry shares its options between them, and each must
  // still get its own entry with its own numbers.
  const bystander = game.actors.getName(BYSTANDER);
  const batchStart = entries().length;
  await Actor.updateDocuments([
    { _id: hero.id, "system.attributes.hp.value": 10 },
    { _id: bystander.id, "system.attributes.hp.value": 26 }
  ]);
  await nthEntry(batchStart + 2, "an entry for each actor in a batch");
  const batch = entries().slice(batchStart).map(m => api().entryFor(m));
  const forActor = actor => batch.find(e => e.actorUuid === actor.uuid);
  report.equal("a batched update logs the hero's own change", forActor(hero)?.changes[0]?.new, 10);
  report.equal("…and the bystander's own change", forActor(bystander)?.changes, [{ id: "hp", old: 30, new: 26, diff: -4 }]);

  // Another module adjusting the HP after this module's hook: the entry shows what happened.
  const cap = Hooks.on("preUpdateActor", (actor, changes) => {
    if ( (actor === hero) && (foundry.utils.getProperty(changes, "system.attributes.hp.value") === 5) ) {
      foundry.utils.setProperty(changes, "system.attributes.hp.value", 15);
    }
  });
  try {
    const capStart = entries().length;
    await hero.update({ "system.attributes.hp.value": 5 });
    const capped = await nthEntry(capStart + 1, "an entry for an adjusted update");
    report.equal("an update another module adjusts logs the HP it really reached", api().entryFor(capped).changes[0].new, 15);
  } finally {
    Hooks.off("preUpdateActor", cap);
  }

  const before = entries().length;
  await hero.update({ name: HERO, "system.details.biography.value": "<p>e2e</p>" });
  await hero.update({ "system.attributes.hp.value": hp(hero).value });
  await sleep(400);
  report.equal("an update that doesn't change HP posts nothing", entries().length, before);
}

/** Damage applied through dnd5e carries its types, modifiers and source. */
async function damageTypeSuite(report) {
  const goblin = tokenActor(SEEN);
  report.check("the seen goblin is an unlinked token actor", goblin?.isToken, goblin?.uuid);

  // The goblin resists fire: 6 slashing + 4 fire lands as 6 + 2.
  const attack = await ChatMessage.create({ content: "<p>e2e attack</p>", speaker: { alias: "Bandit Captain" } });
  await goblin.applyDamage([{ value: 6, type: "slashing" }, { value: 4, type: "fire" }], { originatingMessage: attack });
  const message = await nthEntry(1, "an entry for applyDamage");
  const entry = api().entryFor(message);
  report.equal("applyDamage takes 8 off the goblin", hp(goblin).value, MAX_HP - 8);
  report.equal("…and the entry says 8", entry.total, 8);
  report.equal("…with each part's type and applied value",
    entry.damage?.parts.map(p => [p.type, p.value]), [["slashing", 6], ["fire", 2]]);
  report.check("…marking fire as resisted", entry.damage?.parts[1]?.mods.includes("resistance"), JSON.stringify(entry.damage?.parts));
  report.equal("…and where it came from", entry.damage?.source?.messageId, attack.id);
  report.check("…against the token actor, so undo finds this goblin", entry.actorUuid === goblin.uuid && !!entry.tokenUuid, entry.actorUuid);
  report.check("the flavour lists the types", /slashing/i.test(message.flavor) && /fire/i.test(message.flavor), message.flavor);

  const li = await renderedRow(message);
  report.check("the table lists the parts", li.querySelectorAll(".sdl-parts li").length === 2);
  report.check("…and links back to the attack", !!li.querySelector(`[data-sdl-source="${attack.id}"]`));

  // A preview calculation, then an unrelated edit: the edit must not borrow the preview's types.
  goblin.calculateDamage([{ value: 3, type: "cold" }], {});
  await goblin.update({ "system.attributes.hp.value": hp(goblin).value - 1 });
  const edit = await nthEntry(2, "an entry after a preview");
  report.check("a damage preview's types don't leak into the next edit", !api().entryFor(edit).damage);

  // Temp HP soaks first.
  const hero = game.actors.getName(HERO);
  await hero.update({ "system.attributes.hp.temp": 5 }, { [MODULE]: { messageId: "setup" } });
  await hero.applyDamage([{ value: 8, type: "bludgeoning" }]);
  const soak = await nthEntry(3, "an entry for damage through temp HP");
  report.equal("damage through temp HP records both", api().entryFor(soak).changes.map(c => [c.id, c.diff]), [["hp", -3], ["temp", -5]]);
  report.equal("…totalling 8", api().entryFor(soak).total, 8);

  await hero.applyDamage([{ value: 4, type: "healing" }]);
  const heal = await nthEntry(4, "an entry for typed healing");
  report.equal("healing through applyDamage is healing", api().entryFor(heal).kind, "healing");
}

/** Undo and redo move HP relative to now, mark the entry, and clamp. */
async function undoSuite(report) {
  const hero = game.actors.getName(HERO);
  await hero.applyDamage([{ value: 8, type: "fire" }]);
  const message = await nthEntry(1);

  await hero.update({ "system.attributes.hp.value": hp(hero).value - 2 }); // 20, a later hit
  await nthEntry(2);

  report.check("undo succeeds", await api().revert(message));
  await waitFor(() => game.messages.get(message.id).getFlag(MODULE, "reverted") === true, "the entry to be marked undone");
  report.equal("undo gives back the 8 and keeps the later 2", hp(hero).value, 28);
  report.equal("undo itself posts no entry", entries().length, 2);
  report.check("the undone entry is struck through", (await waitFor(() => rowOf(message)?.classList.contains("sdl-reverted") && rowOf(message), "the reverted class")));
  report.check("undoing again is refused", (await api().revert(message)) === false);

  // Two redos fired together, before either has been marked: only one may apply.
  const both = await Promise.all([api().reapply(message), api().reapply(message)]);
  report.equal("two redos at once apply only one", both.filter(Boolean).length, 1);
  report.equal("…so the 8 comes off once", hp(hero).value, 20);
  await api().revert(message);
  await waitFor(() => game.messages.get(message.id).getFlag(MODULE, "reverted") === true, "the entry to be undone again");

  report.check("redo succeeds", await api().reapply(message));
  await waitFor(() => game.messages.get(message.id).getFlag(MODULE, "reverted") === false, "the entry to be marked redone");
  report.equal("redo takes the 8 off again", hp(hero).value, 20);

  // Clamping: full HP, then undo damage that would overheal.
  await hero.update({ "system.attributes.hp.value": MAX_HP });
  await nthEntry(3);
  await api().revert(message);
  await waitFor(() => game.messages.get(message.id).getFlag(MODULE, "reverted") === true, "a clamped undo to be marked");
  report.equal("undo never takes HP above max", hp(hero).value, MAX_HP);

  // With temp max on, the cap is max + tempmax.
  await api().reapply(message);
  await waitFor(() => game.messages.get(message.id).getFlag(MODULE, "reverted") === false, "redo before the tempmax case");
  await hero.update({ "system.attributes.hp.tempmax": 5, "system.attributes.hp.value": 30 }, { [MODULE]: { messageId: "setup" } });
  await api().revert(message);
  await waitFor(() => game.messages.get(message.id).getFlag(MODULE, "reverted") === true, "an undo under temp max");
  report.equal("…and counts temp max in that cap", hp(hero).value, 35);

  // Clamping off.
  await set("clampToMax", false);
  await api().reapply(message);
  await waitFor(() => game.messages.get(message.id).getFlag(MODULE, "reverted") === false, "redo with clamping off");
  await hero.update({ "system.attributes.hp.tempmax": 0, "system.attributes.hp.value": 28 }, { [MODULE]: { messageId: "setup" } });
  await api().revert(message);
  await waitFor(() => game.messages.get(message.id).getFlag(MODULE, "reverted") === true, "undo with clamping off");
  // dnd5e itself caps the prepared value at max, so the overheal shows only in the stored data.
  report.equal("with clamp to max off, undo stores HP above max", hero._source.system.attributes.hp.value, 36);
  report.equal("…which dnd5e still shows capped at max", hp(hero).value, MAX_HP);
  const count = entries().length;
  await hero.update({ "system.attributes.hp.value": 20 });
  const next = await nthEntry(count + 1, "an entry after the overheal");
  report.equal("the next entry's Old is the HP the sheet showed, not the stored overheal",
    api().entryFor(next).changes[0].old, MAX_HP);
}

/** The context menu offers the right item, and its click undoes. */
async function menuSuite(report) {
  const hero = game.actors.getName(HERO);
  await hero.update({ "system.attributes.hp.value": 20 });
  const message = await nthEntry(1);
  const li = await renderedRow(message);

  const menuLabels = async row => {
    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const menu = await waitFor(() => document.querySelector("#context-menu"), "the context menu");
    return { menu, labels: [...menu.querySelectorAll(".context-item")].map(el => el.textContent.trim()) };
  };

  let { menu, labels } = await menuLabels(li);
  report.check("a damage entry's menu offers Undo Damage", labels.includes("Undo Damage"), labels.join(" | "));
  report.check("…and not Redo, Undo Healing or Reset Visibility",
    !labels.some(l => ["Redo Damage", "Undo Healing", "Reset Visibility"].includes(l)), labels.join(" | "));

  [...menu.querySelectorAll(".context-item")].find(el => el.textContent.trim() === "Undo Damage").click();
  await waitFor(() => game.messages.get(message.id).getFlag(MODULE, "reverted") === true, "the menu's undo");
  report.equal("clicking it restores the HP", hp(hero).value, MAX_HP);

  ({ labels } = await menuLabels(await waitFor(() => rowOf(message)?.classList.contains("sdl-reverted") && rowOf(message), "the re-rendered row")));
  report.check("an undone entry offers Redo Damage", labels.includes("Redo Damage"), labels.join(" | "));
  document.querySelector("#context-menu")?.remove();
}

/** Who receives entries, and Reveal / Reset Visibility. */
async function visibilitySuite(report) {
  const player = game.users.find(u => !u.isGM);
  const gms = game.users.filter(u => u.isGM).map(u => u.id);
  const hero = game.actors.getName(HERO);
  const bystander = game.actors.getName(BYSTANDER);

  await set("showLimitedInfo", false);
  await hero.update({ "system.attributes.hp.value": 25 });
  let m = await nthEntry(1);
  report.check("with player view on, the owner receives their character's entry", m.whisper.includes(player.id), m.whisper);
  await bystander.update({ "system.attributes.hp.value": 25 });
  m = await nthEntry(2);
  report.check("…but an observer doesn't, at the default Owner permission", !m.whisper.includes(player.id), m.whisper);

  await set("showLimitedInfo", true);
  await bystander.update({ "system.attributes.hp.value": 20 });
  m = await nthEntry(3);
  report.equal("with limited info on, entries are public", m.whisper, []);

  await set("hideHealingInLimitedInfo", true);
  await bystander.update({ "system.attributes.hp.value": 30 });
  m = await nthEntry(4);
  report.check("…except healing, when that is hidden", m.whisper.length > 0 && !m.whisper.includes(player.id), m.whisper);

  const lurker = tokenActor(LURKER);
  report.check("the hidden goblin's token is hidden", lurker?.token?.hidden === true);
  await lurker.update({ "system.attributes.hp.value": 10 });
  const hidden = await nthEntry(5);
  report.equal("a hidden token's entry is GM-only, even with limited info on", hidden.whisper, gms);
  report.check("…and remembers why", api().entryFor(hidden).hidden === true);

  await set("gmOnlyHiddenTokens", false);
  await lurker.update({ "system.attributes.hp.value": 5 });
  m = await nthEntry(6);
  report.equal("with that setting off, it follows the other settings", m.whisper, []);

  // Reveal, then Reset Visibility.
  await hidden.update({ whisper: [], blind: false });
  await waitFor(() => game.messages.get(hidden.id).getFlag(MODULE, "public") === true, "Reveal to set public");
  report.check("Reveal marks the entry public", true);
  await set("gmOnlyHiddenTokens", true);
  const li = await renderedRow(hidden);
  li.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  const menu = await waitFor(() => document.querySelector("#context-menu"), "the context menu");
  const item = [...menu.querySelectorAll(".context-item")].find(el => el.textContent.trim() === "Reset Visibility");
  report.check("a revealed entry offers Reset Visibility", !!item);
  item?.click();
  await waitFor(() => game.messages.get(hidden.id).getFlag(MODULE, "public") === undefined, "Reset Visibility to clear public");
  report.equal("Reset Visibility puts it back to GM-only", game.messages.get(hidden.id).whisper, gms);
}

/** Rests are logged, unless the GM turns that off. */
async function restSuite(report) {
  const hero = game.actors.getName(HERO);
  await hero.update({ "system.attributes.hp.value": 10 });
  await nthEntry(1);
  await hero.longRest({ dialog: false, chat: false, newDay: false });
  await waitFor(() => hp(hero).value === MAX_HP, "the long rest to heal");
  const rest = await nthEntry(2, "an entry for the rest");
  report.equal("a long rest's healing is logged by default", [api().entryFor(rest).kind, api().entryFor(rest).total], ["healing", 20]);

  await set("ignoreRests", true);
  await hero.update({ "system.attributes.hp.value": 10 });
  await nthEntry(3);
  await hero.longRest({ dialog: false, chat: false, newDay: false });
  await waitFor(() => hp(hero).value === MAX_HP, "the second long rest to heal");
  await sleep(400);
  report.equal("with Don't log rests on, it isn't", entries().length, 3);

  // Hit dice spent in a short rest heal through their own update, which carries no isRest.
  await hero.update({ "system.attributes.hp.value": 10 });
  await nthEntry(4);
  const [cls] = await hero.createEmbeddedDocuments("Item", [{
    name: "[e2e] Fighter", type: "class", system: { levels: 3, hd: { denomination: "d10", spent: 0 } }
  }]);
  try {
    await hero.rollHitDie({ denomination: "d10" }, { configure: false }, { create: false });
    await waitFor(() => hp(hero).value > 10, "the hit die to heal");
    await sleep(400);
    report.equal("with Don't log rests on, a hit die isn't logged either", entries().length, 4);

    // A hit die roll that wrote nothing must not swallow the next change, which here is damage.
    Hooks.callAll("dnd5e.rollHitDieV2", [], { subject: hero, updates: {} });
    await hero.update({ "system.attributes.hp.value": hp(hero).value - 3 });
    await nthEntry(5, "damage right after an empty hit die roll");
    report.equal("…but damage just after a hit die that healed nothing still is", api().entryFor(entries().at(-1)).kind, "damage");

    await set("ignoreRests", false);
    await hero.rollHitDie({ denomination: "d10" }, { configure: false }, { create: false });
    const die = await nthEntry(6, "an entry for a hit die");
    report.equal("…but is logged by default", api().entryFor(die).kind, "healing");
  } finally {
    await cls.delete();
  }
}

/**
 * Quiet entries never reach core's `ChatLog#notify`, which raises the pip, the toast and the sound;
 * an ordinary message still does. Watched on this instance only, for the length of the suite.
 */
async function quietSuite(report) {
  const notified = [];
  const original = ui.chat.notify;
  ui.chat.notify = function(message, ...args) {
    notified.push(message.id);
    return original.call(this, message, ...args);
  };
  try {
    await game.actors.getName(HERO).update({ "system.attributes.hp.value": 25 });
    const entry = await nthEntry(1);
    await sleep(300);
    report.check("an entry doesn't notify", !notified.includes(entry.id), notified);

    const ordinary = await ChatMessage.create({ content: "<p>e2e ordinary message</p>" });
    await waitFor(() => notified.includes(ordinary.id), "an ordinary message to notify").catch(() => {});
    report.check("…while an ordinary message does (the check works)", notified.includes(ordinary.id), notified);

    await set("suppressNotify", false);
    await game.actors.getName(HERO).update({ "system.attributes.hp.value": 20 });
    const loud = await nthEntry(2);
    await waitFor(() => notified.includes(loud.id), "a loud entry to notify").catch(() => {});
    report.check("with Quiet entries off, an entry notifies", notified.includes(loud.id), notified);
  } finally {
    ui.chat.notify = original;
  }
}

/** Entries and undo markers a player could forge. */
async function forgerySuite(report) {
  const player = game.users.find(u => !u.isGM);
  const bystander = game.actors.getName(BYSTANDER);
  const hero = game.actors.getName(HERO);

  // A message carrying this module's flags, authored by a player who only observes the bystander.
  const forged = await ChatMessage.create({
    author: player.id,
    content: "<p>forged</p>",
    flags: { [MODULE]: {
      schema: 1, actorUuid: bystander.uuid, kind: "damage", total: 25,
      changes: [{ id: "hp", old: 30, new: 5, diff: -25 }]
    } }
  });
  report.check("a forged entry from a player who can't change the actor can't be undone, even by the GM",
    (await api().revert(forged)) === false);
  report.equal("…and the actor is untouched", hp(bystander).value, MAX_HP);
  report.check("the API doesn't count it as an entry", !api().isEntry(forged));
  const forgedRow = await waitFor(() => rowOf(forged), "the forged message to render");
  report.check("…and it renders as a plain message, not an entry", !forgedRow.classList.contains("sdl-entry")
    && !forgedRow.querySelector(".sdl-table"));

  // The GM reveals it, as they might any message: it stays a plain message, with no flag written
  // and no Reset Visibility acting on the forger's data.
  await forged.update({ whisper: [], blind: false });
  await sleep(300);
  report.check("revealing a forged entry writes no flag to it", forged.getFlag(MODULE, "public") === undefined);
  const row = await waitFor(() => rowOf(forged), "the revealed forged message");
  row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  const menu = await waitFor(() => document.querySelector("#context-menu"), "the forged message's menu");
  const labels = [...menu.querySelectorAll(".context-item")].map(el => el.textContent.trim());
  document.querySelector("#context-menu")?.remove();
  report.check("…and its menu offers none of this module's items",
    !labels.some(l => ["Reset Visibility", "Undo Damage", "Redo Damage"].includes(l)), labels.join(" | "));

  // A real entry, then an unrelated actor update carrying an undo marker that names it.
  await bystander.update({ "system.attributes.hp.value": 22 });
  const real = await nthEntry(1, "a real entry");
  await hero.update({ "system.attributes.hp.value": 29 }, { [MODULE]: { messageId: real.id, reverted: true } });
  await sleep(400);
  report.check("an undo marker on another actor's update doesn't mark the entry",
    game.messages.get(real.id).getFlag(MODULE, "reverted") !== true);
}

/** The ready hook and the API's shape. */
async function apiSuite(report) {
  // Another module vetoing the update: no HP change, so no entry.
  const veto = Hooks.on("preUpdateActor", () => false);
  try {
    await game.actors.getName(HERO).update({ "system.attributes.hp.value": 12 });
    await sleep(400);
    report.equal("an update another module vetoes leaves no entry", entries().length, 0);
    report.equal("…and no HP change", hp(game.actors.getName(HERO)).value, MAX_HP);
  } finally {
    Hooks.off("preUpdateActor", veto);
  }

  const a = api();
  report.check("the API is published", !!a && ["isEntry", "entryFor", "revert", "reapply"].every(k => typeof a[k] === "function"));

  let seen = null;
  const id = Hooks.on("simpleDamageLog.preCreateEntry", ({ data }) => {
    seen = data;
    return false;
  });
  try {
    await game.actors.getName(HERO).update({ "system.attributes.hp.value": 29 });
    await sleep(400);
    report.check("preCreateEntry sees the entry data", !!seen?.flags?.[MODULE]);
    report.equal("…and returning false stops it", entries().length, 0);
  } finally {
    Hooks.off("simpleDamageLog.preCreateEntry", id);
  }
}

/**
 * A setting that changes what viewers see re-renders the entries on screen, and only those: core's
 * updateMessage would post one that isn't in the log, as if it had just become visible.
 */
async function rerenderSuite(report) {
  const hero = game.actors.getName(HERO);
  await hero.update({ "system.attributes.hp.value": 25 });
  const shown = await nthEntry(1);
  await hero.update({ "system.attributes.hp.value": 20 });
  const unloaded = await nthEntry(2);
  await renderedRow(shown);
  (await renderedRow(unloaded)).remove(); // as if it were older than the loaded batch

  await set("showDamageTypes", false);
  await waitFor(() => rowOf(shown) && !rowOf(shown).querySelector(".sdl-parts"), "the shown entry to re-render").catch(() => {});
  await sleep(400);
  report.check("an entry on screen is re-rendered", !!rowOf(shown));
  report.check("one not in the log isn't pushed into it", !rowOf(unloaded));
}

/**
 * Nothing the module holds grows with use: hook listeners, the damage and hit die contexts that
 * bridge dnd5e's hooks to the actor update, and the undo guard all return to where they started
 * after many rounds of damage, undo, redo and hit dice that heal nothing.
 */
async function leakSuite(report) {
  const capture = await import(`/modules/${MODULE}/scripts/capture.mjs`);
  const actions = await import(`/modules/${MODULE}/scripts/actions.mjs`);
  const listeners = () => Object.fromEntries(
    ["updateChatMessage", "updateActor", "preUpdateActor", "renderChatMessageHTML", "dnd5e.renderChatMessage"]
      .map(name => [name, Hooks.events[name]?.length ?? 0]));
  const sleepPast = () => sleep(2100); // the contexts' TTL

  const hero = game.actors.getName(HERO);
  const goblin = tokenActor(SEEN);
  await sleepPast();
  await goblin.applyDamage([{ value: 1, type: "bludgeoning" }]); // settle anything left by earlier suites (not fire: it resists)
  await nthEntry(1);
  const before = { listeners: listeners(), held: capture.heldCounts(), inFlight: actions.inFlightCount() };

  for ( let i = 0; i < 20; i++ ) {
    await goblin.applyDamage([{ value: 1, type: "slashing" }]);
    const entry = await nthEntry(2 + i, `entry ${i}`);
    await api().revert(entry);
    await api().reapply(entry);
    // A hit die at full HP writes nothing, so its context is never consumed.
    Hooks.callAll("dnd5e.rollHitDieV2", [], { subject: hero, updates: {} });
  }
  await sleepPast();
  await goblin.applyDamage([{ value: 1, type: "bludgeoning" }]); // a write prunes what expired
  await nthEntry(22);

  report.equal("no hook listeners are left behind", listeners(), before.listeners);
  report.check("no damage or hit die contexts pile up", capture.heldCounts().pending <= 1 && capture.heldCounts().hitDice <= 1,
    JSON.stringify(capture.heldCounts()));
  report.equal("no undo is left marked as under way", actions.inFlightCount(), 0);
}

/** The settings form greys out settings whose parent is off, and follows the GM's ticks live. */
async function settingsSuite(report) {
  await set("allowPlayerView", false);
  await set("showLimitedInfo", false);
  const app = new foundry.applications.settings.SettingsConfig();
  await app.render({ force: true });
  try {
    const input = key => app.element.querySelector(`[name="${MODULE}.${key}"]`);
    await waitFor(() => input("allowPlayerView"), "the module's settings in the form");
    report.check("with player view off, Minimum actor permission is greyed out", input("minPlayerPermission").disabled);
    report.check("…and so are player undo and limited info", input("allowPlayerUndo").disabled && input("showLimitedInfo").disabled);
    report.check("settings without a parent are not", !input("clampToMax").disabled && !input("gmOnlyHiddenTokens").disabled);

    const tick = (key, on) => {
      const box = input(key);
      box.checked = on;
      box.dispatchEvent(new Event("change", { bubbles: true }));
    };
    tick("allowPlayerView", true);
    report.check("ticking player view enables them", !input("minPlayerPermission").disabled && !input("showLimitedInfo").disabled);
    report.check("…but not Hide healing, which also needs limited info", input("hideHealingInLimitedInfo").disabled);
    tick("showLimitedInfo", true);
    report.check("ticking limited info enables Hide healing", !input("hideHealingInLimitedInfo").disabled);
  } finally {
    await app.close();
  }
}

/* -------------------------------------------- */
/*  Set-up for the player client                */
/* -------------------------------------------- */

/**
 * Leave the world as the player suite expects it: player view, limited info, player undo and secret
 * names on, and one entry each for the hero (owned), the bystander (observed) and the hidden goblin.
 */
export async function preparePlayer() {
  await reset();
  await set("allowPlayerView", true);
  await set("showLimitedInfo", true);
  await set("allowPlayerUndo", true);
  await set("hideUnknownNames", true);
  await game.actors.getName(HERO).update({ "system.attributes.hp.value": 22 });
  await nthEntry(1);
  await game.actors.getName(BYSTANDER).update({ "system.attributes.hp.value": 24 });
  await nthEntry(2);
  await tokenActor(LURKER).update({ "system.attributes.hp.value": 12 });
  await nthEntry(3);
  await tokenActor(SEEN).update({ "system.attributes.hp.value": 18 });
  await nthEntry(4);
  // An attack the GM rolled privately, then applied to the hero: the player can't see the card.
  const secret = await ChatMessage.create({
    content: "<p>A blade from the dark.</p>", speaker: { alias: "[e2e] Shadow Assassin" },
    whisper: game.users.filter(u => u.isGM).map(u => u.id)
  });
  await game.actors.getName(HERO).applyDamage([{ value: 3, type: "piercing" }], { originatingMessage: secret });
  await nthEntry(5);
  return entries().map(m => m.id);
}

/**
 * For the screenshot: the chat log open, holding a typed hit with a resistance and its source, a
 * heal, an undone entry and a max HP change. Nothing asserts on it.
 */
export async function showcase() {
  await reset();
  ui.sidebar.expand();
  ui.sidebar.changeTab("chat", "primary");
  const goblin = tokenActor(SEEN);
  const hero = game.actors.getName(HERO);
  const attack = await ChatMessage.create({ content: "<p>The bandit captain swings, and a fire bolt follows.</p>", speaker: { alias: "Bandit Captain" } });
  await goblin.applyDamage([{ value: 6, type: "slashing" }, { value: 4, type: "fire" }], { originatingMessage: attack });
  await hero.update({ "system.attributes.hp.temp": 5 }, { [MODULE]: { messageId: "setup" } });
  await hero.applyDamage([{ value: 9, type: "bludgeoning" }]);
  const undone = await nthEntry(2);
  await hero.applyDamage([{ value: 4, type: "healing" }]);
  await nthEntry(3);
  await api().revert(undone);
  await waitFor(() => game.messages.get(undone.id).getFlag(MODULE, "reverted") === true, "the showcase undo");
  await hero.update({ "system.attributes.hp.tempmax": 5 });
  await nthEntry(4);
  await sleep(500);
  const sidebar = document.querySelector("#sidebar");
  const rect = sidebar.getBoundingClientRect();
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/** After the player suite: everything back to defaults. */
export async function teardown() {
  await reset();
}
