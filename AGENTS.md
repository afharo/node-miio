# AGENTS.md

Guidance for AI coding agents (and humans) working on `node-miio`.

## Context

- `node-miio` is the miIO/MIoT protocol library used by
  [homebridge-xiaomi-roborock-vacuum](https://github.com/homebridge-xiaomi-roborock-vacuum/homebridge-xiaomi-roborock-vacuum)
  and [matterbridge-xiaomi-roborock](https://github.com/afharo/matterbridge-xiaomi-roborock).
- **The maintainer no longer owns any of the supported models** (see [#18](https://github.com/afharo/node-miio/issues/18)).
  Every behavioural change must be covered by unit tests that replay device responses, and be released as a beta for users to validate.
- Changes are delivered as PRs from feature branches into `main`. Do not push to `main` directly.
- **Label every PR** when creating it, so `.github/release.yml` can group the release notes:
  `enhancement` (features), `bug` (fixes), `dependencies` (deps / Node.js engines), `documentation` (docs only).
  PRs labelled `release` (version bumps) are excluded from the notes.

## Commands

```sh
npm ci
npm run lint    # eslint --max-warnings=0: warnings fail CI too
npm test        # jest (babel-jest: tests are NOT type-checked, `npm run build` is)
npm run build   # tsc -> dist/ (JS + .d.ts)
npm run test:types   # after build: type-checks test-types/consumer.ts against the published types, like a plugin
node dist/cli/index.js --help   # smoke-test the CLI after building
```

CI (`.github/workflows/build.yml`) runs lint, test and build on Node 22/24/26. `engines` is `^22.13.0 || >=24.0.0`:
the ESM-only yargs 18 is loaded with `require()`, which needs `require(esm)` support (22.12), and the CLI colours its
output with `util.styleText`, stable (and honouring `NO_COLOR` and non-TTY streams) since 22.13 and 23.5. Node 23 is
EOL. Don't add chalk back.

## Layout

- `src/lib/index.ts`: public API (`device()`, `devices()`, `browse()`, `models` and the exported device classes).
- `src/lib/connect_to_device.ts`: resolves a model to a class. Exact match in `src/lib/models.ts` first, then a regex fallback
  (`*.vacuum.*` → `Vacuum` / `ViomiVacuum` / `DreameVacuum`), then the generic `Device`.
- `src/lib/device.ts`: base class (`MiioApi`). Properties are declared with `defineProperty(rawName, { name, mapper, siid?, piid? })`
  and loaded by `loadProperties` (default: `get_prop`; vacuums override it).
- `src/lib/device_info.ts`: low-level transport (handshake, encryption, retries).
- `src/lib/protocol.ts`: typed map of RPC methods → params/response.
- `src/lib/things/**`: the thing model (it replaced abstract-things, keeping its API): `MiioThing` (events, state, lifecycle,
  `matches`), `compose(Base, ...capabilities)` and the capabilities (plain classes extending `Capability`, see the rules in
  `capability.ts`), the values (`percentage`, `code`, `duration`…) and `Color`. See its README.md.
- `src/lib/devices/**`: device implementations (all TypeScript, except `gateway/developer-api.js`).
- `src/cli/**`: the `node-miio` CLI (yargs). Commands are registered explicitly in `src/cli/index.ts`
  (`commandDir` doesn't work with the ESM-only yargs 18).

## Testing without hardware

- Use `createFakeHandle(model, responses)` from `src/lib/test_utils.test.mock.ts` to build a device that replays responses.
  Unexpected RPC methods reject, so tests fail loudly. Assert sent calls with `sentCalls(call)`.
- Put recorded responses under `src/lib/__fixtures__/<model>/<method>.json` (excluded from the npm package).
  Prefer real captures from users' bug reports (`node-miio protocol call <ip> <method>`); scrub tokens, serial numbers and IPs.
- Commands using `refresh`/`refreshDelay` wait on timers: use fake timers and `jest.advanceTimersByTimeAsync`.
- `src/lib/modules_load.test.ts` loads every module in isolation. It catches broken mixins and circular imports.

## Published types

- The package ships declarations (`"types": "dist/lib/index.d.ts"`), so the plugins don't need hand-written ones.
  `test-types/consumer.ts` uses the API the way the plugins do: when you add or change public API, use it there too.
- Devices are composed with `compose(Base, ...capabilities)` (`src/lib/things/compose.ts`): its type is `Base` plus the
  capabilities, so the declarations need no hand-written typings. Capabilities are named classes extending `Capability`
  (or `DeviceCapability`, to call the device): follow the rules in `src/lib/things/capability.ts`.
- Computed methods (e.g. `[util.inspect.custom]`) can't be named in the declarations: `Device` defines that one in its constructor.
- `VacuumDevice` is the union of the vacuum classes: only their shared API is available without narrowing
  (`instanceof Vacuum`…). Keep that shared API consistent across the classes (e.g. `cleanRooms` rejects when unsupported).

## Linting

- JSDoc is optional. When present, it must be correct (`check-param-names`, `require-param`, `check-tag-names`).
  In `.ts` files, types come from TypeScript, so JSDoc types are not allowed (`jsdoc/no-types`). In `.js` files, `@param {type}` is required (prefer converting a `.js` file to TypeScript when you change it).
- `console` is only allowed in `src/cli/**` and `scripts/**`. In the library, log with `createDebug(namespace)` from `src/lib/logger.ts`
  (not the `debug` package directly): it also forwards to the logger injected by the plugins (`device({ logger })` /
  `configureLogging`), and redacts tokens and passwords. Never log a token in full (use `maskToken`).

## Gotchas learned the hard way

- **Capabilities are copied, not inherited**: `device instanceof Children` is always `false`. Check `device.matches("cap:children")`.
  Their constructors never run: use `static initialState`, and the `capabilityPropertyUpdated` hook (not `propertyUpdated` + `super`).
- **Things use `#private` fields**: a fake made with `Object.create(Class.prototype)` can't use their accessors (e.g. the
  `id` setter). Define the properties directly (`Object.create(proto, { id: { value } })`).
- **Circular imports**: `device` → `management` → `connect_to_device` → `placeholder` → `device`. `management.ts` lazy-loads
  `connect_to_device` for that reason. Keep it that way.
- Vacuums extend `VacuumThing` (`type:vacuum`, also `type:miio:vacuum`); `isVacuum()` is `instanceof VacuumThing`.
  (abstract-things spelled it `vaccuum`: it was fixed in 0.15.0.)
- Roborock `get_status` / `get_consumable` respond with a single-item array (`[{...}]`).
- Properties whose mapped value is `undefined`/`null` are not stored on first load (`deep-equal` treats them as equal).
- Legacy Roborock models (`roborock.vacuum.*`, `rockrobo.vacuum.*`) speak the **legacy miIO** command set (`get_status`, `app_start`, …).
  Their MIoT specs on miot-spec.org are stubs, and their fan-speed values differ from the spec (and change with the firmware).

## Legacy Roborock

- Fan speeds / water levels of legacy miIO models live in `src/lib/devices/vacuums/vacuum_modes.ts` (`resolveVacuumModes(model, fw)`),
  moved from the plugins' `models/` folders. When a user reports wrong speeds, fix them **here**, with a test in `vacuum_modes.test.ts`.
- `Vacuum.fanSpeeds()` reads `fw_ver` from `miIO.info` once (some models changed their values in newer firmwares, e.g. S5 ≥ 3.5.7).
- All vacuum classes expose the same async `fanSpeeds()` / `waterBoxModes()` API returning `{ value, name }[]`.
  There's no "Off" entry: that's a plugin/UI concept.
- `cleanRooms(ids, { repeat })` only sends the object format (`[{ segments, repeat }]`) when `repeat > 1`, because older firmwares only accept the list.

## Device specs (MIoT)

- Model → URN: `https://miot-spec.org/miot-spec-v2/instances?status=all` (~7 MB). Prefer `released` and the highest `version`.
- Spec: `https://miot-spec.org/miot-spec-v2/instance?type=<urn>` (`services[].iid` = siid, `properties[].iid` = piid, `actions[].iid` = aiid).
- Translations: `https://miot-spec.org/instance/v2/multiLanguage?urn=<urn>`.
- home.miot-spec.com is a UI over the same data. Don't depend on it.

Implementation (`src/lib/miot/`):

- `spec_client.ts` (`MiotSpecClient`): resolves specs from `specDir` → fresh cache → network → stale cache → bundled snapshot.
  Configure it globally with `configureMiotSpecs({ offline, cacheDir, specDir, ttlMs })`. `MIIO_OFFLINE=1` and `MIIO_CACHE_DIR` also work.
- `miot_spec.ts` (`MiotSpecIndex`): lookups by **standard** (`miot-spec-v2`) names only. Vendor namespaces are ignored.
  Don't name files `spec.ts`/`*.spec.ts`: jest picks them up as test files.
- `miot_api.ts`: `getProperties` (batched by 10), `setProperty`, `callAction`. These throw `MiotError` when `code !== 0`.
- `devices/vacuums/miot-vacuum.ts` (`MiotVacuum`): spec-driven vacuum. Heuristics are based on a survey of all ~1,000 vacuum specs:
  - Many specs carry placeholder value-lists (`[Auto, Level1]`). Modes need ≥3 entries and a writable property.
  - Fan speed: first match of `fan-level`, `suction-level`, `mode` (unless its values are cleaning types like Sweep/Mop), `speed-level`.
  - Water: `mop-water-output-level`, `target-water-level`, `water-level`.
  - Cleaning type (`cleaningTypes()` / `setCleaningType()`): `sweep-mop-type` (Sweep / Mop / Sweep Mop / Sweep Before Mopping),
    or `mode` when all its values are sweep/mop types (e.g. ijai). Never the property used for the fan speed.
  - `vacuum:status` descriptions are translated by `normalizeState()` (`STATE_MAP`) to the `VACUUM_STATES` of
    `vacuum_states.ts`, the states shared by every vacuum class (each with a `VacuumActivity`, one per Matter RVC
    operational state). Anything else is `unknown-<code>` (`describeStatus(code)` gives its description).
    `src/lib/__fixtures__/miot/vacuum-statuses.json` lists every description on miot-spec.org, with the models using it
    and their Chinese translations, and a test fails if one isn't translated. Refresh it with `npm run snapshot` then
    `npm run snapshot:statuses`. `.github/workflows/refresh-status-fixture.yml` does it every month and opens a PR that
    merges itself once CI passes (it needs the `FIXTURE_PR_TOKEN` secret). When it fails, map the new descriptions there. The English is often terse or wrong: check the Chinese before mapping a description.
    When a description means something else on a few models, add them to `MODEL_STATE_OVERRIDES`.
  - The other vacuum classes must also report one of `VACUUM_STATES` (tested in `vacuum_states.test.ts`).
- Routing (`connect_to_device.ts`): `roborock.*` and `rockrobo.*` always use the legacy classes.
  Other `*.vacuum.*` models use `MiotVacuum` only if a spec exists **and** the device answers `get_properties` for `vacuum:status`.
  Otherwise they fall back to the previous behaviour (`ViomiVacuum` for `viomi.*`, `DreameVacuum` for `dreame.*`, `Vacuum` for the rest).
  - Viomi has both kinds of models. Older ones (v3/v6/v7/v8/v9/v10/v31) publish placeholder specs (`isPlaceholderSpec`) and stay on `ViomiVacuum`.
    Newer ones (e.g. v13, v18) are real MIoT devices: the legacy calls time out for them (homebridge issues #328, #443).
    The placeholder rule only applies to Viomi. For other brands a small spec can still be a genuine MIoT device.
  - Pinned in `models.ts`: `dreame.vacuum.mc1808` → `DreameVacuum`, `viomi.vacuum.v7`/`v8` → `ViomiVacuum`.
- Snapshot: `npm run snapshot` (`scripts/update-spec-snapshot.mjs`) writes `snapshots/vacuum-specs.json.gz` (~2 MB, every vacuum spec).
  It's gitignored and regenerated by the publish workflows, so every release carries a point-in-time copy for air-gapped setups.
- CLI: `node-miio spec <model> [--offline] [--json] [--spec-dir dir]`. Ask users for its output in bug reports.
- Test fixtures: real specs in `src/lib/__fixtures__/miot/<model>.json`.

## Licensing (important)

`node-miio` is MIT. [python-miio](https://github.com/rytilahti/python-miio) is **GPL-3.0**. Use it as a behavioural
reference only (which commands exist, what they do). **Never copy or translate its code, mappings or tables.**
Implement from the miot-spec data, protocol documentation (e.g. marcelrv/XiaomiRobotVacuumProtocol) and captured traffic.
Other projects (openHAB: EPL-2.0; hass-xiaomi-miot: Apache-2.0) need attribution if anything is reused. Prefer reimplementing.
Piotr Machowski's Xiaomi-cloud-tokens-extractor and Xiaomi-Cloud-Map-Extractor are **MIT**: they may be ported, keeping the
attribution header in the ported files (`src/lib/cloud/`) and the notice in `LICENSE.md`.

## Xiaomi Cloud (`src/lib/cloud/`)

Opt-in only: nothing in the local control paths may require the cloud. Tests use the fake server in
`cloud.test.mock.ts` (no network); the crypto is checked against vectors generated by the Python reference
(`__fixtures__/cloud/crypto-vectors.json`). Never log passwords, tokens, `ssecurity` or `serviceToken`.
