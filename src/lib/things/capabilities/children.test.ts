import { describe, test, expect } from "vitest";

import { compose } from "../compose.js";
import { MiioThing } from "../thing.js";

import { Base, flush, record } from "./test_utils.test.mock.js";

import { Children, ChildSyncer } from "./index.js";

describe("Children", () => {
  class Parent extends compose(Base, Children) {}
  class Child extends MiioThing {
    constructor(id: string) {
      super();
      this.id = id;
    }
  }

  test("adds, replaces, finds and removes children", async () => {
    const parent = new Parent("gateway:1");
    const calls = record(parent, "thing:available", "thing:unavailable");
    const a = new Child("gateway:1:a");
    const a2 = new Child("gateway:1:a");

    parent.addChild(a);
    parent.addChild(a);
    expect(a.metadata.parent).toBe(parent);
    expect(a.matches("type:sub-thing")).toBe(true);
    expect(parent.hasChild("a")).toBe(true);
    expect(parent.child("gateway:1:a")).toBe(a);

    parent.addChild(a2);
    expect(parent.child("a")).toBe(a2);
    expect(parent.findChild((c) => c === a2)).toBe(a2);
    expect([...parent.children()]).toEqual([a2]);

    parent.removeChild("a");
    expect(parent.hasChild(a2)).toBe(false);
    await flush();
    expect(calls).toEqual([
      ["thing:available", a],
      ["thing:unavailable", a],
      ["thing:available", a2],
      ["thing:unavailable", a2],
    ]);
  });

  test("ChildSyncer creates, keeps and destroys children", async () => {
    const parent = new Parent("gateway:1");
    const created: string[] = [];
    const syncer = new ChildSyncer<{ id: string; keep?: boolean }>(
      parent,
      (def, existing) => {
        if (existing) return def.keep === false ? null : existing;
        created.push(def.id);
        return new Child(`gateway:1:${def.id}`);
      },
    );

    await syncer.update([{ id: "a" }, { id: "b" }]);
    expect(created).toEqual(["a", "b"]);
    expect([...parent.children()].map((c) => c.id)).toEqual([
      "gateway:1:a",
      "gateway:1:b",
    ]);

    // "a" is kept, "b" is gone, "c" is new
    await syncer.update([{ id: "a" }, { id: "c" }]);
    await flush();
    expect(created).toEqual(["a", "b", "c"]);
    expect([...parent.children()].map((c) => c.id).sort()).toEqual([
      "gateway:1:a",
      "gateway:1:c",
    ]);

    // The sync function can destroy an existing child
    await syncer.update([{ id: "a", keep: false }, { id: "c" }]);
    await flush();
    expect([...parent.children()].map((c) => c.id)).toEqual(["gateway:1:c"]);
  });
});
