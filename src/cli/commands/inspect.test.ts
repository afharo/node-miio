import { actionUsage, groupActions } from "./inspect";

describe("inspect", () => {
  test("groups the actions by their first matching group, the rest under Other actions", () => {
    const groups = groupActions({
      power: {
        name: "power",
        arguments: [],
        tags: ["cap:power", "cap:switchable-power"],
      },
      setPower: {
        name: "setPower",
        arguments: [],
        tags: ["cap:switchable-power"],
      },
      find: { name: "find", arguments: [], tags: ["type:miio:vacuum"] },
      miioCall: { name: "miioCall", arguments: [], tags: ["type:miio"] },
      setDefault: {
        name: "setDefault",
        arguments: [],
        tags: ["type:miio:yeelight"],
      },
    });

    expect(
      groups.map((g) => [g.name, g.tags, g.actions.map((a) => a.name)]),
    ).toEqual([
      ["Power", ["cap:power", "cap:switchable-power"], ["power", "setPower"]],
      ["Vacuum", ["type:miio:vacuum"], ["find"]],
      ["miIO", ["type:miio"], ["miioCall"]],
      ["Other actions", [], ["setDefault"]],
    ]);
  });

  test("no actions, no groups", () => {
    expect(groupActions({})).toEqual([]);
  });

  test("shows the usage, with the optional arguments in brackets", () => {
    expect(
      actionUsage({
        name: "setBrightness",
        arguments: [
          { type: "percentage" },
          { type: "duration", optional: true },
          { type: "boolean", optional: true },
        ],
        tags: [],
      }),
    ).toBe("setBrightness percentage [duration] [boolean]");
  });
});
