import type { CommandBuilder } from "yargs";

import {
  defaultRoborockSessionFile,
  RoborockError,
  RoborockLogin,
  saveRoborockSession,
} from "../../../lib/roborock/index";
import { log } from "../../log";
import { prompt } from "../../prompt";

export const command = "login";
export const description =
  "Log in to your Roborock app account with a code sent by email (the session is saved)";
export const builder: CommandBuilder = {
  email: {
    type: "string",
    description: "The email of the Roborock account (asked if not given)",
  },
};

export const handler = async (argv: { email?: string }) => {
  try {
    const email = argv.email || (await prompt("Roborock account email: "));
    const login = await RoborockLogin.start(email);
    await login.requestCode();
    log.info(`Roborock sent a verification code to ${email}.`);
    const code = await prompt("Verification code: ");
    const session = await login.loginWithCode(code);
    await saveRoborockSession(session);
    log.info(`Logged in (server ${session.baseUrl}).`);
    log.plain(
      `Session saved to ${defaultRoborockSessionFile()} (readable only by you).`,
    );
    log.plain("Next: node-miio roborock devices");
  } catch (err) {
    log.error(err instanceof RoborockError ? err.message : String(err));
    process.exitCode = 1;
  }
};
