import { describe, expect, it } from "vitest";
import { revertUpdate } from "../scripts/data/revert.mjs";

const KEY = k => `system.attributes.hp.${k}`;

describe("revertUpdate", () => {
  it("undoes damage relative to current HP", () => {
    // Took 8 (30 → 22), then took 2 more since: undo gives back 8 and keeps the later 2.
    const update = revertUpdate({
      hp: { value: 20, temp: 0, tempmax: 0, max: 30 },
      changes: [{ id: "hp", old: 30, new: 22, diff: -8 }],
      direction: "undo"
    });
    expect(update).toEqual({ [KEY("value")]: 28 });
  });

  it("redoes damage", () => {
    const update = revertUpdate({
      hp: { value: 30, temp: 0, tempmax: 0, max: 30 },
      changes: [{ id: "hp", diff: -8 }],
      direction: "redo"
    });
    expect(update).toEqual({ [KEY("value")]: 22 });
  });

  it("restores temp HP too", () => {
    const update = revertUpdate({
      hp: { value: 26, temp: 0, tempmax: 0, max: 30 },
      changes: [{ id: "hp", diff: -4 }, { id: "temp", diff: -5 }],
      direction: "undo"
    });
    expect(update).toEqual({ [KEY("value")]: 30, [KEY("temp")]: 5 });
  });

  it("clamps HP to max and to 0", () => {
    const hp = { value: 28, temp: 0, tempmax: 0, max: 30 };
    expect(revertUpdate({ hp, changes: [{ id: "hp", diff: -8 }], direction: "undo" })).toEqual({ [KEY("value")]: 30 });
    expect(revertUpdate({ hp: { ...hp, value: 3 }, changes: [{ id: "hp", diff: -8 }], direction: "redo" }))
      .toEqual({ [KEY("value")]: 0 });
  });

  it("doesn't clamp when clamping is off", () => {
    const hp = { value: 28, temp: 0, tempmax: 0, max: 30 };
    expect(revertUpdate({ hp, changes: [{ id: "hp", diff: -8 }], direction: "undo", clampMax: false }))
      .toEqual({ [KEY("value")]: 36 });
    expect(revertUpdate({ hp: { ...hp, value: 3 }, changes: [{ id: "hp", diff: -8 }], direction: "redo", clampMin: false }))
      .toEqual({ [KEY("value")]: -5 });
  });

  it("counts temp max in the HP clamp (the original read the wrong field)", () => {
    const update = revertUpdate({
      hp: { value: 30, temp: 0, tempmax: 5, max: 30 },
      changes: [{ id: "hp", diff: -10 }],
      direction: "undo"
    });
    expect(update).toEqual({ [KEY("value")]: 35 });
  });

  it("applies temp max before clamping HP to it", () => {
    // Life Drain took 6 HP and 6 max HP (30/30 → 24/24). Undo must give back both, not clamp HP to 24.
    const update = revertUpdate({
      hp: { value: 24, temp: 0, tempmax: -6, max: 30 },
      changes: [{ id: "hp", diff: -6 }, { id: "tempmax", diff: -6 }],
      direction: "undo"
    });
    expect(update).toEqual({ [KEY("tempmax")]: 0, [KEY("value")]: 30 });
  });
});
