# Xiaomi Cloud (opt-in)

node-miio controls devices **locally**. The Xiaomi Cloud is only used when you ask for it, to:

- **get the tokens** of the devices in your Xiaomi account (no more token-extraction scripts);
- download the **map** of a Roborock vacuum, to know which room it's cleaning (see `MapWatcher`).

## Command line

```sh
# Log in by scanning a QR code with the Mi Home app (no password needed)
npx node-miio cloud login --qr

# …or with your username and password (Xiaomi may ask for a captcha or an emailed verification code)
npx node-miio cloud login

# List your devices, with their IP, ID and token
npx node-miio cloud devices
npx node-miio cloud devices --server de --json
npx node-miio cloud devices --save   # store the tokens for the other node-miio commands

# Download a Roborock vacuum's map: rooms, robot position and the room it's in
npx node-miio cloud map <device ID or IP>
npx node-miio cloud map 192.168.1.20 --out map.bin.gz   # also save the raw map (to attach it to a bug report)

# Delete the saved session
npx node-miio cloud logout
```

The tokens saved with `--save` (or `tokens update`) are used by the commands that connect to a device (`control`,
`protocol call`, `inspect`…) when you don't pass `--token`. They're saved to `tokens.json` in node-miio's config
directory (next to the session, see below), readable only by you. Tokens saved by older versions (in
`.node-persist/storage` under the directory the command ran from) are moved there the first time they're used.

Your password is never stored, and it's never sent in plain text: only its MD5 hash is sent, like the Mi Home app
does. The **session** is saved to `cloud-session.json` in node-miio's config directory, readable only by you:

- macOS: `~/Library/Application Support/node-miio`
- Linux: `$XDG_CONFIG_HOME/node-miio` (`~/.config/node-miio`)
- Windows: `%APPDATA%\node-miio`
- or `MIIO_CONFIG_DIR`

Treat that file like a password: anyone with it can access your Xiaomi account.

The servers are `cn`, `de`, `us`, `ru`, `tw`, `sg`, `in` and `i2`. Without `--server`, all of them are checked.

## API

```ts
import {
  XiaomiCloud,
  loadSession,
  saveSession,
  CloudSessionExpiredError,
} from "node-miio";

const cloud = await XiaomiCloud.loginWithQrCode({
  onQrCode: ({ imageUrl, loginUrl }) =>
    console.log(`Scan ${imageUrl} (or open ${loginUrl})`),
});
// or: await XiaomiCloud.loginWithPassword(username, password, { solveCaptcha, getVerificationCode })
await saveSession(cloud.session);

// Later: reuse the session
const session = await loadSession();
const devices = await new XiaomiCloud(session!).getDevices({ servers: ["de"] });
// [{ did, name, model, token, localip, mac, server, homeId, homeOwner }]
```

To share the device list (e.g. between the devices of a Homebridge or Matterbridge platform), use
`CloudDeviceCache`: it lists the devices once, and finds them by ID, token or IP.

```ts
import { CloudDeviceCache, MapWatcher } from "node-miio";

const devices = new CloudDeviceCache(cloud);
const robot = await devices.find({ ip: "192.168.1.20" }); // { token, server, … }
const watcher = new MapWatcher(vacuum, cloud, { server: robot!.server });
```

Errors:

- `CloudAuthError`: wrong credentials, captcha or verification code.
- `CloudCaptchaRequiredError` / `CloudTwoFactorRequiredError`: Xiaomi asks for a captcha / an emailed code and no
  callback was provided. They include the `captchaUrl` / `notificationUrl`.
- `CloudSessionExpiredError`: log in again.
- `CloudApiError`: any other API error (`code`).

## Credits

The login flows and the API's request signing are ported from
[Xiaomi-cloud-tokens-extractor](https://github.com/PiotrMachowski/Xiaomi-cloud-tokens-extractor) and
[Xiaomi-Cloud-Map-Extractor](https://github.com/PiotrMachowski/Home-Assistant-custom-components-Xiaomi-Cloud-Map-Extractor)
by Piotr Machowski (MIT).
