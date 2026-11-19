import { createFakeHandle } from "../../test_utils.test.mock";

import { Vacuum } from "./vacuum";
import { clearErrorOnRecovery } from "./vacuum_errors";

jest.mock("debug", () => jest.fn().mockReturnValue(jest.fn()));

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function createVacuum() {
  const vacuum = new Vacuum(createFakeHandle("roborock.vacuum.s5", {}).handle);
  const errors: unknown[] = [];
  vacuum.on("errorChanged", (error: unknown) => errors.push(error));
  return { vacuum, errors };
}

/**
 * Lets abstract-things emit its (asynchronous) events.
 */
const flush = () => jest.advanceTimersByTimeAsync(100);

describe("Vacuum errors", () => {
  test("are cleared when the robot leaves the error state", async () => {
    const { vacuum, errors } = createVacuum();
    vacuum.setRawProperty("error_code", 10);
    vacuum.setRawProperty("state", 12); // error
    await flush();
    vacuum.setRawProperty("state", 8); // charging (the error_code may stay)
    await flush();

    expect(errors).toEqual([{ id: 10, description: "Filter blocked" }, null]);
    await expect(vacuum.state()).resolves.toMatchObject({ error: null });
  });

  test("are cleared for charging errors too", async () => {
    const { vacuum, errors } = createVacuum();
    vacuum.setRawProperty("state", 9); // charging-error
    await flush();
    vacuum.setRawProperty("state", 8); // charging
    await flush();

    expect(errors).toEqual([
      { id: "charging-error", description: "Error during charging" },
      null,
    ]);
  });

  test("are not cleared while the robot is still in an error state", async () => {
    const { vacuum, errors } = createVacuum();
    vacuum.setRawProperty("error_code", 10);
    vacuum.setRawProperty("state", 12); // error
    await flush();
    vacuum.setRawProperty("state", 9); // charging-error
    await flush();

    expect(errors).not.toContain(null);
  });

  test("clearing doesn't change the cleaning state (e.g. paused after an error)", async () => {
    const { vacuum } = createVacuum();
    vacuum.setRawProperty("state", 5); // cleaning
    vacuum.setRawProperty("error_code", 10);
    vacuum.setRawProperty("state", 12); // error: stops the cleaning
    vacuum.setRawProperty("state", 5); // cleaning again
    vacuum.setRawProperty("state", 10); // paused
    await flush();

    await expect(vacuum.cleaning()).resolves.toBe(true);
    await expect(vacuum.state()).resolves.toMatchObject({ error: null });
  });

  test("nothing is emitted when there's no error to clear", async () => {
    const { vacuum, errors } = createVacuum();
    vacuum.setRawProperty("state", 5); // cleaning
    vacuum.setRawProperty("state", 8); // charging
    await flush();

    expect(errors).toEqual([]);
  });
});

describe("clearErrorOnRecovery", () => {
  test.each(["error", "charging-error", "charger-offline"])(
    "does nothing in the %p state",
    (state) => {
      const vacuum = { updateState: jest.fn(), emitEvent: jest.fn() };
      clearErrorOnRecovery(vacuum, state);
      expect(vacuum.updateState).not.toHaveBeenCalled();
    },
  );

  test("emits errorChanged (null) and errorCleared when the error changes", () => {
    const vacuum = {
      updateState: jest.fn().mockReturnValue(true),
      emitEvent: jest.fn(),
    };
    clearErrorOnRecovery(vacuum, "charging");
    expect(vacuum.updateState).toHaveBeenCalledWith("error", null);
    expect(vacuum.emitEvent.mock.calls).toEqual([
      ["errorChanged", null],
      ["errorCleared"],
    ]);
  });
});
