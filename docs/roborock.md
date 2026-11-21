# Roborock app accounts (experimental)

Robots paired with the **Roborock app** (instead of Mi Home) are registered on Roborock's own cloud, not Xiaomi's.
Their miIO token doesn't work: instead, each robot has a `localKey` that encrypts its local (TCP port 58867) and
MQTT messages. The Roborock account gives the `localKey` of every robot.

Status: node-miio can log in, list the robots and control them with the existing `Vacuum` class: over the local
network (TCP 58867) when possible, else through Roborock's cloud (MQTT), which also finds the robot's IP and sends its
status pushes. Next: maps
([homebridge-xiaomi-roborock-vacuum#104](https://github.com/homebridge-xiaomi-roborock-vacuum/homebridge-xiaomi-roborock-vacuum/issues/104)).

## Command line

```sh
npx node-miio roborock login     # asks for your email, then for the code Roborock emails you
npx node-miio roborock devices   # name, model, protocol version, firmware, duid and (masked) local key
npx node-miio roborock rooms                 # the map's rooms, named as in the Roborock app
npx node-miio roborock call get_status       # any method, e.g. get_consumable, get_room_mapping
npx node-miio roborock logout
```

`rooms` and `call` ask the robot for its IP through Roborock's cloud, then talk to it locally (or through the cloud
if it can't be reached locally). Pass `--ip` to skip the cloud lookup. With several robots, choose one with `--duid`
(from `roborock devices`).

`devices --json` prints JSON; `--show-keys` shows the local keys in full. The session is saved, readable only by
you, in `roborock-session.json` next to the Xiaomi Cloud session (see `MIIO_CONFIG_DIR` in [Xiaomi Cloud](cloud.md)).
It's as sensitive as a password.

The **protocol version** of `roborock devices` tells which robots node-miio can control:

- `1.0` and `L01`: the same commands as miIO (`get_status`, `app_start`, `app_segment_clean`…). Most S, Q and Saros robots.
- `A01` and `B01`: different command sets (e.g. the Q7/Q10 series, Dyad/Zeo). Not planned yet.

Locally, robots speak `1.0` (AES-ECB) or `L01` (AES-GCM), which may differ from that version: the Saros 20
(`roborock.vacuum.a296`, `pv` 1.0) only answers `L01`. node-miio tries both and remembers the one that works. Robots
drop requests whose sequence number isn't higher than the previous one.

Roborock limits logins and code requests: avoid running `login` repeatedly.

## Library

```ts
import {
  RoborockLogin,
  RoborockMqttSession,
  RoborockWebApi,
  roborockDevice,
  roomNames,
  saveRoborockSession,
  toDevices,
} from "node-miio";

const login = await RoborockLogin.start("me@example.com");
await login.requestCode();
const session = await login.loginWithCode(codeFromTheEmail);
await saveRoborockSession(session);

const home = await new RoborockWebApi(session).getHomeData();
const [robot] = toDevices(home);
// { duid, name, model: "roborock.vacuum.a296", protocolVersion: "1.0", localKey, shared, … }

// One MQTT session per account, shared by its robots
const mqtt = new RoborockMqttSession(session.userData.rriot);

// A `Vacuum`, like the ones of `device()`. Local when possible (`address` is optional with `mqtt`), else MQTT.
const vacuum = await roborockDevice({
  ...robot,
  model: robot.model,
  mqtt,
  localProtocolVersion: savedVersion, // optional: what `vacuum.handle.api.localProtocolVersion` was last time
});
console.log(await vacuum.batteryLevel(), vacuum.property("state"));
const rooms = roomNames(await vacuum.getRoomMap(), home.rooms); // [{ segmentId: 1, roomId, name: "Kitchen" }, …]
await vacuum.cleanRooms([rooms[0].segmentId]);
await vacuum.destroy();
await mqtt.close();
```

The robot's status pushes (over both connections) refresh the device's properties, so `stateChanged` events come
without waiting for the next poll.

## Credits

The account endpoints, the message format (`1.0` and `L01`) and the MQTT topics follow [python-roborock](https://github.com/Python-roborock/python-roborock) (Apache-2.0),
which documents Roborock's API. No code is copied from it.
