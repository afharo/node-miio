import { CLEANING_STATES, isCleaningState } from "./vacuum_states";

describe("isCleaningState", () => {
  test.each(CLEANING_STATES)("%s is cleaning", (state) => {
    expect(isCleaningState(state)).toBe(true);
  });

  test.each(["paused", "returning", "charging", "idle", "error", undefined, 1])(
    "%p is not cleaning",
    (state) => {
      expect(isCleaningState(state)).toBe(false);
    },
  );
});
