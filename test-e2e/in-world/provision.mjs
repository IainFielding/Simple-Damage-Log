/**
 * World fixtures, built inside Foundry: the player, the actors, a scene with tokens.
 *
 * Idempotent. `reset` puts everything back to full HP, default settings and an empty log at the
 * start of every suite, so no suite inherits another's state.
 */

export const MODULE = "sogrom-simple-damage-log";
export const PREFIX = "[e2e]";
export const HERO = `${PREFIX} Hero`;
export const BYSTANDER = `${PREFIX} Bystander`;
export const GOBLIN = `${PREFIX} Goblin`;
export const SCENE = `${PREFIX} Damage Log`;
/** Token names on the scene: one goblin in plain sight, one hidden from players. */
export const SEEN = `${PREFIX} Seen Goblin`;
export const LURKER = `${PREFIX} Hidden Goblin`;

export const MAX_HP = 30;

/**
 * Create or refresh the world's fixtures.
 * @param {{name: string, owns: string, observes: string}[]} players
 * @returns {Promise<string[]>}  Log lines.
 */
export async function ensureWorld(players) {
  const log = [];
  const hero = await ensureActor(HERO, "character");
  const bystander = await ensureActor(BYSTANDER, "character");
  const goblin = await ensureActor(GOBLIN, "npc", {
    "system.traits.dr.value": ["fire"],
    "prototypeToken.actorLink": false
  });
  log.push(`actors: ${hero.name}, ${bystander.name}, ${goblin.name}`);

  for ( const spec of players ) {
    let user = game.users.find(u => u.name === spec.name);
    if ( !user ) user = await User.create({ name: spec.name, role: CONST.USER_ROLES.PLAYER });
    const owned = game.actors.getName(spec.owns);
    const observed = game.actors.getName(spec.observes);
    if ( user.character?.id !== owned.id ) await user.update({ character: owned.id });
    await owned.update({ [`ownership.${user.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER });
    await observed.update({ [`ownership.${user.id}`]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER });
    log.push(`user "${user.name}" owns ${owned.name}, observes ${observed.name}`);
  }

  const scene = await ensureScene(goblin);
  log.push(`scene: ${scene.name}, tokens: ${scene.tokens.map(t => `${t.name}${t.hidden ? " (hidden)" : ""}`).join(", ")}`);
  return log;
}

async function ensureActor(name, type, extra = {}) {
  let actor = game.actors.getName(name);
  if ( !actor ) {
    actor = await Actor.create({ name, type, img: "icons/svg/mystery-man.svg" });
  }
  await actor.update({
    "system.attributes.hp.max": MAX_HP,
    "system.attributes.hp.value": MAX_HP,
    "system.attributes.hp.temp": 0,
    "system.attributes.hp.tempmax": 0,
    ...extra
  }, { "sogrom-simple-damage-log": { messageId: "fixture" } });
  return actor;
}

async function ensureScene(goblin) {
  let scene = game.scenes.getName(SCENE);
  if ( !scene ) scene = await Scene.create({ name: SCENE, width: 1000, height: 1000 });
  if ( !scene.active ) await scene.update({ active: true });
  const wanted = [{ name: SEEN, hidden: false, x: 100 }, { name: LURKER, hidden: true, x: 300 }];
  for ( const spec of wanted ) {
    const token = scene.tokens.getName(spec.name);
    if ( token ) continue;
    const data = (await goblin.getTokenDocument({ name: spec.name, hidden: spec.hidden, x: spec.x, y: 100 })).toObject();
    await scene.createEmbeddedDocuments("Token", [data]);
  }
  return scene;
}

/** The unlinked actor of one of the scene's goblin tokens. */
export function tokenActor(name) {
  return game.scenes.getName(SCENE)?.tokens.getName(name)?.actor ?? null;
}

/**
 * Put the world back to a known state: full HP everywhere, default settings, no entries.
 * Our own option on the update keeps the reset itself out of the log.
 */
export async function reset() {
  const quiet = { [MODULE]: { messageId: "reset" } };
  const full = {
    "system.attributes.hp.value": MAX_HP,
    "system.attributes.hp.temp": 0,
    "system.attributes.hp.tempmax": 0
  };
  for ( const actor of [game.actors.getName(HERO), game.actors.getName(BYSTANDER), tokenActor(SEEN), tokenActor(LURKER)] ) {
    await actor?.update(full, quiet);
  }
  for ( const [key, value] of Object.entries(DEFAULT_SETTINGS) ) {
    if ( game.settings.get(MODULE, key) !== value ) await game.settings.set(MODULE, key, value);
  }
  const ids = game.messages.contents.map(m => m.id);
  if ( ids.length ) await ChatMessage.deleteDocuments(ids);
}

/** The module's defaults, written out so a change to them shows up as a failing suite. */
export const DEFAULT_SETTINGS = {
  allowPlayerView: false,
  minPlayerPermission: 3,
  allowPlayerUndo: false,
  showLimitedInfo: false,
  hideHealingInLimitedInfo: false,
  gmOnlyHiddenTokens: true,
  clampToMax: true,
  clampToMin: true,
  suppressNotify: true,
  ignoreRests: false,
  showDamageTypes: true
};
