# Xiaomi Cloud (opt-in)

node-miio controls devices **locally**. The Xiaomi Cloud is only used when you ask for it, to:

- **get the tokens** of the devices in your Xiaomi account (no more token-extraction scripts);
- (coming next) download the **map** of a vacuum, to know which room it's cleaning.

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

# Delete the saved session
npx node-miio cloud logout
```

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
