# Capabilities

The capabilities of the things, composed with [`compose`](../README.md#composing-capabilities). Each one adds a state
key (or several), the methods to read it and update it, and its events. They don't talk to the devices: the methods
left to the device (`change…`, `activate…`) throw until the device implements them.

Every state change also emits `stateChanged` (`{ key, value }`). The names (`cap:…`) are the ones `matches()` checks.

## [`common.ts`](common.ts)

| Capability                                   | State           | Read / update                                                   | Implement            | Events                                                             |
| -------------------------------------------- | --------------- | --------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------ |
| `ErrorState` (`error-state`)                 | `error`         | `error` (getter), `updateError(error \| null)`                  |                      | `errorChanged`, `error`, `errorCleared`                            |
| `Power` (`power`)                            | `power`         | `power()`, `updatePower(bool)`                                  |                      | `powerChanged`                                                     |
| `SwitchablePower` (`switchable-power`)       | Power           | `power(value?)`, `setPower`, `togglePower`, `turnOn`, `turnOff` | `changePower(bool)`  |                                                                    |
| `Mode` (`mode`)                              | `mode`, `modes` | `mode()`, `modes()`, `updateMode`, `updateModes`                |                      | `modeChanged`, `modesChanged`                                      |
| `SwitchableMode` (`switchable-mode`)         | Mode            | `mode(value?)`, `setMode`                                       | `changeMode(mode)`   |                                                                    |
| `BatteryLevel` (`battery-level`)             | `batteryLevel`  | `batteryLevel()` (`-1` until known), `updateBatteryLevel`       |                      | `batteryLevelChanged`                                              |
| `ChargingState` (`charging-state`)           | `charging`      | `charging` (getter), `updateCharging(bool)`                     |                      | `chargingChanged`, `chargingStarted`, `chargingStopped`            |
| `AutonomousCharging` (`autonomous-charging`) | Charging        | `charge()`                                                      | `activateCharging()` |                                                                    |
| `Nameable` (`nameable`)                      | `metadata.name` | `setName(name)`                                                 | `changeName(name)`   | `thing:metadata`                                                   |
| `Actions` (`actions`)                        | `actions`       | `actions()`, `updateActions`, `emitAction(action, data)`        |                      | `action` (`{ action, data }`), `action:<action>`, `actionsChanged` |

## [`climate.ts`](climate.ts)

| Capability                                                | State               | Read / update                                                               | Implement                                    | Events                                                                                     |
| --------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `CleaningState` (`cleaning-state`, extends ErrorState)    | `cleaning`, `error` | `cleaning()`, `updateCleaning(bool)`. `updateError` also stops the cleaning |                                              | `cleaningChanged`, `cleaningStarted`, `cleaningStopped`, `cleaningDone` or `cleaningError` |
| `AutonomousCleaning` (`autonomous-cleaning`)              | Cleaning            | `clean()`, `stop()`                                                         | `activateCleaning()`, `deactivateCleaning()` |                                                                                            |
| `SpotCleaning` (`spot-cleaning`)                          | Cleaning            | `spotClean()`                                                               | `activateSpotClean()`                        |                                                                                            |
| `FanSpeed` (`fan-speed`)                                  | `fanSpeed`          | `fanSpeed()` (`null` until known), `updateFanSpeed`                         |                                              | `fanSpeedChanged`                                                                          |
| `AdjustableFanSpeed` (`adjustable-fan-speed`)             | Fan speed           | `fanSpeed(value?)`, `setFanSpeed`                                           | `changeFanSpeed(speed)`                      |                                                                                            |
| `TargetHumidity` (`target-humidity`)                      | `targetHumidity`    | `targetHumidity()`, `updateTargetHumidity`                                  |                                              | `targetHumidityChanged`                                                                    |
| `AdjustableTargetHumidity` (`adjustable-target-humidity`) | Target humidity     | `targetHumidity(value?)`, `setTargetHumidity`                               | `changeTargetHumidity(humidity)`             |                                                                                            |

A vacuum is `BatteryLevel` + `AutonomousCharging` + `AutonomousCleaning` + `AdjustableFanSpeed` (+ `SpotCleaning` for
most).

## [`children.ts`](children.ts)

- `Children` (`children`): child things, e.g. the sub-devices of a gateway or the USB port of a plug. `addChild`,
  `removeChild`, `child(id)` (with or without the parent's id as a prefix), `hasChild`, `findChild`, `children()`.
  Children get the `sub-thing` type and `metadata.parent`. Emits `thing:available` / `thing:unavailable`.
- `ChildSyncer`: keeps the children in sync with a list of definitions (`update(definitions)`): it creates and
  initializes the new ones, keeps or replaces the existing ones (the sync function decides), and destroys the ones that
  are gone. A child that destroys itself is removed from the parent.

## [`sensors.ts`](sensors.ts)

All extend `Sensor` (type `sensor`): `value(key)`, `values()` (every sensor of the thing), `sensorTypes`, and
`updateValue(key, value)`, which emits `<key>Changed`.

| Capability                                     | State key             | Value                                                                                                    |
| ---------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| `Temperature` (`temperature`)                  | `temperature`         | Quantity (°C)                                                                                            |
| `RelativeHumidity` (`relative-humidity`)       | `relativeHumidity`    | Percentage                                                                                               |
| `PM2_5` (`pm2.5`)                              | `pm2.5`               | Number                                                                                                   |
| `PM10` (`pm10`)                                | `pm10`                | Number                                                                                                   |
| `Illuminance` (`illuminance`)                  | `illuminance`         | Quantity (lx)                                                                                            |
| `AtmosphericPressure` (`atmospheric-pressure`) | `atmosphericPressure` | Quantity (Pa)                                                                                            |
| `PowerLoad` (`power-load`)                     | `powerLoad`           | Quantity (W)                                                                                             |
| `PowerConsumed` (`power-consumed`)             | `powerConsumed`       | Quantity (Wh)                                                                                            |
| `Voltage` (`voltage`)                          | `voltage`             | Quantity (V)                                                                                             |
| `Contact` (`contact`)                          | `contact`             | `true` when closed. `isOpen()`, `isClosed()`. Emits `opened` / `closed`                                  |
| `Motion` (`motion`)                            | `motion`              | Boolean. `updateMotion(true, "1m")` goes back to idle after the timeout. Emits `movement` / `inactivity` |

## [`lights.ts`](lights.ts)

- Types: `Light` (`light`), `LightBulb` (`light-bulb`) and `LightStrip` (`light-strip`).
- `Brightness` (`brightness`): `brightness()`, `updateBrightness` (0-100). Emits `brightnessChanged`.
- `Dimmable` (`dimmable`, extends Brightness): `brightness(value?, transition)` (`50`, `"+10"`, `"-10"`),
  `setBrightness`, `increaseBrightness`, `decreaseBrightness`. Implement `changeBrightness(brightness, { duration, powerOn })`.
- `Colorable` (`colorable`): `color(value?, transition)`, `setColor`, `updateColor`. Emits `colorChanged`. Implement
  `changeColor(color, { duration })`.
- `ColorTemperature` (`color:temperature`): `colorTemperatureRange()`, `updateColorTemperatureRange(min, max)`. Emits
  `colorTemperatureRangeChanged`.
- `ColorFull` (`color:full`): only the capability name.
- `Fading` (`fading`): `maxChangeTime()`, `updateMaxChangeTime("30s")`.

Transitions default to 400 ms (`DEFAULT_LIGHT_DURATION`).

## Adding one

Follow the rules in [`../capability.ts`](../capability.ts) ([summary](../README.md#writing-a-capability)), export it
from its file (`index.ts` re-exports them), and test its methods and events in
[`capabilities.test.ts`](capabilities.test.ts).
