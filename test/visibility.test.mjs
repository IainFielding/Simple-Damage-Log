import { describe, expect, it } from "vitest";
import { DEFAULTS, OWNERSHIP, SETTINGS } from "../scripts/config.mjs";
import { canRevert, canViewTable, isHiddenFrom, isTrustedAuthor, whisperFor } from "../scripts/data/visibility.mjs";

const gm = { id: "gm", isGM: true };
const owner = { id: "owner", isGM: false };
const observer = { id: "observer", isGM: false };
const stranger = { id: "stranger", isGM: false };
const users = [gm, owner, observer, stranger];

const LEVELS = { gm: OWNERSHIP.OWNER, owner: OWNERSHIP.OWNER, observer: OWNERSHIP.OBSERVER, stranger: OWNERSHIP.NONE };
const hasPermission = (user, level) => LEVELS[user.id] >= level;

const settings = (overrides = {}) => ({ ...DEFAULTS, ...overrides });
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
