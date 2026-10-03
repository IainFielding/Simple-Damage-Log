![](https://img.shields.io/badge/Foundry-v14.368-informational)
![](https://img.shields.io/badge/D&D-v6.0.5-informational)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-sogrom?logo=ko-fi&logoColor=white)](https://ko-fi.com/sogrom)<br>

# Simple Damage Log

Every change to a D&D 5e actor's hit points, posted to the chat log, with undo.

When a creature takes damage or is healed, by a damage card, the token's HP bar, the character sheet
or a macro, a short entry appears in chat. It shows HP before and after, the change, and, when the
damage came through D&D 5e's damage application, the damage types, any resistance or immunity, and
the attack it came from. Right-click the entry to undo it, or redo it.

## Requirements

| | |
| --- | --- |
| Foundry VTT | v14 (verified 14.368) |
| Game system | D&D 5e **6.0.0** or later in the 6.x line |

No libWrapper or other library is needed.

## What it does

- **Logs every HP change.** HP, temp HP and temporary max HP (Aid, Life Drain) each get a row: old,
  change, new. Damage entries have a red edge, healing a green one.
- **Knows what hit you.** Damage applied from a chat card lists its types ("8 slashing, 4 fire"),
  flags resistance, vulnerability, immunity and damage thresholds, and links back to the attack's card.
  A change typed into the sheet or the token bar is logged without types.
- **Undo and redo.** Right-click an entry and choose **Undo Damage** or **Undo Healing**. The HP goes
  back relative to what it is now, so anything since is kept. The entry is struck through; right-click
  again to **Redo**. Clamping keeps HP between 0 and the actor's maximum (both can be switched off).
- **Stays in the chat log.** No extra tab. Entries don't flash the chat tab or play a sound.
- **You choose what players see.**
  - By default only GMs see the log.
  - **Allow players to view** shows players entries for actors they have at least the chosen
    permission on (Owner by default).
  - **Limited damage info** shows every player how much damage every creature took, but not its
    HP. Healing can be left out of this.
  - Damage to a **hidden token** is shown to GMs only, so players don't learn about a monster they
    can't see.
  - **Reveal** and **Conceal** in an entry's menu work as on any message. **Reset Visibility** puts
    the entry back to what the settings say.
- **Players can undo too, if you let them.** **Allow players to undo/redo damage** lets players undo
  changes to actors they own.
- **Rests are logged.** HP recovered on a rest is logged unless you switch on **Don't log rests**.

## Settings

All in **Game Settings → Configure Settings → Simple Damage Log**. Settings that need another one
switched on are greyed out until it is.

| Setting | Default |
| --- | --- |
| Allow players to view the damage log | Off |
| Minimum actor permission | Owner |
| Allow players to undo/redo damage | Off |
| Show limited damage info to players | Off |
| Hide healing in the limited damage info | Off |
| Hidden tokens are GM-only | On |
| Clamp to max HP | On |
| Clamp to min HP | On |
| Quiet entries | On |
| Don't log rests | Off |
| Show damage types | On |
| Debug logging (per user) | Off |

## For module authors

`game.modules.get("sogrom-simple-damage-log").api`:

| | |
| --- | --- |
| `isEntry(message)` | Whether a chat message is a damage log entry |
| `entryFor(message)` | A copy of its entry data, or `null` |
| `revert(messageOrId)` | Undo an entry. `false` if already undone or not allowed |
| `reapply(messageOrId)` | Redo an undone entry |

Hooks, each with one payload object:

| Hook | Payload |
| --- | --- |
| `simpleDamageLog.ready` | `{api, version}` |
| `simpleDamageLog.preCreateEntry` | `{actor, data}`. Return `false` to skip the entry; `data` may be edited |
| `simpleDamageLog.entryCreated` | `{actor, message}` |
| `simpleDamageLog.reverted` | `{message, reverted}` |

Entries are ordinary chat messages carrying `flags["sogrom-simple-damage-log"]`, so chat filters can
pick them out.

## Not with the original Damage Log

This module does what cs96and's [Damage Log](https://codeberg.org/cs96and/FoundryVTT-damage-log)
does, for Foundry v14 and D&D 5e only, without the separate tab. Don't run both; every change would
be logged twice. Entries from one aren't read by the other.

## License

See [LICENSE](LICENSE).
