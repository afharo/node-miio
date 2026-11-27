import { describe, test, expect, beforeEach, afterEach } from "vitest";

import { RoborockApiError } from "./errors";
import { fakeRobot, LOCAL_KEY } from "./fake_robot.test.mock";
import { RoborockLocalConnection } from "./local_connection";

describe("RoborockLocalConnection", () => {
  let robot: Awaited<ReturnType<typeof fakeRobot>>;
  let connection: RoborockLocalConnection;

  beforeEach(async () => {
    robot = await fakeRobot({
      get_status: [{ state: 8, battery: 100 }],
      app_start: (params) => ({ result: ["ok"], echo: params }),
      app_charge: () => ({
        error: { code: -10007, message: "invalid status" },
      }),
    });
    connection = new RoborockLocalConnection({
      address: "127.0.0.1",
      port: robot.port,
      localKey: LOCAL_KEY,
      timeoutMs: 300,
    });
  });

  afterEach(async () => {
    connection.close();
    await robot.close();
  });

  test("says hello, then calls methods", async () => {
    await connection.connect();
    expect(connection.connected).toBe(true);
    await expect(connection.call("get_status")).resolves.toStrictEqual([
      { state: 8, battery: 100 },
    ]);
    await expect(connection.call("app_start", [1])).resolves.toStrictEqual([
      "ok",
    ]);
    expect(robot.calls).toStrictEqual([
      { method: "get_status", params: [] },
      { method: "app_start", params: [1] },
    ]);
  });

  test("connects on the first call, and concurrent calls share the connection", async () => {
    const results = await Promise.all([
      connection.call("get_status"),
      connection.call("get_status"),
    ]);
    expect(results).toHaveLength(2);
  });

  test("errors and unknown methods", async () => {
    const error = (await connection
      .call("app_charge")
      .catch((e) => e)) as RoborockApiError;
    expect(error).toBeInstanceOf(RoborockApiError);
    expect(error.message).toBe("app_charge failed: invalid status");
    expect(error.code).toBe(-10007);
    await expect(connection.call("nope")).rejects.toThrow(
      "nope is not supported by this robot",
    );
  });

  test("a robot that doesn't answer the hello", async () => {
    robot.options.answerHello = false;
    await expect(connection.connect()).rejects.toThrow(
      "didn't answer the hello",
    );
    expect(connection.connected).toBe(false);
  });

  test("a call without response times out", async () => {
    robot.options.silent = true;
    await expect(connection.call("get_status")).rejects.toThrow(
      "No response after 300 ms",
    );
  });

  test("nothing listening", async () => {
    await robot.close();
    await expect(connection.connect()).rejects.toThrow(
      "Couldn't connect to 127.0.0.1",
    );
  });
});

describe("RoborockLocalConnection: local protocol versions", () => {
  test("falls back to L01 (e.g. Saros 20) and remembers it on reconnection", async () => {
    const robot = await fakeRobot({ get_status: [{ state: 8 }] });
    robot.options.versions = ["L01"];
    const connection = new RoborockLocalConnection({
      address: "127.0.0.1",
      port: robot.port,
      localKey: LOCAL_KEY,
      timeoutMs: 200,
    });
    try {
      await expect(connection.call("get_status")).resolves.toStrictEqual([
        { state: 8 },
      ]);
      expect(connection.protocolVersion).toBe("L01");
      expect(robot.helloVersions).toStrictEqual(["1.0", "L01"]);

      robot.drop();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(connection.connected).toBe(false);
      await connection.call("get_status");
      // L01 first this time
      expect(robot.helloVersions).toStrictEqual(["1.0", "L01", "L01"]);
    } finally {
      connection.close();
      await robot.close();
    }
  });

  test("tries L01 first when asked to", async () => {
    const robot = await fakeRobot({ get_status: [] });
    const connection = new RoborockLocalConnection({
      address: "127.0.0.1",
      port: robot.port,
      localKey: LOCAL_KEY,
      protocolVersion: "L01",
    });
    try {
      await connection.connect();
      expect(robot.helloVersions).toStrictEqual(["L01"]);
    } finally {
      connection.close();
      await robot.close();
    }
  });

  test("many calls in a row: the seq keeps increasing (robots drop replays)", async () => {
    const robot = await fakeRobot({ get_status: [] });
    robot.options.versions = ["L01"];
    const connection = new RoborockLocalConnection({
      address: "127.0.0.1",
      port: robot.port,
      localKey: LOCAL_KEY,
      timeoutMs: 200,
    });
    try {
      for (let i = 0; i < 30; i++) await connection.call("get_status");
      expect(robot.calls).toHaveLength(30);
    } finally {
      connection.close();
      await robot.close();
    }
  });

  test("a robot that answers no hello", async () => {
    const robot = await fakeRobot({});
    robot.options.versions = [];
    const connection = new RoborockLocalConnection({
      address: "127.0.0.1",
      port: robot.port,
      localKey: LOCAL_KEY,
      timeoutMs: 100,
    });
    try {
      await expect(connection.connect()).rejects.toThrow(
        "didn't answer the hello (local protocols 1.0 and L01)",
      );
    } finally {
      await robot.close();
    }
  });
});
