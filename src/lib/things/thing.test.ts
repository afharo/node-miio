import { MiioThing } from "./thing";

/** Waits for the queued events to be emitted */
const flush = () => new Promise((resolve) => setImmediate(resolve));

class TestThing extends MiioThing {
  static type = "test";
  static capabilities = ["a", "b"];

  constructor(id = "test:1") {
    super();
    this.id = id;
  }
}

describe("MiioThing", () => {
  describe("metadata", () => {
    test("collects the types and capabilities of the class chain", () => {
      class Child extends TestThing {
        static types = ["child", "other"];
      }
      const thing = new Child();
      expect([...thing.metadata.types]).toEqual(["test", "child", "other"]);
      expect([...thing.metadata.capabilities]).toEqual(["a", "b"]);
    });

    test("matches types and capabilities", () => {
      const thing = new TestThing();
      expect(thing.matches("type:test")).toBe(true);
      expect(thing.matches("type:test", "cap:a", "cap:b")).toBe(true);
      expect(thing.matches("type:test", "cap:c")).toBe(false);
      expect(thing.matches("test")).toBe(false);
      expect(thing.matches()).toBe(true);
    });

    test("capabilities can be added and removed at runtime", async () => {
      const thing = new TestThing();
      const listener = jest.fn();
      thing.on("thing:metadata", listener);
      thing.metadata.addCapabilities("c");
      thing.metadata.removeCapabilities("a");
      expect(thing.matches("cap:c")).toBe(true);
      expect(thing.matches("cap:a")).toBe(false);
      await flush();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    test("the name emits thing:metadata when it changes", async () => {
      const thing = new TestThing();
      const listener = jest.fn();
      thing.on("thing:metadata", listener);
      thing.metadata.name = "Robot";
      thing.metadata.name = "Robot";
      await flush();
      expect(thing.metadata.name).toBe("Robot");
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("events", () => {
    test("are emitted asynchronously, with the data and the thing", async () => {
      const thing = new TestThing();
      const listener = jest.fn();
      thing.on("something", listener);
      thing.emitEvent("something", 1);
      expect(listener).not.toHaveBeenCalled();
      await flush();
      expect(listener).toHaveBeenCalledWith(1, thing);
    });

    test("only the last event of each name is emitted per tick", async () => {
      const thing = new TestThing();
      const listener = jest.fn();
      thing.on("something", listener);
      thing.emitEvent("something", 1);
      thing.emitEvent("something", 2);
      await flush();
      expect(listener.mock.calls).toEqual([[2, thing]]);
    });

    test("multiple: true keeps all of them", async () => {
      const thing = new TestThing();
      const listener = jest.fn();
      thing.on("something", listener);
      thing.emitEvent("something", 1, { multiple: true });
      thing.emitEvent("something", 2, { multiple: true });
      await flush();
      expect(listener.mock.calls).toEqual([
        [1, thing],
        [2, thing],
      ]);
    });

    test("multiple as a function replaces the matching queued event", async () => {
      const thing = new TestThing();
      const listener = jest.fn();
      thing.on("something", listener);
      const sameKey = (key: string) => (e: { key: string }) => e.key === key;
      thing.emitEvent(
        "something",
        { key: "a", v: 1 },
        { multiple: sameKey("a") },
      );
      thing.emitEvent(
        "something",
        { key: "b", v: 1 },
        { multiple: sameKey("b") },
      );
      thing.emitEvent(
        "something",
        { key: "a", v: 2 },
        { multiple: sameKey("a") },
      );
      await flush();
      expect(listener.mock.calls.map(([e]) => e)).toEqual([
        { key: "b", v: 1 },
        { key: "a", v: 2 },
      ]);
    });

    test("events emitted by listeners are emitted on the next tick", async () => {
      const thing = new TestThing();
      const second = jest.fn();
      thing.on("first", () => thing.emitEvent("second", 2));
      thing.on("second", second);
      thing.emitEvent("first", 1);
      await flush();
      expect(second).not.toHaveBeenCalled();
      await flush();
      expect(second).toHaveBeenCalledWith(2, thing);
    });

    test("an error event without listeners doesn't throw", async () => {
      const thing = new TestThing();
      const other = jest.fn();
      thing.on("other", other);
      thing.emitEvent("error", new Error("boom"));
      thing.emitEvent("other", 1);
      await flush();
      expect(other).toHaveBeenCalled();
    });

    test("an error event is emitted to its listeners", async () => {
      const thing = new TestThing();
      const listener = jest.fn();
      thing.on("error", listener);
      thing.emitEvent("error", "boom");
      await flush();
      expect(listener).toHaveBeenCalledWith("boom", thing);
    });
  });

  describe("state", () => {
    test("updateState emits stateChanged when the value changes (deeply)", async () => {
      const thing = new TestThing();
      const listener = jest.fn();
      thing.on("stateChanged", listener);
      expect(thing.updateState("a", { x: 1 })).toBe(true);
      expect(thing.updateState("a", { x: 1 })).toBe(false);
      expect(thing.updateState("b", 1)).toBe(true);
      await flush();
      expect(listener.mock.calls).toEqual([
        [{ key: "a", value: { x: 1 } }, thing],
        [{ key: "b", value: 1 }, thing],
      ]);
      expect(await thing.state()).toEqual({ a: { x: 1 }, b: 1 });
    });

    test("only the last stateChanged of each key is emitted per tick", async () => {
      const thing = new TestThing();
      const listener = jest.fn();
      thing.on("stateChanged", listener);
      thing.updateState("a", 1);
      thing.updateState("b", 1);
      thing.updateState("a", 2);
      await flush();
      expect(listener.mock.calls.map(([e]) => e)).toEqual([
        { key: "b", value: 1 },
        { key: "a", value: 2 },
      ]);
    });

    test("getState returns the default when the key isn't set", () => {
      const thing = new TestThing();
      expect(thing.getState("missing")).toBeNull();
      expect(thing.getState("missing", 5)).toBe(5);
      thing.updateState("set", 0);
      expect(thing.getState("set", 5)).toBe(0);
    });

    test("removeState emits stateChanged with null if it was set", async () => {
      const thing = new TestThing();
      thing.updateState("a", 1);
      await flush();
      const listener = jest.fn();
      thing.on("stateChanged", listener);
      thing.removeState("a");
      thing.removeState("missing");
      await flush();
      expect(listener.mock.calls).toEqual([[{ key: "a", value: null }, thing]]);
      expect(await thing.state()).toEqual({});
    });

    test("state() returns a copy", async () => {
      const thing = new TestThing();
      thing.updateState("a", 1);
      const state = await thing.state();
      state.a = 2;
      expect(thing.getState("a")).toBe(1);
    });
  });

  describe("lifecycle", () => {
    test("init runs initCallback, validates the id and emits thing:initialized", async () => {
      const initCallback = jest.fn();
      class Initialized extends TestThing {
        async initCallback() {
          await super.initCallback();
          initCallback();
        }
      }
      const thing = new Initialized();
      const listener = jest.fn();
      thing.on("thing:initialized", listener);
      await expect(thing.init()).resolves.toBe(thing);
      await expect(thing.init()).resolves.toBe(thing);
      await flush();
      expect(initCallback).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    test("the id can't change after init", async () => {
      const thing = await new TestThing().init();
      expect(() => {
        thing.id = "test:2";
      }).toThrow("can not be changed");
    });

    test("init rejects without an id or a namespace", async () => {
      class NoId extends MiioThing {}
      await expect(new NoId().init()).rejects.toThrow(
        "Identifier needs to be set",
      );
      await expect(new TestThing("nonamespace").init()).rejects.toThrow(
        "does not contain a namespace",
      );
      await expect(new TestThing(":1").init()).rejects.toThrow(
        "does not contain a namespace",
      );
    });

    test("destroy runs destroyCallback once and emits thing:destroyed", async () => {
      const destroyCallback = jest.fn();
      class Destroyable extends TestThing {
        async destroyCallback() {
          await super.destroyCallback();
          destroyCallback();
        }
      }
      const thing = new Destroyable();
      await thing.destroy();
      expect(destroyCallback).not.toHaveBeenCalled(); // not initialized

      await thing.init();
      const listener = jest.fn();
      thing.on("thing:destroyed", listener);
      await thing.destroy();
      await thing.destroy();
      await flush();
      expect(destroyCallback).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(undefined, thing);

      // It can be initialized again
      await thing.init();
      await thing.destroy();
      expect(destroyCallback).toHaveBeenCalledTimes(2);
    });
  });
});
