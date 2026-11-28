import type { CommandBuilder } from "yargs";

import { log } from "../../log.js";

import { connectRobot, robotOptions, type ConnectedRobot } from "./robot.js";

export const command = "call <method> [params]";
export const description =
  "Call a method on a robot (e.g. get_status), and print the result";
export const builder: CommandBuilder = {
  ...robotOptions,
};

export const handler = async (argv: {
  method: string;
  params?: string;
  ip?: string;
  duid?: string;
}) => {
  let connected: ConnectedRobot | undefined;
  try {
    const params = argv.params ? JSON.parse(argv.params) : [];
    connected = await connectRobot(argv);
    if (!connected) {
      process.exitCode = 1;
      return;
    }
    const result = await connected.api.call(argv.method as never, params);
    const { api } = connected;
    log.info(
      `${connected.robot.name} (${api.transport === "local" ? `local, ${api.address}, protocol ${api.localProtocolVersion}` : "MQTT"}):`,
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    log.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  } finally {
    await connected?.close();
  }
};
