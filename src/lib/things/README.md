# Things

node-miio's thing model: the base of every device (and sub-device, like the children of a gateway). It replaces
[abstract-things](https://github.com/tinkerhub/abstract-things) and keeps its API: the same types, capabilities,
methods, events and event delivery. That way, the plugins (and the [device docs](../../../docs/devices/README.md)) don't
change.

| File                                              | What                                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`thing.ts`](thing.ts)                            | `MiioThing`: id, metadata (`matches`), lifecycle, events and state                             |
| [`compose.ts`](compose.ts)                        | `compose(Base, ...capabilities)`: builds a class with capabilities                             |
| [`capability.ts`](capability.ts)                  | `Capability`: the base of the capabilities, and their rules                                    |
| [`registry.ts`](registry.ts)                      | Where `compose` records what the capabilities contribute, and the hooks                        |
| [`capabilities/`](capabilities/README.md)         | The capabilities: power, battery, cleaning, sensors, lights…                                   |
| [`values.ts`](values.ts) / [`color.ts`](color.ts) | Converters for the values (`percentage("50%")`, `code(error)`, `duration("30s")`…) and `Color` |

## `MiioThing`

An `EventEmitter` with:

- **An id**, namespaced (`miio:123456`). It can't change once initialized.
- **Metadata**: the types and capabilities, collected from the `static type` / `static types` / `static capability` /
  `static capabilities` of the class chain and of the composed capabilities.
  `thing.matches("type:vacuum", "cap:battery-level")` is `true` if the thing matches all the tags.
- **A lifecycle**: `init()` runs `initCallback()` (override it, calling `super`), then the `capabilityInit` hooks, and
  emits `thing:initialized`. `destroy()` does the same with `destroyCallback()`, `capabilityDestroy` and
  `thing:destroyed`.
- **State**: `state()` (a copy), `getState(key, default)`, `updateState(key, value)` (deep comparison: returns whether
  it changed, emitting `stateChanged` with `{ key, value }`) and `removeState(key)`.
- **Events**: `emitEvent(event, data, options)` queues the event, emitted on the next tick (`setImmediate`). Only the
  last event of each name is emitted per tick, unless `{ multiple: true }` (keep all) or `{ multiple: (data) => … }`
  (replace the queued event it matches: e.g. `stateChanged` keeps one event per key). Listeners get `(data, thing)`.
  An `error` event is only emitted if it has listeners (Node's `EventEmitter` would throw).

## Composing capabilities

TypeScript classes can only extend one class, so capabilities are added with `compose`:

```ts
import { compose } from "./compose";
import { MiioThing } from "./thing";
import { BatteryLevel, AutonomousCharging } from "./capabilities";

class Robot extends compose(MiioThing, BatteryLevel, AutonomousCharging) {
  static type = "robot";

  // Implement what the capabilities leave to the device
  async activateCharging() {
    // …
  }
}

const robot = new Robot();
await robot.batteryLevel(); // -1 until known (typed: number)
robot.updateBatteryLevel(80); // emits batteryLevelChanged and stateChanged
await robot.charge(); // calls activateCharging()
robot.matches("type:robot", "cap:battery-level", "cap:autonomous-charging"); // true
```

The devices compose `MiioApi` (`src/lib/device.ts`), which adds the miIO properties, calls and polling. For example,
the vacuums share
[`VacuumThing`](../devices/vacuums/vacuum_thing.ts):
`compose(MiioApi, BatteryLevel, AutonomousCharging, AutonomousCleaning, AdjustableFanSpeed)`.

How it works:

- `compose` creates a class between the new class and `Base`, and copies the members of each capability (and of its
  parent capabilities) onto it. The new class can override them and call them with `super`.
- The type is `Base` plus the intersection of the capabilities, so the published declarations need no hand-written
  types.
- A capability is applied once, even if several capabilities extend it (e.g. `AutonomousCleaning` and `SpotCleaning`
  both extend `CleaningState`), or `Base` already has it. Composed classes can be composed again.
- Two unrelated capabilities defining the same member throw when composing (instead of one silently winning).
- Capabilities are copied, not inherited: **`thing instanceof SomeCapability` is always `false`**. Use
  `thing.matches("cap:…")`.

## Writing a capability

See the rules in [`capability.ts`](capability.ts) and the examples in [`capabilities/`](capabilities/README.md).
In short:

```ts
export class Brightness extends Capability {
  // Its name (`cap:brightness`), and its types if any (`static type = "light"`)
  static capability = "brightness";
  // Set on construction, without events. No constructor, no instance fields: they never run.
  static initialState: Record<string, unknown> = { brightness: 0 };

  brightness(): Promise<number> {
    return Promise.resolve(this.getState<number>("brightness"));
  }

  updateBrightness(brightness: number) {
    if (this.updateState("brightness", brightness)) {
      this.emitEvent("brightnessChanged", brightness);
    }
  }

  // Left to the device. Throwing is the convention for "not implemented".
  changeBrightness(_brightness: number): Promise<unknown> {
    throw new Error("changeBrightness not implemented");
  }

  // A hook: it runs for every capability that implements it (it's not copied as a member)
  capabilityPropertyUpdated(key: string, value: unknown) {
    if (key === "bright") this.updateBrightness(value as number);
  }
}
```

- `this` is typed as a `MiioThing`: `this.updateState`, `this.emitEvent`, `this.metadata`… are available.
  To call the device (`this.call(…)`, `this.property(…)`), extend `DeviceCapability`
  ([`devices/capabilities/device_capability.ts`](../devices/capabilities/device_capability.ts)) instead: it's the same
  base, typed as a miIO device.
- Other per-instance data goes under a symbol, created lazily (see `Children` or `Motion`).
- `super` works between capabilities (`SwitchablePower` → `Power`), not into the class the capability is composed into.
  To take part in its lifecycle, implement a hook:

| Hook                                         | When                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `capabilityInit()`                           | During `init()`, after `initCallback()`                                            |
| `capabilityDestroy()`                        | During `destroy()`, after `destroyCallback()`                                      |
| `capabilityPropertyUpdated(key, value, old)` | When a device property changes (run by `MiioApi.setProperty`, and the sub-devices) |

## Values

[`values.ts`](values.ts) normalises what the devices report (or the users pass) and throws when it can't:

- `boolean` (`"on"`, `"yes"`, `1`…), `number`, `string`, and `percentage` (`"50%"`, with optional `min`/`max`/`precision`).
- `percentageChange`: `"+10"` / `"-10"` / `10`.
- `code`: errors and modes as `{ id, description }`, from `{ code, message }`, `"id: description"`, `[id, description]`…
- `duration`: `500`, `"500ms"`, `"30s"`, `"5m"`… (`.ms`, `.seconds`).
- Quantities with a unit: `temperature` (°C), `illuminance` (lx), `pressure` (Pa), `power` (W), `energy` (Wh), `voltage` (V)…
  (`.value`, `.unit`, and `Number(quantity)`).

[`color.ts`](color.ts): `color("#ff0000")`, `color("4000K")`, `color("daylight")`, `color.rgb(255, 0, 0)`,
`color.temperature(2700)`… converted with `.rgb`, `.hsv`, `.hsl`, `.temperature` and `.mired`, read with `.red`,
`.hue`, `.kelvins`…
