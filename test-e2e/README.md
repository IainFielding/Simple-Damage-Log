# End-to-end harness

Drives a real Foundry install, with a Gamemaster and a player client, to test the Damage Log on
real dnd5e actors. The rules (diffs, damage or healing, who sees what, undo maths) are unit-tested
(`npm test` at the repo root). This harness covers what those unit tests can't:

- A sheet edit, a token actor's update and dnd5e's `applyDamage` each post one entry, with the
  right rows, and an update that doesn't touch HP posts nothing. So does Apply on a spell's damage
  card, and so does a change made while the same user has a second client connected.
- dnd5e really hands over its damage types: resistance halves fire and the entry says so, and the
  entry links back to the chat card the damage came from. A damage preview's types don't leak into
  the next edit.
- An entry renders in the real chat log with its table, coloured as damage or healing.
- Undo and redo move HP relative to now, clamp to max (counting temp max), and mark the entry.
- The right-click menu offers the right Undo/Redo item, and clicking it works.
- Whisper lists follow the settings. A hidden token's entry is GM-only. Reveal and Reset Visibility
  round-trip.
- Rests, and hit dice spent in them, are logged unless Don't log rests is on. An update another
  module vetoes leaves no entry. Two undos at once apply once.
- Quiet entries never reach core's notify; an ordinary message still does.
- A batched update of two actors gives each its own entry. The settings form greys out dependent
  settings and follows ticks live.
- A forged entry renders as a plain message, can't be undone, and gets no flags or menu items
  from this module even when the GM reveals it; a forged undo marker on another
  actor's update changes nothing. Changing a visibility setting re-renders only the entries on
  screen.
- Nothing the module holds grows with use: after 20 rounds of damage, undo and redo, and hit dice
  that heal nothing, hook listeners, held contexts and the undo guard are back where they started.
- As the player, a creature whose token name is secret shows as "Unknown creature" with no portrait,
  its name nowhere in the HTML. An entry from an attack card the player can't see doesn't name it. An update
  another module adjusts after this one logs the HP it really reached.
- As the player: the owned character's entry shows its table, an observed one shows the flavour
  only, the hidden goblin's isn't visible, Undo works on the player's own character and is refused
  on someone else's.

The harness source is tracked in git but never shipped. `config.mjs` and the run output (`*.log`,
`*.png`) are gitignored.

## Setup

```sh
npm install
cp config.example.mjs config.mjs    # point it at your Foundry install and data folder
npm run link-module                  # junction the repo into Data/modules (idempotent)
node provision.mjs                   # once: the world, the player, the actors and a scene
```

**Close the Foundry desktop app first.** Foundry locks its data folder, and the harness starts its
own server against it on port 30096.

## Running

```sh
npm test                               # every suite
node run.mjs --only=undoSuite,menuSuite
node run.mjs --hold                    # leave the browsers open
HEADED=1 npm test                      # watch it
```

The exit code is 0 only when every assertion passes and no client logged an error. Each run also
writes `showcase-damage-log-e2e.png`, the GM's chat log with a few kinds of entry. Nothing asserts on
that image; it's there for someone to look at.

| World | Modules | Status |
| --- | --- | --- |
| `damage-log-e2e` | the module only | 113 assertions, green (2026-10-03, Foundry 14.368, dnd5e 6.0.5) |

## Layout

| File | Runs in | Does |
| --- | --- | --- |
| `run.mjs`, `provision.mjs`, `lib/` | Node | Starts Foundry, joins with Playwright, prints reports |
| `in-world/provision.mjs` | the page | Fixtures: the player, `[e2e] Hero`, `[e2e] Bystander`, `[e2e] Goblin`, and a scene with a seen and a hidden goblin token |
| `in-world/harness.mjs` | GM page | Log, damage type, undo, menu, visibility, rest, quiet, forgery, API, settings, re-render and leak suites; the player set-up; the showcase |
| `in-world/player.mjs` | player page | What a player receives, sees and may undo |
