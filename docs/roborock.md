# Roborock app accounts (experimental)

Robots paired with the **Roborock app** (instead of Mi Home) are registered on Roborock's own cloud, not Xiaomi's.
Their miIO token doesn't work: instead, each robot has a `localKey` that encrypts its local (TCP port 58867) and
MQTT messages. The Roborock account gives the `localKey` of every robot.

Status: node-miio can log in and list the robots. Controlling them is the next step
([homebridge-xiaomi-roborock-vacuum#104](https://github.com/homebridge-xiaomi-roborock-vacuum/homebridge-xiaomi-roborock-vacuum/issues/104)).

## Command line

```sh
npx node-miio roborock login     # asks for your email, then for the code Roborock emails you
npx node-miio roborock devices   # name, model, protocol version, firmware, duid and (masked) local key
npx node-miio roborock logout
```

`devices --json` prints JSON; `--show-keys` shows the local keys in full. The session is saved, readable only by
you, in `roborock-session.json` next to the Xiaomi Cloud session (see `MIIO_CONFIG_DIR` in [Xiaomi Cloud](cloud.md)).
It's as sensitive as a password.

The **protocol version** tells which robots node-miio will be able to control:

- `1.0` and `L01`: the same commands as miIO (`get_status`, `app_start`, `app_segment_clean`…). Most S, Q and Saros robots.
- `A01` and `B01`: different command sets (e.g. the Q7/Q10 series, Dyad/Zeo). Not planned yet.

Roborock limits logins and code requests: avoid running `login` repeatedly.

## Library

```ts
import { RoborockLogin, RoborockWebApi, saveRoborockSession } from "node-miio";

const login = await RoborockLogin.start("me@example.com");
await login.requestCode();
const session = await login.loginWithCode(codeFromTheEmail);
await saveRoborockSession(session);

const devices = await new RoborockWebApi(session).getDevices();
// [{ duid, name, model: "roborock.vacuum.a296", protocolVersion: "1.0", localKey, shared, … }]
```

## Credits

The account endpoints follow [python-roborock](https://github.com/Python-roborock/python-roborock) (Apache-2.0),
which documents Roborock's API. No code is copied from it.
