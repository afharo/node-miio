// Downloads the MIoT specs of every vacuum listed on miot-spec.org and writes them to a gzipped snapshot that is
// bundled with each release, so node-miio can resolve specs in air-gapped environments.
//
// Usage: node scripts/update-spec-snapshot.mjs [--out snapshots/vacuum-specs.json.gz] [--concurrency 4]
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { parseArgs } from "node:util";

const BASE_URL = "https://miot-spec.org/miot-spec-v2";
const DEVICE_TYPES = [":device:vacuum:", ":device:robot-cleaner:"];

const { values: args } = parseArgs({
  options: {
    out: { type: "string", default: "snapshots/vacuum-specs.json.gz" },
    concurrency: { type: "string", default: "4" },
  },
});

async function fetchJson(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "node-miio" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (attempt >= 4) throw new Error(`${url}: ${err.message}`);
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    return fetchJson(url, attempt + 1);
  }
}

/** Same selection rule as the runtime client: prefer `released`, then the highest version. */
function pickInstances(instances) {
  const byModel = new Map();
  for (const instance of instances) {
    if (!DEVICE_TYPES.some((t) => instance.type.includes(t))) continue;
    const current = byModel.get(instance.model);
    const rank = (i) => [i.status === "released" ? 1 : 0, i.version];
    if (
      !current ||
      rank(instance)[0] > rank(current)[0] ||
      (rank(instance)[0] === rank(current)[0] &&
        rank(instance)[1] > rank(current)[1])
    ) {
      byModel.set(instance.model, instance);
    }
  }
  return byModel;
}

const { instances } = await fetchJson(`${BASE_URL}/instances?status=all`);
const selected = pickInstances(instances);
const urns = [...new Set([...selected.values()].map((i) => i.type))];
console.log(`${selected.size} vacuum models, ${urns.length} unique specs`);

const specs = {};
const failed = [];
let next = 0;
async function worker() {
  while (next < urns.length) {
    const urn = urns[next++];
    try {
      specs[urn] = await fetchJson(
        `${BASE_URL}/instance?type=${encodeURIComponent(urn)}`,
      );
    } catch (err) {
      failed.push(urn);
      console.warn(`Failed: ${err.message}`);
    }
    // Be polite to miot-spec.org
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
await Promise.all(Array.from({ length: Number(args.concurrency) }, worker));

const models = {};
for (const [model, instance] of [...selected.entries()].sort()) {
  if (specs[instance.type]) models[model] = instance.type;
}

const snapshot = {
  generatedAt: new Date().toISOString(),
  source: BASE_URL,
  models,
  specs,
};
const out = resolve(args.out);
await mkdir(dirname(out), { recursive: true });
const data = gzipSync(JSON.stringify(snapshot), { level: 9 });
await writeFile(out, data);
console.log(
  `Wrote ${out}: ${Object.keys(models).length} models, ${Object.keys(specs).length} specs, ${(data.length / 1024).toFixed(0)} KiB (${failed.length} failed)`,
);
if (failed.length > urns.length * 0.05) {
  throw new Error("Too many failures, the snapshot is likely incomplete");
}
