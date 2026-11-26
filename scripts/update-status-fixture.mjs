// Lists every description of `vacuum:status` in the MIoT spec snapshot, with the models that use it and their Chinese
// translations, so the tests can check that node-miio translates all of them (see `STATE_MAP` in `miot-vacuum.ts`).
//
// Usage: node scripts/update-status-fixture.mjs [--snapshot snapshots/vacuum-specs.json.gz]
//        [--out src/lib/__fixtures__/miot/vacuum-statuses.json] [--concurrency 4]
// Run `npm run snapshot` first, to get a fresh snapshot.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { parseArgs } from "node:util";

const TRANSLATIONS_URL = "https://miot-spec.org/instance/v2/multiLanguage";

const { values: args } = parseArgs({
  options: {
    snapshot: { type: "string", default: "snapshots/vacuum-specs.json.gz" },
    out: {
      type: "string",
      default: "src/lib/__fixtures__/miot/vacuum-statuses.json",
    },
    concurrency: { type: "string", default: "4" },
  },
});

/**
 * Fetches the translations of a spec, retrying with exponential backoff.
 *
 * @param {string} urn The spec's URN
 * @param {number} attempt The current attempt (starts at 1)
 * @returns {Promise<Record<string, Record<string, string>>>} The translations, by language
 */
async function fetchTranslations(urn, attempt = 1) {
  try {
    const res = await fetch(`${TRANSLATIONS_URL}?urn=${urn}`, {
      headers: { "User-Agent": "node-miio" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).data ?? {};
  } catch (err) {
    if (attempt >= 4) {
      console.warn(`${urn}: ${err.message}`);
      return {};
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    return fetchTranslations(urn, attempt + 1);
  }
}

const snapshot = JSON.parse(gunzipSync(await readFile(resolve(args.snapshot))));
const modelsByUrn = {};
for (const [model, urn] of Object.entries(snapshot.models)) {
  (modelsByUrn[urn] ??= []).push(model);
}

const pad = (n) => String(n).padStart(3, "0");
/** @type {Map<string, { models: Set<string>, zh: Set<string> }>} */
const statuses = new Map();
const urns = Object.keys(snapshot.specs);
let next = 0;
/**
 * Collects the statuses of the next specs, until there are none left.
 */
async function worker() {
  while (next < urns.length) {
    const urn = urns[next++];
    const spec = snapshot.specs[urn];
    const vacuum = spec.services?.find((s) =>
      s.type.includes(":service:vacuum:"),
    );
    const status = vacuum?.properties?.find((p) =>
      p.type.includes(":property:status:"),
    );
    const list = status?.["value-list"];
    if (!list?.length) continue;
    const zh = (await fetchTranslations(urn)).zh_cn ?? {};
    list.forEach(({ value, description }, index) => {
      const entry = statuses.get(description) ?? {
        models: new Set(),
        zh: new Set(),
      };
      for (const model of modelsByUrn[urn] ?? []) {
        entry.models.add(`${model}=${value}`);
      }
      const key = `service:${pad(vacuum.iid)}:property:${pad(status.iid)}:valuelist:${pad(index)}`;
      if (zh[key]?.trim()) entry.zh.add(zh[key].trim());
      statuses.set(description, entry);
    });
    // Be polite to miot-spec.org
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
await Promise.all(Array.from({ length: Number(args.concurrency) }, worker));

const sorted = [...statuses.entries()].sort(([a], [b]) => a.localeCompare(b));
// One line per description, to keep the diffs readable
const lines = sorted.map(
  ([description, { models, zh }]) =>
    `    ${JSON.stringify(description)}: ${JSON.stringify({ zh: [...zh].sort(), models: [...models].sort() })}`,
);
const out = resolve(args.out);
await writeFile(
  out,
  `{
  "generatedAt": ${JSON.stringify(snapshot.generatedAt)},
  "source": ${JSON.stringify(snapshot.source)},
  "statuses": {
${lines.join(",\n")}
  }
}
`,
);
console.log(`Wrote ${out}: ${sorted.length} descriptions`);
