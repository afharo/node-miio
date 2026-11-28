import { MiioThing } from "../thing.js";

/** Waits for the queued events to be emitted */
export const flush = () => new Promise((resolve) => setImmediate(resolve));

/** A thing to compose the capabilities with */
export class Base extends MiioThing {
  constructor(id = "test:1") {
    super();
    this.id = id;
  }
}

/**
 * Records the events emitted by a thing.
 *
 * @param thing The thing
 * @param events The events to record
 * @returns The recorded `[event, data]`
 */
export function record(thing: MiioThing, ...events: string[]) {
  const calls: [string, unknown][] = [];
  for (const event of events) {
    thing.on(event, (data: unknown) => calls.push([event, data]));
  }
  return calls;
}
