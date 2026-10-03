import { beforeEach, describe, expect, it } from "vitest";
import { consume, onCalculateDamage, onPreApplyDamage } from "../scripts/capture.mjs";
import { hasTypedParts, summariseDamage } from "../scripts/data/damage-parts.mjs";
import { buildEntry, flavorText, readEntry } from "../scripts/data/entry.mjs";
import { MODULE_ID } from "../scripts/config.mjs";

describe("summariseDamage", () => {
  it("reads values, multipliers and active modifiers", () => {
    const summary = summariseDamage([
      { type: "slashing", value: 8, active: { multiplier: 1 } },
      { type: "fire", value: 4, active: { multiplier: 0.5, type: { resistance: true } } },
      { type: "poison", value: 0, active: { multiplier: 0, type: { immunity: true } } },
      { type: "healing", value: -5, active: { multiplier: -1, all: { modification: true } } }
    ]);
    expect(summary.parts).toEqual([
      { type: "slashing", value: 8, multiplier: 1, mods: [] },
      { type: "fire", value: 4, multiplier: 0.5, mods: ["resistance"] },
      { type: "poison", value: 0, multiplier: 0, mods: ["immunity"] },
      { type: "healing", value: 5, multiplier: -1, mods: ["modification"] }
    ]);
    expect(summary.threshold).toBe(false);
  });

  it("notes a damage threshold", () => {
    const summary = summariseDamage([{ type: "fire", value: 0, active: { multiplier: 0, threshold: true } }]);
    expect(summary.threshold).toBe(true);
    expect(summary.parts[0].mods).toEqual(["threshold"]);
  });

  it("knows untyped damage from a token bar edit", () => {
    expect(hasTypedParts(summariseDamage([{ value: 5, active: {} }]))).toBe(false);
  });
});

describe("flavorText", () => {
  const t = (key, data) => (data ? `${key}${JSON.stringify(data)}` : key);
  const typeLabel = type => type.toUpperCase();
  const entry = (changes, damage) => buildEntry({ actorUuid: "Actor.a", changes, damage });

  it("states the total", () => {
    expect(flavorText(entry([{ id: "hp", old: 30, new: 22, diff: -8 }]), { showTypes: true, t, typeLabel }))
      .toBe('flavor.damage{"amount":8}');
  });

  it("lists typed parts when asked", () => {
    const e = entry([{ id: "hp", diff: -12 }], {
      parts: [{ type: "slashing", value: 8, mods: [] }, { type: "fire", value: 4, mods: [] }, { type: "cold", value: 0, mods: [] }]
    });
    expect(flavorText(e, { showTypes: true, t, typeLabel }))
      .toBe('flavor.withTypes{"text":"flavor.damage{\\"amount\\":12}","types":"8 SLASHING, 4 FIRE"}');
    expect(flavorText(e, { showTypes: false, t, typeLabel })).toBe('flavor.damage{"amount":12}');
  });

  it("doesn't repeat healing's type", () => {
    const e = entry([{ id: "hp", diff: 4 }], { parts: [{ type: "healing", value: 4, mods: [] }] });
    expect(flavorText(e, { showTypes: true, t, typeLabel })).toBe('flavor.healing{"amount":4}');
  });

  it("has its own wording for max HP changes", () => {
    expect(flavorText(entry([{ id: "tempmax", diff: 5 }]), { showTypes: true, t, typeLabel }))
      .toBe('flavor.tempmax.healing{"amount":5}');
  });
});

describe("readEntry", () => {
  it("finds this module's flags, and nothing else", () => {
    const e = buildEntry({ actorUuid: "Actor.a", changes: [{ id: "hp", diff: -1 }] });
    expect(readEntry({ flags: { [MODULE_ID]: e } })).toBe(e);
    expect(readEntry({ flags: { other: {} } })).toBe(null);
    expect(readEntry(null)).toBe(null);
  });
});

describe("capture", () => {
  const actor = { uuid: "Actor.capture" };
  let options;

  beforeEach(() => {
    options = { originatingMessage: { id: "msg1", speaker: { alias: "Goblin Boss" }, getAssociatedItem: () => ({ name: "Scimitar" }) } };
  });

  it("passes the calculation and its source to the matching update", () => {
    onCalculateDamage(actor, [{ type: "slashing", value: 6, active: { multiplier: 1 } }], options);
    onPreApplyDamage(actor, 6, { "system.attributes.hp.value": 24, "system.attributes.hp.temp": 0 }, options);
    expect(consume(actor, { value: 24, temp: 0 })).toEqual({
      parts: [{ type: "slashing", value: 6, multiplier: 1, mods: [] }],
      threshold: false,
      source: { messageId: "msg1", alias: "Goblin Boss", item: "Scimitar" }
    });
  });

  it("is taken once", () => {
    onCalculateDamage(actor, [{ type: "fire", value: 3, active: {} }], options);
    onPreApplyDamage(actor, 3, { "system.attributes.hp.value": 27 }, options);
    expect(consume(actor, { value: 27 })).not.toBe(null);
    expect(consume(actor, { value: 27 })).toBe(null);
  });

  it("is refused by an update with different HP values", () => {
    onCalculateDamage(actor, [{ type: "fire", value: 3, active: {} }], options);
    onPreApplyDamage(actor, 3, { "system.attributes.hp.value": 27 }, options);
    expect(consume(actor, { value: 10 })).toBe(null);
  });

  it("ignores a calculation that was only a preview", () => {
    onCalculateDamage(actor, [{ type: "fire", value: 3, active: {} }], options);
    expect(consume(actor, { value: 27 })).toBe(null);
  });
});
