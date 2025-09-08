"use strict";

import type { CommandBuilder } from "yargs";

import { log } from "../../log";
import { Packet } from "../../../lib/packet";

export const command = "packet <hexData>";
export const description = "Decode a miIO UDP packet";
export const builder: CommandBuilder = {
  token: {
    demandOption: true,
    description: "Token to use for decoding",
    string: true,
  },
};

export const handler = function (argv: { token: string; hexData: string }) {
  const packet = new Packet();
  packet.token = Buffer.from(argv.token, "hex");

  const raw = Buffer.from(argv.hexData, "hex");
  packet.raw = raw;

  const data = packet.data;
  if (!data) {
    log.error(
      "Could not extract data from packet, check your token and packet data",
    );
  } else {
    log.plain("Hex: ", data.toString("hex"));
    log.plain("String: ", data.toString());
  }
};
