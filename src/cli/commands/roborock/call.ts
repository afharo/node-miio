import type { CommandBuilder } from "yargs";

import {
  RoborockError,
  RoborockLocalConnection,
} from "../../../lib/roborock/index";
import { log } from "../../log";

import { findRobot, robotOptions } from "./robot";

export const command = "call <method> [params]";
export const description =
  "Call a method on a robot over the local network (e.g. get_status), and print the result";
export const builder: CommandBuilder = {
  ...robotOptions,
};

export const handler = async (argv: {
  method: string;
  params?: string;
  ip: string;
  duid?: string;
}) => {
  let connection: RoborockLocalConnection | undefined;
  try {
    const params = argv.params ? JSON.parse(argv.params) : [];
    const found = await findRobot(argv.duid);
    if (!found) {
      process.exitCode = 1;
      return;
    }
    connection = new RoborockLocalConnection({
      address: argv.ip,
      localKey: found.robot.localKey,
    });
    const result = await connection.call(argv.method, params);
    log.info(
      `${found.robot.name} (local protocol ${connection.protocolVersion}):`,
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    log.error(
      err instanceof RoborockError || err instanceof SyntaxError
        ? err.message
        : String(err),
    );
    process.exitCode = 1;
  } finally {
    connection?.close();
  }
};
