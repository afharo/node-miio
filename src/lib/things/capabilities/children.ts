import { Capability } from "../capability";
import type { MiioThing } from "../thing";
import type { ActionDefinition } from "../action_metadata";

const CHILDREN = Symbol("children");

type WithChildren = { [CHILDREN]?: Map<string, MiioThing> };

/**
 * The id of a thing (or the id itself).
 *
 * @param thingOrId The thing or its id
 * @returns The id
 */
function idOf(thingOrId: MiioThing | string): string {
  if (thingOrId === undefined) {
    throw new Error("Thing or identifier needs to be specified");
  }
  const id = typeof thingOrId === "string" ? thingOrId : thingOrId.id;
  if (!id) throw new Error("Child needs to have an `id`");
  return id;
}

/**
 * Has child things (e.g. the sub-devices of a gateway). Emits `thing:available` / `thing:unavailable` when they come
 * and go.
 */
export class Children extends Capability {
  static capability = "children";
  static actions: ActionDefinition[] = [
    { name: "children", description: "The child things", returns: "thing[]" },
    {
      name: "child",
      description: "A child by id",
      arguments: [
        {
          type: "string",
          description: "Its id, with or without the parent's id as a prefix",
        },
      ],
      returns: "thing",
    },
    {
      name: "hasChild",
      description: "Whether it has a child",
      arguments: [{ type: "string", description: "Its id" }],
      returns: "boolean",
    },
  ];

  /** @internal */
  get childMap(): Map<string, MiioThing> {
    const self = this as unknown as WithChildren;
    return (self[CHILDREN] ??= new Map());
  }

  /**
   * Adds (or replaces) a child.
   *
   * @param thing The child
   */
  addChild(thing: MiioThing) {
    if (typeof thing !== "object" || thing === null) {
      throw new Error("Thing needs to be specified");
    }
    if (!thing.id) throw new Error("Child needs to have an `id`");

    thing.metadata.parent = this;
    thing.metadata.addTypes("sub-thing");

    const existing = this.childMap.get(thing.id);
    if (existing === thing) return;
    this.childMap.set(thing.id, thing);
    if (existing) {
      this.emitEvent("thing:unavailable", existing, { multiple: true });
    }
    this.emitEvent("thing:available", thing, { multiple: true });
  }

  /**
   * Removes a child.
   *
   * @param thingOrId The child or its id
   */
  removeChild(thingOrId: MiioThing | string) {
    const child = this.child(idOf(thingOrId));
    if (child) {
      this.childMap.delete(idOf(child));
      this.emitEvent("thing:unavailable", child, { multiple: true });
    }
  }

  /**
   * Whether it has a child (by id, with or without the parent's id as a prefix).
   *
   * @param thingOrId The child or its id
   * @returns `true` if it has it
   */
  hasChild(thingOrId: MiioThing | string) {
    return this.child(idOf(thingOrId)) !== undefined;
  }

  /**
   * A child by id, with or without the parent's id as a prefix.
   *
   * @param id The id
   * @returns The child
   */
  child<T extends MiioThing = MiioThing>(id: string): T | undefined {
    return (this.childMap.get(id) ?? this.childMap.get(`${this.id}:${id}`)) as
      | T
      | undefined;
  }

  /**
   * The first child that matches a filter.
   *
   * @param filter The filter
   * @returns The child, or `null`
   */
  findChild(filter: (child: MiioThing) => boolean): MiioThing | null {
    for (const child of this.childMap.values()) {
      if (filter(child)) return child;
    }
    return null;
  }

  children(): IterableIterator<MiioThing> {
    return this.childMap.values();
  }
}

const DEFINITION_ID = Symbol("definitionId");

type Synced = MiioThing & { [DEFINITION_ID]?: string };

/**
 * Keeps the children of a thing in sync with a list of definitions: creates (and initializes) the new ones, destroys
 * the ones that are gone. A child destroyed by itself is removed from the parent.
 */
export class ChildSyncer<D extends { id: string }> {
  readonly children = new Map<string, Synced>();

  /**
   * @param parent The parent
   * @param syncFunction Creates a child from a definition (or returns the existing one, or nothing to destroy it)
   */
  constructor(
    readonly parent: Children,
    readonly syncFunction: (
      definition: D,
      existing: MiioThing | null | undefined,
    ) => MiioThing | null | undefined,
  ) {}

  private readonly destroyListener = (_: unknown, thing: Synced) => {
    thing.off("thing:destroyed", this.destroyListener);
    const definitionId = thing[DEFINITION_ID];
    if (definitionId !== undefined) this.children.delete(definitionId);
    this.parent.removeChild(thing);
  };

  /**
   * Initializes a new child and adds it to the parent.
   *
   * @param id The id of its definition
   * @param child The child
   */
  private async initChild(id: string, child: Synced) {
    await child.init();
    this.children.set(id, child);
    child.on("thing:destroyed", this.destroyListener);
    this.parent.addChild(child);
  }

  /**
   * Synchronizes the children with the definitions.
   *
   * @param definitions The definitions
   */
  async update(definitions: Iterable<D>) {
    if (!definitions || !(Symbol.iterator in Object(definitions))) {
      throw new Error(
        "Definitions that are iterable are needed to synchronize",
      );
    }

    const promises: Promise<unknown>[] = [];
    const allIds = new Set<string>();
    for (const def of definitions) {
      if (!def.id) throw new Error("`id` is needed on definitions");
      allIds.add(def.id);

      const existing = this.children.get(def.id);
      if (!existing) {
        const child = this.syncFunction(def, null) as Synced | null | undefined;
        if (child) {
          child[DEFINITION_ID] = def.id;
          promises.push(this.initChild(def.id, child));
        }
      } else if (!this.syncFunction(def, existing)) {
        promises.push(existing.destroy());
      }
    }

    for (const [id, child] of this.children) {
      if (!allIds.has(id)) promises.push(child.destroy());
    }
    await Promise.all(promises);
  }
}
