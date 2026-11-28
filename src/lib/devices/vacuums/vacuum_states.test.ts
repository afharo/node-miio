import { describe, test, expect, vi } from "vitest";

import { createFakeHandle } from "../../test_utils.test.mock.js";

import { DreameVacuum } from "./dreamevacuum.js";
import { Vacuum } from "./vacuum.js";
import {
  CLEANING_STATES,
  isCleaningState,
  isKnownVacuumState,
  VACUUM_STATES,
  vacuumActivity,
} from "./vacuum_states.js";
import { ViomiVacuum } from "./viomivacuum.js";

vi.mock("debug", () => ({ default: vi.fn(() => vi.fn()) }));

describe("isCleaningState", () => {
  test.each(CLEANING_STATES)("%s is cleaning", (state) => {
    expect(isCleaningState(state)).toBe(true);
    expect(vacuumActivity(state)).toBe("running");
  });

  test.each(["paused", "returning", "charging", "idle", "error", undefined, 1])(
    "%p is not cleaning",
    (state) => {
      expect(isCleaningState(state)).toBe(false);
    },
  );
});

describe("vacuumActivity", () => {
  test.each([
    ["idle", "stopped"],
    ["updating", "stopped"],
    ["cleaning", "running"],
    ["mapping", "updating-maps"],
    ["paused", "paused"],
    ["returning-to-wash-mop", "returning"],
    ["charging", "charging"],
    ["fully-charged", "docked"],
    ["charging-error", "error"],
    ["dust-collection", "emptying-dust-bin"],
    ["washing-mop", "cleaning-mop"],
    ["station-working", "cleaning-mop"],
    ["filling-water-tank", "filling-water-tank"],
  ])("%p → %p", (state, activity) => {
    expect(vacuumActivity(state)).toBe(activity);
  });

  test.each(["unknown-7", "sweeping", "constructor", "toString", undefined, 3])(
    "%p is unknown",
    (state) => {
      expect(isKnownVacuumState(state)).toBe(false);
      expect(vacuumActivity(state)).toBeUndefined();
    },
  );
});

describe("every vacuum class reports a known state", () => {
  // Every code up to 200: the classes must translate it to one of VACUUM_STATES, or report `unknown-<code>`
  const codes = Array.from({ length: 201 }, (_, code) => code);
  test.each([
    [
      "Vacuum",
      () => new Vacuum(createFakeHandle("roborock.vacuum.s5", {}).handle),
    ],
    [
      "ViomiVacuum",
      () => new ViomiVacuum(createFakeHandle("viomi.vacuum.v8", {}).handle),
    ],
    [
      "DreameVacuum",
      () =>
        new DreameVacuum(createFakeHandle("dreame.vacuum.p2008", {}).handle),
    ],
  ])("%s", (_name, create) => {
    const vacuum = create();
    const raw =
      vacuum instanceof ViomiVacuum
        ? "run_state"
        : vacuum instanceof DreameVacuum
          ? "device_status"
          : "state";
    const states = codes.map((code) => {
      vacuum.setRawProperty(raw, code);
      return [code, vacuum.property("state")];
    });
    const translated = states.filter(
      ([code, state]) => state !== `unknown-${code}`,
    );
    expect(
      translated.filter(([, state]) => !isKnownVacuumState(state)),
    ).toEqual([]);
    expect(translated.length).toBeGreaterThan(5);
  });

  test.each([
    [
      "Vacuum",
      () => new Vacuum(createFakeHandle("roborock.vacuum.s5", {}).handle),
      "state",
      8,
      "charging",
    ],
    [
      "ViomiVacuum",
      () => new ViomiVacuum(createFakeHandle("viomi.vacuum.v8", {}).handle),
      "run_state",
      3,
      "cleaning",
    ],
    [
      "DreameVacuum",
      () =>
        new DreameVacuum(createFakeHandle("dreame.vacuum.p2008", {}).handle),
      "device_status",
      7,
      "mopping",
    ],
  ])(
    "%s exposes the state in state() and the stateChanged events",
    async (_name, create, raw, code, expected) => {
      const vacuum = create();
      const events: unknown[] = [];
      vacuum.on("stateChanged", (change: { key: string; value: unknown }) => {
        if (change.key === "state") events.push(change.value);
      });
      vacuum.setRawProperty(raw, code);
      await new Promise(setImmediate);
      expect((await vacuum.state()).state).toBe(expected);
      expect(events).toStrictEqual([expected]);
    },
  );

  test("every state has an activity", () => {
    for (const activity of Object.values(VACUUM_STATES)) {
      expect(typeof activity).toBe("string");
    }
  });
});
