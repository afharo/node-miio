# Robot Vacuums

* **Devices**:
  * Roborock / Mi Robot Vacuum (legacy miIO): `rockrobo.vacuum.*`, `roborock.vacuum.*` (class `Vacuum`)
  * Viomi (legacy miIO): older `viomi.vacuum.*` such as v6/v7/v8 (class `ViomiVacuum`)
  * Any MIoT vacuum (Xiaomi, Dreame, Mijia, ijai, newer Viomi…), driven by its spec (class `MiotVacuum`, see the README)

Robot vacuums are mapped into a device of type [`vacuum`][vacuum]. The device
will support many different capabilities, such as autonomous cleaning, getting
the cleaning state and more.

## Examples

### Check if device is a vacuum

```javascript
// Note: abstract-things spells the type as "vaccuum"
if(device.matches('type:vaccuum')) {
  /*
   * This device is a vacuum.
   */
}
```

### Check if cleaning

```javascript
// Get the current cleaning state
device.cleaning()
  .then(isCleaning => ...)
  .catch(...);

// With async/wait
const isCleaning = await device.cleaning();
```

### Request cleaning

```javascript
// Request cleaning
device.clean()
  .then(...)
  .catch(...);

// With async/await
await device.clean();
```

### Stop current cleaning

```javascript
// Stop cleaning
device.stop()
  .then(...)
  .catch(...);

// With async/await
await device.stop();
```

### Request spot cleaning

```javascript
// Spot clean
device.spotClean()
  .then(...)
  .catch(...);

// With async/await
await device.spotClean();
```

### Get the battery level

```javascript
// Get the battery level
device.batteryLevel()
  .then(level => ...)
  .catch(...);

// With async/wait
const level = await device.batteryLevel();
```

### Fan speeds and water levels

Every vacuum class lists the values supported by the model (and firmware, for legacy Roborock models):

```javascript
const speeds = await device.fanSpeeds();
// [{ value: 105, name: "Soft" }, { value: 101, name: "Quiet" }, ...]
await device.changeFanSpeed(speeds[1].value);

const waterLevels = await device.waterBoxModes(); // [] if not supported
if (waterLevels.length) await device.setWaterBoxMode(waterLevels[1].value);
```

### Cleaning type (MIoT vacuums)

MIoT vacuums that let you choose between vacuuming, mopping or both expose the options from their spec:

```javascript
const types = await device.cleaningTypes();
// [{ value: 1, name: "Sweep" }, { value: 2, name: "Mop" }, { value: 3, name: "Sweep Mop" }, { value: 4, name: "Sweep Before Mopping" }]
await device.setCleaningType(types[3].value);
```

### Roborock-only features

```javascript
// Clean rooms (segment ids from getRoomMap()), twice
await device.cleanRooms([16, 17], { repeat: 2 });

// Do Not Disturb
await device.getDoNotDisturb(); // { enabled: true, start: "22:00", end: "08:00" }
await device.setDoNotDisturb("22:00", "08:00");
await device.disableDoNotDisturb();

// Carpet mode (suction boost on carpets)
await device.setCarpetMode(true);

// Mop route (S7 and newer)
const { MOP_ROUTES } = require("node-miio");
await device.setMopRoute(MOP_ROUTES.deep);

// Multi-floor maps
const maps = await device.getMaps(); // [{ id: 0, name: "Ground floor" }, ...]
await device.loadMap(maps[1].id);

// Docks with mop washing / drying
await device.startMopWash();
await device.startMopDrying();
await device.stopMopDrying();

// Water tank and dock status (only on the models that report them, `undefined` otherwise).
// They're also part of `device.state()` and the `stateChanged` events.
device.property("waterBoxAttached"); // true when the water tank is mounted
device.property("waterShortage"); // true when the (dock's) clean water tank is empty
device.property("mopDrying"); // true while the dock dries the mop

// Consumables and volume
await device.resetConsumable("filter_work_time");
await device.setSoundVolume(50);
```

> These commands follow the community-documented miIO protocol and are not tested on every model.
> Please report which ones work on yours.

