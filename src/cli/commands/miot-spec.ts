import type { CommandBuilder } from "yargs";

import { MiotSpecClient } from "../../lib/miot/spec_client.js";
import { MiotSpecIndex, parseUrn } from "../../lib/miot/miot_spec.js";
import { isSupportedMiotVacuum } from "../../lib/devices/vacuums/miot-vacuum.js";

export const command = "spec <model>";
export const description =
  "Show the MIoT spec of a model (from miot-spec.org, the cache or the bundled snapshot)";
export const builder: CommandBuilder = {
  offline: {
    type: "boolean",
    description: "Don't use the network (cache and bundled snapshot only)",
  },
  json: {
    type: "boolean",
    description: "Print the raw spec as JSON",
  },
  "spec-dir": {
    type: "string",
    description: "Directory with user-provided specs (<model>.json)",
  },
};

export const handler = async (argv: {
  model: string;
  offline?: boolean;
  json?: boolean;
  specDir?: string;
}) => {
  const client = new MiotSpecClient({
    offline: argv.offline,
    specDir: argv.specDir,
  });
  const resolved = await client.getSpec(argv.model);
  if (!resolved) {
    console.error(`No MIoT spec found for ${argv.model}`);
    process.exitCode = 1;
    return;
  }

  if (argv.json) {
    console.log(JSON.stringify(resolved.spec, null, 2));
    return;
  }

  console.log(`Model:  ${resolved.model}`);
  console.log(`URN:    ${resolved.urn}`);
  console.log(`Source: ${resolved.source}`);
  console.log(
    `Supported as a MIoT vacuum: ${isSupportedMiotVacuum(resolved.spec) ? "yes" : "no"}`,
  );
  console.log();

  const index = new MiotSpecIndex(resolved.spec);
  for (const service of index.spec.services) {
    const urn = parseUrn(service.type);
    console.log(`[siid ${service.iid}] ${urn.name} (${urn.namespace})`);
    for (const p of service.properties ?? []) {
      const values = p["value-list"]
        ?.map((v) => `${v.value}=${v.description}`)
        .join(", ");
      const range = p["value-range"] ? `[${p["value-range"].join(", ")}]` : "";
      console.log(
        `    piid ${p.iid}  ${parseUrn(p.type).name}  ${p.format} ${p.access.join("/")} ${values ? `{${values}}` : range}`,
      );
    }
    for (const a of service.actions ?? []) {
      console.log(
        `    aiid ${a.iid}  ${parseUrn(a.type).name}()${a.in.length ? ` in: [${a.in.join(", ")}]` : ""}`,
      );
    }
  }
};
