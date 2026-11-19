import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { CommandBuilder } from "yargs";

import {
  CloudError,
  defaultSessionFile,
  saveSession,
  XiaomiCloud,
} from "../../../lib/cloud/index";
import { log } from "../../log";
import { prompt } from "../../prompt";

export const command = "login";
export const description =
  "Log in to the Xiaomi Cloud (the session is saved, your password is not)";
export const builder: CommandBuilder = {
  qr: {
    type: "boolean",
    description:
      "Log in by scanning a QR code with the Mi Home app (no password)",
  },
  username: {
    type: "string",
    description: "Email, phone number or Xiaomi user ID (asked if not given)",
  },
};

export const handler = async (argv: { qr?: boolean; username?: string }) => {
  try {
    const cloud = argv.qr
      ? await XiaomiCloud.loginWithQrCode({
          onQrCode: ({ imageUrl, loginUrl, timeoutMs }) => {
            log.info(
              "Scan this QR code with the Mi Home app (Profile → Scan):",
            );
            log.plain(`  ${imageUrl}`);
            log.plain("Or open this page and scan the QR code shown:");
            log.plain(`  ${loginUrl}`);
            log.plain(
              `Waiting up to ${Math.round(timeoutMs / 60000)} minutes…`,
            );
          },
        })
      : await XiaomiCloud.loginWithPassword(
          argv.username ||
            (await prompt("Username (email, phone or user ID): ")),
          await prompt("Password (not displayed): ", { hidden: true }),
          {
            solveCaptcha: async (image) => {
              const file = path.join(
                os.tmpdir(),
                `node-miio-captcha-${Date.now()}.jpg`,
              );
              await fs.writeFile(file, image);
              log.warn(`Xiaomi asks to solve a captcha. Open ${file}`);
              return prompt("Captcha (case-sensitive): ");
            },
            getVerificationCode: () => {
              log.warn("Xiaomi sent a verification code to your email.");
              return prompt("Verification code: ");
            },
          },
        );
    await saveSession(cloud.session);
    log.info(`Logged in as user ${cloud.session.userId}.`);
    log.plain(
      `Session saved to ${defaultSessionFile()} (readable only by you).`,
    );
    log.plain("Next: node-miio cloud devices");
  } catch (err) {
    log.error(err instanceof CloudError ? err.message : String(err));
    process.exitCode = 1;
  }
};
