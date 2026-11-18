# AGENTS.md

Guidance for AI coding agents (and humans) working on `node-miio`.

## Context

- `node-miio` is the miIO/MIoT protocol library used by
  [homebridge-xiaomi-roborock-vacuum](https://github.com/homebridge-xiaomi-roborock-vacuum/homebridge-xiaomi-roborock-vacuum)
  and [matterbridge-xiaomi-roborock](https://github.com/afharo/matterbridge-xiaomi-roborock).
- **The maintainer no longer owns test hardware** (see [#18](https://github.com/afharo/node-miio/issues/18)).
  Every behavioural change must be covered by unit tests that replay device responses, and be released as a beta for users to validate.
- Changes are delivered as PRs from feature branches into `main`. Do not push to `main` directly.

## Commands

```sh
npm ci
npm run lint    # eslint (warnings are tolerated for now, errors are not)
npm test        # jest (babel-jest: tests are NOT type-checked, `npm run build` is)
npm run build   # tsc -> dist/
node dist/cli/index.js --help   # smoke-test the CLI after building
```

CI (`.github/workflows/build.yml`) runs lint, test and build on Node 20/22/24.

## Layout

- `src/lib/index.ts`: public API (`device()`, `devices()`, `browse()`, `models` and the exported device classes).
- `src/lib/connect_to_device.ts`: resolves a model to a class. Exact match in `src/lib/models.ts` first, then a regex fallback
  (`*.vacuum.*` → `Vacuum` / `ViomiVacuum` / `DreameVacuum`), then the generic `Device`.
- `src/lib/device.ts`: base class (`MiioApi`). Properties are declared with `defineProperty(rawName, { name, mapper, siid?, piid? })`
  and loaded by `loadProperties` (default: `get_prop`; vacuums override it).
- `src/lib/device_info.ts`: low-level transport (handshake, encryption, retries).
- `src/lib/protocol.ts`: typed map of RPC methods → params/response.
- `src/lib/devices/**`: device implementations. The TypeScript conversion is in progress; some files are still `.js`.
- `src/cli/**`: the `node-miio` CLI (yargs). Commands are registered explicitly in `src/cli/index.ts`
  (`commandDir` doesn't work with the ESM-only yargs 18).

## Testing without hardware

- Use `createFakeHandle(model, responses)` from `src/lib/test_utils.test.mock.ts` to build a device that replays responses.
  Unexpected RPC methods reject, so tests fail loudly. Assert sent calls with `sentCalls(call)`.
- Put recorded responses under `src/lib/__fixtures__/<model>/<method>.json` (excluded from the npm package).
  Prefer real captures from users' bug reports (`node-miio protocol call <ip> <method>`); scrub tokens, serial numbers and IPs.
- Commands using `refresh`/`refreshDelay` wait on timers: use fake timers and `jest.advanceTimersByTimeAsync`.
- `src/lib/modules_load.test.ts` loads every module in isolation. It catches broken mixins and circular imports.

## Gotchas learned the hard way

- **abstract-things mixins**: capabilities built with `Thing.mixin(...)` must be exported as values
  (`export const X = Thing.mixin(...)`), never as `class X extends Thing.mixin(...) {}`, which throws at load time.
- **Circular imports**: `device` → `management` → `connect_to_device` → `placeholder` → `device`. `management.ts` lazy-loads
  `connect_to_device` for that reason. Keep it that way.
- **The vacuum type is spelled `vaccuum`** by abstract-things (`device.matches("type:vaccuum")`). It's not a typo in the consumers. Don't "fix" it.
- Roborock `get_status` / `get_consumable` respond with a single-item array (`[{...}]`).
- Properties whose mapped value is `undefined`/`null` are not stored on first load (`deep-equal` treats them as equal).
- Legacy Roborock models (`roborock.vacuum.*`, `rockrobo.vacuum.*`) speak the **legacy miIO** command set (`get_status`, `app_start`, …).
  Their MIoT specs on miot-spec.org are stubs, and their fan-speed values differ from the spec (and change with the firmware).

## Device specs (MIoT)

- Model → URN: `https://miot-spec.org/miot-spec-v2/instances?status=all` (~7 MB). Prefer `released` and the highest `version`.
- Spec: `https://miot-spec.org/miot-spec-v2/instance?type=<urn>` (`services[].iid` = siid, `properties[].iid` = piid, `actions[].iid` = aiid).
- Translations: `https://miot-spec.org/instance/v2/multiLanguage?urn=<urn>`.
- home.miot-spec.com is a UI over the same data. Don't depend on it.

## Licensing (important)

`node-miio` is MIT. [python-miio](https://github.com/rytilahti/python-miio) is **GPL-3.0**. Use it as a behavioural
reference only (which commands exist, what they do). **Never copy or translate its code, mappings or tables.**
Implement from the miot-spec data, protocol documentation (e.g. marcelrv/XiaomiRobotVacuumProtocol) and captured traffic.
Other projects (openHAB: EPL-2.0; hass-xiaomi-miot: Apache-2.0) need attribution if anything is reused. Prefer reimplementing.
