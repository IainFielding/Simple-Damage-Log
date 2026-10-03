import { describe, expect, it } from "vitest";
import { DEFAULTS, OWNERSHIP, SETTINGS } from "../scripts/config.mjs";
import {
  canRevert, canViewTable, hideNameFrom, isHiddenFrom, isTrustedAuthor, nameIsSecret, whisperFor
} from "../scripts/data/visibility.mjs";

const gm = { id: "gm", isGM: true };
const owner = { id: "owner", isGM: false };
const observer = { id: "observer", isGM: false };
const stranger = { id: "stranger", isGM: false };
const users = [gm, owner, observer, stranger];

const LEVELS = { gm: OWNERSHIP.OWNER, owner: OWNERSHIP.OWNER, observer: OWNERSHIP.OBSERVER, stranger: OWNERSHIP.NONE };
const hasPermission = (user, level) => LEVELS[user.id] >= level;

/** Players locked out and secret names kept, whatever the shipped defaults; each case turns on what it needs. */
const BASE = {
  ...DEFAULTS,
  [SETTINGS.allowPlayerView]: false,
  [SETTINGS.showLimitedInfo]: false,
  [SETTINGS.hideUnknownNames]: true
};
const settings = (overrides = {}) => ({ ...BASE, ...overrides });
const whisper = (s, kind = "damage", hiddenToken = false) =>
  whisperFor({ kind, hiddenToken, users, settings: s, hasPermission });

describe("whisperFor", () => {
  it("is GM-only when players can't view the log", () => {
    expect(whisper(settings())).toEqual(["gm"]);
  });

  it("adds players with the minimum permission", () => {
    const s = settings({ [SETTINGS.allowPlayerView]: true });
    expect(whisper(s)).toEqual(["gm", "owner"]);
    expect(whisper({ ...s, [SETTINGS.minPlayerPermission]: OWNERSHIP.OBSERVER })).toEqual(["gm", "owner", "observer"]);
  });

  it("is public in limited-info mode", () => {
    const s = settings({ [SETTINGS.allowPlayerView]: true, [SETTINGS.showLimitedInfo]: true });
    expect(whisper(s)).toEqual([]);
  });

  it("keeps healing out of limited info when asked", () => {
    const s = settings({
      [SETTINGS.allowPlayerView]: true, [SETTINGS.showLimitedInfo]: true, [SETTINGS.hideHealingInLimitedInfo]: true
    });
    expect(whisper(s, "healing")).toEqual(["gm", "owner"]);
    expect(whisper(s, "damage")).toEqual([]);
  });

  it("ignores limited info when player view is off", () => {
    expect(whisper(settings({ [SETTINGS.showLimitedInfo]: true }))).toEqual(["gm"]);
  });

  it("sends a hidden token's entries to GMs only, whatever else is on", () => {
    const s = settings({ [SETTINGS.allowPlayerView]: true, [SETTINGS.showLimitedInfo]: true });
    expect(whisper(s, "damage", true)).toEqual(["gm"]);
  });

  it("treats hidden tokens like any other when that setting is off", () => {
    const s = settings({
      [SETTINGS.allowPlayerView]: true, [SETTINGS.showLimitedInfo]: true, [SETTINGS.gmOnlyHiddenTokens]: false
    });
    expect(whisper(s, "damage", true)).toEqual([]);
  });
});

describe("canViewTable / isHiddenFrom", () => {
  const view = (user, s, entry = { kind: "damage" }) => {
    const canTable = canViewTable({ user, entry, settings: s, hasPermission });
    return { canTable, hidden: isHiddenFrom({ canTable, entry, settings: s }) };
  };

  it("always shows GMs the table", () => {
    expect(view(gm, settings())).toEqual({ canTable: true, hidden: false });
  });

  it("shows permitted players the table", () => {
    const s = settings({ [SETTINGS.allowPlayerView]: true });
    expect(view(owner, s)).toEqual({ canTable: true, hidden: false });
    expect(view(observer, s).canTable).toBe(false);
  });

  it("gives limited viewers the flavour only", () => {
    const s = settings({ [SETTINGS.allowPlayerView]: true, [SETTINGS.showLimitedInfo]: true });
    expect(view(stranger, s)).toEqual({ canTable: false, hidden: false });
  });

  it("hides an entry from its own author when they may not see it", () => {
    expect(view(owner, settings())).toEqual({ canTable: false, hidden: true });
  });

  it("follows a GM's Reveal", () => {
    expect(view(stranger, settings(), { kind: "damage", public: true })).toEqual({ canTable: true, hidden: false });
  });

  it("hides limited healing when asked", () => {
    const s = settings({
      [SETTINGS.allowPlayerView]: true, [SETTINGS.showLimitedInfo]: true, [SETTINGS.hideHealingInLimitedInfo]: true
    });
    expect(view(stranger, s, { kind: "healing" }).hidden).toBe(true);
    expect(view(stranger, s, { kind: "damage" }).hidden).toBe(false);
  });
});

describe("canRevert", () => {
  const revert = (user, s, author = gm) => canRevert({ user, author, settings: s, hasPermission });

  it("lets GMs always revert", () => {
    expect(revert(gm, settings())).toBe(true);
  });

  it("lets owners revert only with player view and player undo on", () => {
    expect(revert(owner, settings({ [SETTINGS.allowPlayerUndo]: true }))).toBe(false);
    const s = settings({ [SETTINGS.allowPlayerView]: true, [SETTINGS.allowPlayerUndo]: true });
    expect(revert(owner, s)).toBe(true);
    expect(revert(observer, s)).toBe(false);
  });
});

describe("forged entries", () => {
  it("trusts an entry from a GM or the actor's owner", () => {
    expect(isTrustedAuthor(gm, hasPermission)).toBe(true);
    expect(isTrustedAuthor(owner, hasPermission)).toBe(true);
  });

  it("doesn't trust one from a player who couldn't have changed the actor", () => {
    expect(isTrustedAuthor(observer, hasPermission)).toBe(false);
    expect(isTrustedAuthor(null, hasPermission)).toBe(false);
  });

  it("won't let even a GM undo a forged entry", () => {
    expect(canRevert({ user: gm, author: observer, settings: settings(), hasPermission })).toBe(false);
  });
});

describe("secret names", () => {
  it("keeps a monster's name secret when its token shows it only to owners or never", () => {
    expect(nameIsSecret({ hasPlayerOwner: false, displayName: 0 })).toBe(true);   // NONE
    expect(nameIsSecret({ hasPlayerOwner: false, displayName: 40 })).toBe(true);  // OWNER
    expect(nameIsSecret({ hasPlayerOwner: false, displayName: 30 })).toBe(false); // HOVER
    expect(nameIsSecret({ hasPlayerOwner: false, displayName: 50 })).toBe(false); // ALWAYS
  });

  it("never hides a player character's name", () => {
    expect(nameIsSecret({ hasPlayerOwner: true, displayName: 0 })).toBe(false);
  });

  const hide = (user, overrides = {}) => hideNameFrom({
    user, entry: { anonymous: true }, canTable: false, settings: settings(), hasPermission, ...overrides
  });

  it("hides it from a player with no permission on the actor", () => {
    expect(hide(stranger)).toBe(true);
  });

  it("but not from GMs, anyone with Limited or better, or anyone who sees the table", () => {
    expect(hide(gm)).toBe(false);
    expect(hide(observer)).toBe(false);
    expect(hide(stranger, { canTable: true })).toBe(false);
  });

  it("nor when the setting is off, or the name wasn't secret", () => {
    expect(hide(stranger, { settings: settings({ [SETTINGS.hideUnknownNames]: false }) })).toBe(false);
    expect(hide(stranger, { entry: {} })).toBe(false);
  });
});
