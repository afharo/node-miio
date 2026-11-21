# Contributing

Thank you for helping! The maintainer **only owns one of the supported devices**: changes are developed against
automated tests that replay what real devices answered, and they're validated by users on beta releases. So the most
valuable contributions don't need any code:

- [Become a beta tester](#become-a-beta-tester)
- [Share what your device reports](#share-what-your-device-reports)
- [Contributing code](#contributing-code)

## Become a beta tester

Most users run node-miio through a plugin. Sign up as a beta tester in the plugin you use, with your **model**,
**firmware version** and dock (if any). You'll be mentioned whenever a beta needs a device like yours:

- Homebridge: [homebridge-xiaomi-roborock-vacuum#1232](https://github.com/homebridge-xiaomi-roborock-vacuum/homebridge-xiaomi-roborock-vacuum/issues/1232)
- Matterbridge: [matterbridge-xiaomi-roborock#387](https://github.com/afharo/matterbridge-xiaomi-roborock/issues/387)

If you use node-miio directly, comment on [#18](https://github.com/afharo/node-miio/issues/18) instead. Betas are
published with the `beta` tag: `npm install node-miio@beta`.

## Share what your device reports

Supporting a model or a feature starts with knowing what the device answers. When opening an issue, include:

- [ ] The **model** and **firmware version**: `npx node-miio@latest protocol call <ip> miIO.info --token <token>` (the
      `model` and `fw_ver` fields).
- [ ] What you'd like to do, and **how you do it in the Mi Home app**.
- [ ] Raw captures:
  - Roborock (`roborock.vacuum.*`, `rockrobo.vacuum.*`):
    `npx node-miio@latest protocol call <ip> get_status --token <token>`. Ideally twice: before and after doing the
    action in the app, so we can see which field changes.
  - Any other brand (MIoT devices): `npx node-miio@latest spec <model>`.
- [ ] Whether you can test a beta.

Replies are turned into test fixtures (`src/lib/__fixtures__/`), so the behaviour stays covered without the device.

**Remove private data before posting**: the token (and any `ssecurity` / `serviceToken`), the serial number, the MAC and
IP addresses, your Wi-Fi name (`ssid`) and anything else that identifies your home.

## Contributing code

Pull requests are very welcome, too. Read [AGENTS.md](./AGENTS.md) first: it describes the layout, the commands, how to
test without hardware, and the gotchas (for humans as well).

- Open PRs from a feature branch against `main`, with a label (`enhancement`, `bug`, `dependencies`, `documentation`):
  the release notes are generated from them.
- Every behavioural change needs **unit tests**. Use `createFakeHandle(model, responses)` to replay device responses,
  ideally real captures from users.
- Before pushing: `npm run lint` (ESLint and Prettier, warnings fail too), `npm test` and `npm run build`.
- **Licensing**: node-miio is MIT. Don't copy or translate code, mappings or tables from GPL projects (e.g. python-miio).
  Using them as a reference for how a device behaves is fine.

## Code of conduct

Be kind and respectful. This project follows the
[Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Unacceptable behaviour can be
reported to the maintainer ([@afharo](https://github.com/afharo)).
