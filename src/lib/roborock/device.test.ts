import { Vacuum } from "../devices/vacuums/vacuum";

import { roborockDevice } from "./device";
import { fakeRobot, LOCAL_KEY } from "./fake_robot.test.mock";
import { roomNames } from "./rooms";

describe("roborockDevice", () => {
  test("is a Vacuum working over the local connection", async () => {
    const robot = await fakeRobot({
      get_status: [
        {
          state: 8,
          battery: 87,
          fan_power: 102,
          error_code: 0,
          in_cleaning: 0,
        },
      ],
      get_consumable: [{ main_brush_work_time: 3600 }],
      get_room_mapping: [
        [16, "11100845", 14],
        [17, "11100849", 9],
      ],
    });
    const device = await roborockDevice({
      duid: "duid-1",
      localKey: LOCAL_KEY,
      model: "roborock.vacuum.a296",
      address: "127.0.0.1",
      port: robot.port,
      timeoutMs: 500,
    });
    try {
      expect(device).toBeInstanceOf(Vacuum);
      const vacuum = device as unknown as Vacuum;
      expect(vacuum.id).toBe("miio:duid-1");
      expect(vacuum.miioModel).toBe("roborock.vacuum.a296");
      expect(await vacuum.batteryLevel()).toBe(87);
      expect(vacuum.property("state")).toBe("charging");
      expect(
        roomNames(await vacuum.getRoomMap(), [
          { id: 11100845, name: "Kitchen" },
          { id: 11100849, name: "Living room" },
        ]),
      ).toStrictEqual([
        { segmentId: 16, roomId: "11100845", name: "Kitchen" },
        { segmentId: 17, roomId: "11100849", name: "Living room" },
      ]);
    } finally {
      device.destroy();
      await robot.close();
    }
    expect((device as unknown as Vacuum).connected).toBe(false);
  });

  test("fails when the robot can't be reached", async () => {
    const robot = await fakeRobot({});
    await robot.close();
    await expect(
      roborockDevice({
        duid: "d",
        localKey: LOCAL_KEY,
        model: "roborock.vacuum.a296",
        address: "127.0.0.1",
        port: robot.port,
      }),
    ).rejects.toThrow("Couldn't connect to 127.0.0.1");
  });
});

describe("roomNames", () => {
  test("names the segments, unknown rooms keep no name", () => {
    expect(
      roomNames(
        [
          [1, "5"],
          [2, 6],
        ],
        [{ id: 5, name: "Hall" }],
      ),
    ).toStrictEqual([
      { segmentId: 1, roomId: "5", name: "Hall" },
      { segmentId: 2, roomId: "6", name: undefined },
    ]);
    expect(roomNames(["unexpected"], [])).toStrictEqual([]);
    expect(roomNames(undefined, [])).toStrictEqual([]);
  });
});
