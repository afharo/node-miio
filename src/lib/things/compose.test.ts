import { Capability } from "./capability";
import { compose } from "./compose";
import { MiioThing } from "./thing";

const flush = () => new Promise((resolve) => setImmediate(resolve));

class Base extends MiioThing {
  static type = "base";

  constructor() {
    super();
    this.id = "test:1";
  }

  baseMethod() {
    return "base";
  }
}

class Counter extends Capability {
  static capability = "counter";
  static initialState: Record<string, unknown> = { count: 0, list: [] };

  count(): number {
    return this.getState<number>("count");
  }

  increment() {
    this.updateState("count", this.count() + 1);
  }
}

class DoubleCounter extends Counter {
  static capability = "double-counter";

  increment() {
    super.increment();
    super.increment();
  }
}

class Greeter extends Capability {
  static capability = "greeter";
  static type = "greeting-thing";

  greet(name: string) {
    return `Hello ${name}`;
  }

  get greeting() {
    return this.greet("world");
  }
}

class OtherCounter extends Capability {
  static capability = "other-counter";

  count(): number {
    return 42;
  }
}

describe("compose", () => {
  test("adds the capabilities' members, typed", () => {
    class Thing extends compose(Base, Counter, Greeter) {}
    const thing = new Thing();
    thing.increment();
    expect(thing.count()).toBe(1);
    expect(thing.greet("you")).toBe("Hello you");
    expect(thing.greeting).toBe("Hello world");
    expect(thing.baseMethod()).toBe("base");
    expect(thing).toBeInstanceOf(Base);
    expect(thing).toBeInstanceOf(MiioThing);
  });

  test("collects the capabilities and types, of the whole capability chain", () => {
    class Thing extends compose(Base, DoubleCounter, Greeter) {
      static type = "thing";
    }
    const thing = new Thing();
    expect([...thing.metadata.capabilities].sort()).toEqual([
      "counter",
      "double-counter",
      "greeter",
    ]);
    expect([...thing.metadata.types].sort()).toEqual([
      "base",
      "greeting-thing",
      "thing",
    ]);
    expect(
      thing.matches("type:thing", "cap:counter", "cap:double-counter"),
    ).toBe(true);
  });

  test("super works between capabilities", () => {
    class Thing extends compose(Base, DoubleCounter) {}
    const thing = new Thing();
    thing.increment();
    expect(thing.count()).toBe(2);
  });

  test("the composed class can override capability members and call them with super", () => {
    class Thing extends compose(Base, Counter) {
      increment() {
        super.increment();
        this.updateState("incremented", true);
      }
    }
    const thing = new Thing();
    thing.increment();
    expect(thing.count()).toBe(1);
    expect(thing.getState("incremented")).toBe(true);
  });

  test("the initial state is set (as a copy per instance), without events", async () => {
    class Thing extends compose(Base, Counter) {}
    const a = new Thing();
    const b = new Thing();
    const listener = jest.fn();
    a.on("stateChanged", listener);
    a.getState<unknown[]>("list").push(1);
    expect(await a.state()).toEqual({ count: 0, list: [1] });
    expect(await b.state()).toEqual({ count: 0, list: [] });
    await flush();
    expect(listener).not.toHaveBeenCalled();
  });

  test("a capability shared by several others is applied once", () => {
    class Thing extends compose(Base, Counter, DoubleCounter) {}
    const thing = new Thing();
    thing.increment();
    expect(thing.count()).toBe(2);
  });

  test("a capability already in the base isn't applied again", () => {
    class Parent extends compose(Base, DoubleCounter) {}
    class Child extends compose(Parent, Counter, Greeter) {}
    const thing = new Child();
    thing.increment();
    expect(thing.count()).toBe(2);
    expect([...thing.metadata.capabilities].sort()).toEqual([
      "counter",
      "double-counter",
      "greeter",
    ]);
  });

  test("unrelated capabilities defining the same member conflict", () => {
    expect(() => compose(Base, Counter, OtherCounter)).toThrow(
      "OtherCounter.count conflicts with Counter.count",
    );
  });

  test("only capabilities can be composed", () => {
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- it only has to be a class
    class NotACapability {}
    expect(() =>
      compose(Base, NotACapability as unknown as typeof Counter),
    ).toThrow("NotACapability is not a capability");
  });

  test("runs the capability hooks in order", async () => {
    const calls: string[] = [];
    class First extends Capability {
      capabilityInit() {
        calls.push("first:init");
      }
      capabilityDestroy() {
        calls.push("first:destroy");
      }
    }
    class Second extends Capability {
      async capabilityInit() {
        calls.push("second:init");
      }
      capabilityPropertyUpdated(key: string, value: unknown) {
        calls.push(`second:${key}=${String(value)}`);
      }
    }
    class Thing extends compose(Base, First, Second) {
      async initCallback() {
        calls.push("initCallback");
      }
    }
    const thing = new Thing();
    await thing.init();
    thing.runCapabilityHooksSync("capabilityPropertyUpdated", "a", 1);
    await thing.destroy();
    expect(calls).toEqual([
      "initCallback",
      "first:init",
      "second:init",
      "second:a=1",
      "first:destroy",
    ]);
    // Hooks aren't copied as members
    expect("capabilityInit" in thing).toBe(false);
  });

  test("the hooks of every composition level run", async () => {
    const calls: string[] = [];
    class First extends Capability {
      capabilityInit() {
        calls.push("first");
      }
    }
    class Second extends Capability {
      capabilityInit() {
        calls.push("second");
      }
    }
    class Parent extends compose(Base, First) {}
    class Child extends compose(Parent, Second) {}
    await new Child().init();
    expect(calls).toEqual(["first", "second"]);
  });

  test("names the composed class", () => {
    expect(compose(Base, Counter, Greeter).name).toBe("Base+Counter+Greeter");
  });
});
