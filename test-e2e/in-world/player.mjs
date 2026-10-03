/**
 * Run on the *player's* client, after the GM's `preparePlayer`: player view, limited info and player
 * undo are on, and there is one entry each for the hero (owned), the bystander (observed) and the
 * hidden goblin.
 */

import { BYSTANDER, HERO, LURKER, MAX_HP, MODULE, SEEN } from "./provision.mjs";
import { Report, api, entries, nthEntry, renderedRow, rowOf, waitFor } from "./harness.mjs";

const entryFor = name => entries().find(m => m.speaker?.alias === name);

export async function all() {
  const report = new Report();
  try {
    ui.sidebar.changeTab("chat", "primary");
    const hero = game.actors.getName(HERO);

    report.check("the player owns the hero", hero?.isOwner === true);
    await waitFor(() => entries().length >= 4, "the entries this player receives");

    const own = entryFor(HERO);
    report.check("the player receives their own character's entry", !!own);
    const ownRow = await renderedRow(own);
    report.check("…and sees its table", !!ownRow.querySelector(".sdl-table"));

    const seen = entryFor(BYSTANDER);
    report.check("the player receives the bystander's entry, through limited info", !!seen);
    const seenRow = await renderedRow(seen, { table: false });
    report.check("…without its table", !seenRow.querySelector(".sdl-table"));
    report.check("…but not hidden: the flavour line shows", !seenRow.classList.contains("sdl-hidden")
      && /damage/i.test(seenRow.textContent), seenRow.textContent.trim());

    // The seen goblin's token shows its name only to owners: limited info must not reveal it.
    const goblin = entryFor(SEEN);
    const goblinRow = await renderedRow(goblin, { table: false });
    const shownName = () => goblinRow.querySelector(".message-sender .title")?.textContent.trim()
      ?? goblinRow.querySelector(".message-sender")?.textContent.trim();
    await waitFor(() => shownName() === "Unknown creature", "the goblin's name to be hidden").catch(() => {});
    report.equal("a creature whose name is secret appears as Unknown creature", shownName(), "Unknown creature");
    report.check("…with no portrait of it", goblinRow.querySelector(".message-sender .avatar img")?.getAttribute("src")?.includes("mystery-man"),
      goblinRow.querySelector(".message-sender .avatar img")?.getAttribute("src"));
    const html = goblinRow.outerHTML;
    const at = html.indexOf(SEEN);
    report.check("…and nowhere in the rendered entry, attributes included", at < 0, html.slice(Math.max(0, at - 60), at + 40));
    report.check("…and hovering it points at no token", !goblinRow.querySelector("[data-token-uuid], [data-actor-uuid]"));
    const seenName = seenRow.querySelector(".message-sender .title")?.textContent.trim();
    report.equal("a character the player observes keeps its name", seenName, BYSTANDER);

    // The hero was hit by an attack the GM rolled privately: the player sees the table but not who.
    const stabbed = entries().find(m => (m.speaker?.alias === HERO) && api().entryFor(m)?.damage?.source);
    const stabbedRow = await renderedRow(stabbed);
    report.check("an entry from a card the player can't see doesn't name its source",
      !stabbedRow.querySelector(".sdl-source") && !stabbedRow.outerHTML.includes("Shadow Assassin"));
    report.check("…while its damage types still show", !!stabbedRow.querySelector(".sdl-parts"));

    // v14 hands every client every message; a whisper is filtered by `visible` and never rendered.
    const lurker = entryFor(LURKER);
    report.check("the hidden goblin's entry isn't visible to the player",
      !lurker || (!lurker.visible && !rowOf(lurker)), `whisper: ${JSON.stringify(lurker?.whisper)}`);

    // Undo on their own character.
    seenRow.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    let menu = await waitFor(() => document.querySelector("#context-menu"), "the bystander entry's menu");
    let labels = [...menu.querySelectorAll(".context-item")].map(el => el.textContent.trim());
    report.check("no Undo is offered on a character the player doesn't own", !labels.some(l => /Undo|Redo/.test(l)), labels.join(" | "));
    document.querySelector("#context-menu")?.remove();

    report.check("forcing an undo there is refused", (await api().revert(seen)) === false);
    report.equal("…and the bystander's HP is untouched", game.actors.getName(BYSTANDER).system.attributes.hp.value, 24);

    ownRow.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    menu = await waitFor(() => document.querySelector("#context-menu"), "the hero entry's menu");
    labels = [...menu.querySelectorAll(".context-item")].map(el => el.textContent.trim());
    report.check("Undo Damage is offered on the player's own character", labels.includes("Undo Damage"), labels.join(" | "));
    // The entry took 8; the hero has been hit since, so undo gives back exactly those 8.
    const beforeUndo = hero.system.attributes.hp.value;
    [...menu.querySelectorAll(".context-item")].find(el => el.textContent.trim() === "Undo Damage")?.click();
    await waitFor(() => hero.system.attributes.hp.value === Math.min(beforeUndo + 8, MAX_HP), "the player's undo to restore HP");
    report.check("the player's undo gives back the entry's 8 HP", true);
    // The GM authored the entry, so the GM's client marks it.
    await waitFor(() => game.messages.get(own.id).getFlag(MODULE, "reverted") === true, "the GM's client to mark the entry");
    report.check("…and the GM's client marks it undone", !!rowOf(own));

    // An edit by the player is logged by the player's client.
    const before = entries().length;
    await hero.update({ "system.attributes.hp.value": hero.system.attributes.hp.value - 2 });
    const mine = await nthEntry(before + 1, "the player's own entry");
    report.check("a player's own HP edit is logged, authored by them", mine.author?.id === game.user.id);
    report.check("…and renders with its table for them", !!(await renderedRow(mine)).querySelector(".sdl-table"));
  } catch ( err ) {
    report.fail("player suite threw", err);
  }
  return { playerSuite: report.summary };
}
