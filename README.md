<!-- prettier-ignore -->
> [!NOTE]
> **Beta testers wanted**
>
> The maintainer no longer owns any of the supported models, so changes are developed against automated tests and validated by users on beta releases.
> If you'd like to help, sign up as a beta tester in the plugin you use ([Homebridge](https://github.com/homebridge-xiaomi-roborock-vacuum/homebridge-xiaomi-roborock-vacuum/issues/1232), [Matterbridge](https://github.com/afharo/matterbridge-xiaomi-roborock/issues/387)) or in [#18](https://github.com/afharo/node-miio/issues/18).
> See [CONTRIBUTING.md](./CONTRIBUTING.md) for other ways to help. Co-maintainers are welcome too.

# miIO Device Library

[![npm version](https://badge.fury.io/js/node-miio.svg)](https://badge.fury.io/js/node-miio)

> The intention of this library is to update the [miio](https://github.com/aholstenson/miio). Since the original repo is no longer maintained, nor reviewing the existing PRs, I decided to create a new one.

Control Mi Home devices that implement the miIO protocol, such as the
Mi Air Purifier, Mi Robot Vacuum and Mi Smart Socket. These devices are commonly
part of what Xiaomi calls the Mi Ecosystem which is branded as MiJia.

`node-miio` is [MIT-licensed](LICENSE.md) and requires at least Node 22.12.0.

**Note:** Since 0.15.0 this library has been rewritten to use [abstract-things](https://github.com/tinkerhub/abstract-things)
as its base. The API of devices will have changed, and some bugs are to be
expected. Testing and feedback on the new API is welcome, please open issues
as needed.

## Devices types

The intent of this library is to support all miIO-compatible devices and to
provide an easy to use API for them. The library maps specific device models to
generic device types with well defined capabilities to simplify interacting with
them.

Currently supported devices are:

- Air Purifiers (1, 2 and Pro)
- Mi Humidifier
- Mi Smart Socket Plug and Power Strips
- Robot vacuums:
  - Roborock / Mi Robot Vacuum (legacy miIO protocol), Viomi and Dreame (mc1808)
  - **Any MIoT vacuum** (Xiaomi, Dreame, Mijia, ijai, …), driven by its spec from [miot-spec.org](https://home.miot-spec.com) (see [MIoT devices](#miot-devices))
- Mi Smart Home Gateway (Aqara) and accessories - switches, sensors, etc
- Philips Light Bulb and Eyecare Lamp
- Yeelights (White Bulb, Color Bulb, Desk Lamp and Strip)

See [documentation for devices](docs/devices/README.md) for information about
the types, their API and supported device models. You can also check
[Missing devices](docs/missing-devices.md) if you want to know what you can do
to help this library with support for your device.

## MIoT devices

Newer devices use the MIoT protocol, where every feature is a numbered property or action described in a per-model spec
published on [miot-spec.org](https://home.miot-spec.com). `node-miio` downloads the spec of your model on first use and
caches it on disk (`~/.cache/node-miio`, `~/Library/Caches/node-miio` or `%LOCALAPPDATA%\node-miio\Cache`).

Each release also bundles a snapshot of the specs of **every vacuum** listed on miot-spec.org, so it works in
air-gapped environments too:

```js
const miio = require("node-miio");

miio.configureMiotSpecs({
  offline: true, // Never use the network (or set the env var MIIO_OFFLINE=1)
  cacheDir: "/path/to/cache", // Or the env var MIIO_CACHE_DIR. `false` disables the cache
  specDir: "/path/to/specs", // Optional: your own specs, named `<model>.json`
});
```

To inspect the spec of a model (and whether it's supported as a vacuum):

```
$ npx node-miio spec xiaomi.vacuum.d110ch
```

MIoT vacuums expose `fanSpeeds()` and `waterBoxModes()` with the values (and names) supported by the model.

## Installation

To install into your project:

```
npm install node-miio
```

To install globally for access to the command line tool:

```
npm install -g node-miio
```

## Usage

```javascript
const miio = require("node-miio");
```

The package includes TypeScript declarations. With TypeScript, use `isVacuum()` to narrow the device to a
`VacuumDevice`, and `instanceof` for the API of a specific implementation:

```typescript
import * as miio from "node-miio";
import { isVacuum, Vacuum } from "node-miio";

const device = await miio.device({ address, token });
if (isVacuum(device)) {
  await device.activateCleaning(); // shared by every vacuum
  if (device instanceof Vacuum) {
    await device.startMopWash(); // Roborock only
  }
}
```

Resolve a handle to the device:

```javascript
// Resolve a device, resolving the token automatically or from storage
miio
  .device({ address: "192.168.100.8" })
  .then((device) => console.log("Connected to", device))
  .catch((err) => handleErrorHere);

// Resolve a device, specifying the token (see below for how to get the token)
miio
  .device({ address: "192.168.100.8", token: "token-as-hex" })
  .then((device) => console.log("Connected to", device))
  .catch((err) => handleErrorHere);
```

Call methods to interact with the device:

```javascript
// Switch the power of the device
device
  .togglePower()
  .then((on) => console.log("Power is now", on))
  .catch((err) => handleErrorHere);

// Using async/await
await device.togglePower();
```

Listen to events such as property changes and actions:

```javascript
// Listen for power changes
device.on("power", (power) => console.log("Power changed to", power));

// The device is available for event handlers
const handler = ({ action }, device) =>
  console.log("Action", action, "performed on", device);
device1.on("action", handler);
device2.on("action", handler);
```

Capabilities and types are used to hint about what a device can do:

```javascript
if (device.matches("cap:temperature")) {
  console.log(await device.temperature());
}

if (device.matches("cap:switchable-power")) {
  device.setPower(false).then(console.log).catch(console.error);
}
```

If you are done with the device call `destroy` to stop all network traffic:

```javascript
device.destroy();
```

## Tokens and device management

A few miIO devices send back their token during a handshake and can be used
without figuring out the token. Most devices hide their token, such as
Yeelights and the Mi Robot Vacuum.

There is a command line tool named `miio` that helps with finding and storing
tokens. See [Device management](docs/management.md) for details
and common use cases.

The easiest way to get the tokens is from your Xiaomi account (opt-in):
`npx node-miio cloud login --qr` (scan the QR code with the Mi Home app), then
`npx node-miio cloud devices`. See [Xiaomi Cloud](docs/cloud.md).

Robots paired with the **Roborock app** don't use miIO tokens. Their support is starting (experimental):
`npx node-miio roborock login` (with a code sent to your email), then `npx node-miio roborock devices` lists
your robots with their model and protocol version, and `roborockDevice()` controls them (locally, or through Roborock's cloud). See [Roborock app accounts](docs/roborock.md).

## Discovering devices

Use `miio.devices()` to look for and connect to devices on the local network.
This method of discovery will tell you directly if a device reveals its token
and can be auto-connected to. If you do not want to automatically connect to
devices you can use `miio.browse()` instead.

Example using `miio.devices()`:

```javascript
const devices = miio.devices({
  cacheTime: 300, // 5 minutes. Default is 1800 seconds (30 minutes)
});

devices.on("available", (device) => {
  if (device.matches("placeholder")) {
    // This device is either missing a token or could not be connected to
  } else {
    // Do something useful with device
  }
});

devices.on("unavailable", (device) => {
  // Device is no longer available and is destroyed
});
```

`miio.devices()` supports these options:

- `cacheTime`, the maximum amount of seconds a device can be unreachable before it becomes unavailable. Default: `1800`
- `filter`, function used to filter what devices are connected to. Default: `reg => true`
- `skipSubDevices`, if sub devices on Aqara gateways should be skipped. Default: `false`
- `useTokenStorage`, if tokens should be fetched from storage (see device management). Default: `true`
- `tokens`, object with manual mapping between ids and tokens (advanced, use [Device management](docs/management.md) if possible)

See [Advanced API](docs/advanced-api.md) for details about `miio.browse()`.

## Device API

Check [documentation for devices](docs/devices/README.md) for details about
the API for supported devices. Detailed documentation of the core API is
available in the section [Using things in the abstract-things documentation](http://abstract-things.readthedocs.io/en/latest/using-things.html).

## Library versioning and API stability

This library uses [semantic versioning](http://semver.org/) with an exception
being that the API for devices is based on their type and capabilities and not
their model.

This means that a device can have methods removed if its type or capabilities
change, which can happen if a better implementation is made available for the
model. When working with the library implement checks against type and
capabilities for future compatibility within the same major version of `miio`.

Capabilities can be considered stable across major versions, if a device
supports `power` no minor or patch version will introduce `power-mega` and
replace `power`. If new functionality is needed the new capability will be
added along side the older one.

## Reporting issues

[Reporting issues](docs/reporting-issues.md) contains information that is
useful for making any issue you want to report easier to fix.

## Debugging

The library uses [debug](https://github.com/visionmedia/debug) with two
namespaces, `miio` is used for packet details and network discovery and devices
use the `thing:miio` namespace. These are controlled via the `DEBUG`
environment flag. The flag can be set while running the miio command or any
NodeJS script:

Show debug info about devices during discovery:

```
$ DEBUG=thing\* miio discover
```

To activate both namespaces set `DEBUG` to both:

```
$ DEBUG=miio\*,thing\* miio discover
```

### Sending the debug messages to your own logger

Apps (e.g. Homebridge or Matterbridge plugins) can send node-miio's debug messages to their own logger, so users don't
need to set `DEBUG`. Tokens and passwords are redacted from these messages.

```javascript
const miio = require("node-miio");

// The messages of this device (requests, responses, property changes…)
const device = await miio.device({
  address,
  token,
  logger: { debug: (msg) => log.debug(msg) },
});

// Everything that isn't about a specific device (network, MIoT specs, Xiaomi Cloud…)
miio.configureLogging({ logger: { debug: (msg) => log.debug(msg) } });
```

The messages are prefixed with their namespace, e.g. `[thing:miio:1234] <- Message: ...`. The low-level packet details
(`miio:packet`) are only available through `DEBUG`.

## Protocol documentation

This library is based on the documentation provided by OpenMiHome. See https://github.com/OpenMiHome/mihome-binary-protocol for details. For details
about how to figure out the commands for new devices look at the
[documentation for protocol and commands](docs/protocol.md).
