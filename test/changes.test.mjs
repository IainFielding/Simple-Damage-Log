import { describe, expect, it } from "vitest";
import { classify, diffChanges } from "../scripts/data/changes.mjs";

const hp = (value, temp = 0, tempmax = 0) => ({ value, temp, tempmax, max: 30 });

describe("diffChanges", () => {
  it("records only fields the update sets to a new value", () => {
    expect(diffChanges(hp(30, 5), { value: 22, temp: 5 })).toEqual([
      { id: "hp", old: 30, new: 22, diff: -8 }
    ]);
  });

  it("ignores fields the update doesn't mention", () => {
    expect(diffChanges(hp(30, 5), { temp: 0 })).toEqual([{ id: "temp", old: 5, new: 0, diff: -5 }]);
  });

  it("treats dnd5e's null temp and tempmax as 0", () => {
    expect(diffChanges({ value: 10, temp: null, tempmax: null }, { temp: 4, tempmax: null })).toEqual([
      { id: "temp", old: 0, new: 4, diff: 4 }
    ]);
  });

  it("lists rows HP, temp, max regardless of update order", () => {
    const ids = diffChanges(hp(30, 5, 0), { tempmax: 5, temp: 0, value: 20 }).map(c => c.id);
    expect(ids).toEqual(["hp", "temp", "tempmax"]);
  });

  it("returns nothing for a missing or empty update", () => {
    expect(diffChanges(hp(30), undefined)).toEqual([]);
    expect(diffChanges(hp(30), {})).toEqual([]);
    expect(diffChanges(hp(30), { value: 30 })).toEqual([]);
  });
});

describe("classify", () => {
  it("sums HP and temp HP into one damage total", () => {
    expect(classify([{ id: "hp", diff: -8 }, { id: "temp", diff: -4 }])).toEqual({ kind: "damage", total: 12 });
  });

  it("calls a positive total healing", () => {
    expect(classify([{ id: "hp", diff: 7 }])).toEqual({ kind: "healing", total: 7 });
  });

  it("calls gaining temp HP healing", () => {
    expect(classify([{ id: "temp", diff: 5 }])).toEqual({ kind: "healing", total: 5 });
  });

  it("leaves temp max out of the total when HP also moved", () => {
    expect(classify([{ id: "hp", diff: -6 }, { id: "tempmax", diff: -6 }])).toEqual({ kind: "damage", total: 6 });
  });

  it("classifies a temp-max-only change by its sign", () => {
    expect(classify([{ id: "tempmax", diff: 5 }])).toEqual({ kind: "healing", total: 5 });
    expect(classify([{ id: "tempmax", diff: -3 }])).toEqual({ kind: "damage", total: 3 });
  });
});
