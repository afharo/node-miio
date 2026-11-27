import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockedFunction,
} from "vitest";

import p2008 from "../__fixtures__/miot/dreame.vacuum.p2008.json";

import {
  DEFAULT_SNAPSHOT_PATH,
  configureMiotSpecs,
  getMiotSpecClient,
  type MiotInstance,
  MiotSpecClient,
  pickInstance,
} from "./spec_client";

vi.mock("debug", () => ({ default: vi.fn(() => vi.fn()) }));

const MODEL = "dreame.vacuum.p2008";
const URN = p2008.type;
const OLD_URN = "urn:miot-spec-v2:device:vacuum:0000A006:dreame-p2008:1";

const instances: MiotInstance[] = [
  { model: MODEL, type: OLD_URN, status: "released", version: 1 },
  { model: MODEL, type: URN, status: "released", version: 2 },
  {
    model: "other.vacuum.x",
    type: "urn:other",
    status: "released",
    version: 1,
  },
];

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => body,
  } as Response;
}

function createFetch() {
  return vi.fn(async (url: string) => {
    if (url.includes("/instances?")) return jsonResponse({ instances });
    if (url.includes(encodeURIComponent(URN))) return jsonResponse(p2008);
    return jsonResponse({}, 404);
  }) as unknown as MockedFunction<typeof fetch>;
}

function failingFetch() {
  return vi.fn(async () => {
    throw new Error("network down");
  }) as unknown as MockedFunction<typeof fetch>;
}

let tmp: string;
let cacheDir: string;
let snapshotPath: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "node-miio-spec-"));
  cacheDir = path.join(tmp, "cache");
  snapshotPath = path.join(tmp, "snapshot.json.gz");
  delete process.env.MIIO_OFFLINE;
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function writeSnapshot() {
  fs.writeFileSync(
    snapshotPath,
    gzipSync(
      JSON.stringify({
        generatedAt: "2026-11-18T00:00:00.000Z",
        source: "test",
        models: { [MODEL]: URN },
        specs: { [URN]: p2008 },
      }),
    ),
  );
}

describe("pickInstance", () => {
  test("prefers released over debug, then the highest version", () => {
    expect(
      pickInstance(
        [
          { model: "m", type: "a", status: "released", version: 1 },
          { model: "m", type: "b", status: "debug", version: 3 },
          { model: "m", type: "c", status: "released", version: 2 },
        ],
        "m",
      )?.type,
    ).toBe("c");
  });

  test("falls back to non-released specs", () => {
    expect(
      pickInstance(
        [{ model: "m", type: "a", status: "debug", version: 1 }],
        "m",
      )?.type,
    ).toBe("a");
  });

  test("returns undefined for unknown models", () => {
    expect(pickInstance(instances, "unknown")).toBeUndefined();
  });
});

describe("MiotSpecClient", () => {
  test("downloads the latest released spec and caches it", async () => {
    const fetchMock = createFetch();
    const client = new MiotSpecClient({
      cacheDir,
      snapshotPath,
      fetch: fetchMock,
    });

    await expect(client.getSpec(MODEL)).resolves.toMatchObject({
      urn: URN,
      source: "network",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // A new client (e.g. after a restart) uses the cache
    const offlineFetch = failingFetch();
    const client2 = new MiotSpecClient({
      cacheDir,
      snapshotPath,
      fetch: offlineFetch,
    });
    await expect(client2.getSpec(MODEL)).resolves.toMatchObject({
      urn: URN,
      source: "cache",
    });
    expect(offlineFetch).not.toHaveBeenCalled();
  });

  test("downloads the list of instances only once", async () => {
    const fetchMock = createFetch();
    const client = new MiotSpecClient({
      cacheDir: false,
      snapshotPath,
      fetch: fetchMock,
    });
    await client.getSpec(MODEL);
    await client.getSpec("unknown.vacuum.model");
    const instanceCalls = fetchMock.mock.calls.filter(([url]) =>
      `${url}`.includes("/instances?"),
    );
    expect(instanceCalls).toHaveLength(1);
  });

  test("refreshes stale cache entries from the network", async () => {
    await new MiotSpecClient({
      cacheDir,
      snapshotPath,
      fetch: createFetch(),
    }).getSpec(MODEL);
    const fetchMock = createFetch();
    const client = new MiotSpecClient({
      cacheDir,
      snapshotPath,
      ttlMs: -1,
      fetch: fetchMock,
    });
    await expect(client.getSpec(MODEL)).resolves.toMatchObject({
      source: "network",
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  test("uses the stale cache when the network fails", async () => {
    await new MiotSpecClient({
      cacheDir,
      snapshotPath,
      fetch: createFetch(),
    }).getSpec(MODEL);
    const client = new MiotSpecClient({
      cacheDir,
      snapshotPath,
      ttlMs: -1,
      fetch: failingFetch(),
    });
    await expect(client.getSpec(MODEL)).resolves.toMatchObject({
      urn: URN,
      source: "stale-cache",
    });
  });

  test("falls back to the bundled snapshot when the network fails", async () => {
    writeSnapshot();
    const client = new MiotSpecClient({
      cacheDir,
      snapshotPath,
      fetch: failingFetch(),
    });
    await expect(client.getSpec(MODEL)).resolves.toMatchObject({
      urn: URN,
      source: "snapshot",
    });
    expect(client.snapshotInfo()).toEqual({
      generatedAt: "2026-11-18T00:00:00.000Z",
      models: 1,
    });
  });

  test("offline: never uses the network", async () => {
    writeSnapshot();
    const fetchMock = createFetch();
    const client = new MiotSpecClient({
      offline: true,
      cacheDir,
      snapshotPath,
      fetch: fetchMock,
    });
    await expect(client.getSpec(MODEL)).resolves.toMatchObject({
      source: "snapshot",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each(["1", "true", "TRUE"])(
    "MIIO_OFFLINE=%s enables the offline mode",
    async (value) => {
      process.env.MIIO_OFFLINE = value;
      const fetchMock = createFetch();
      const client = new MiotSpecClient({
        cacheDir,
        snapshotPath,
        fetch: fetchMock,
      });
      await expect(client.getSpec(MODEL)).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  test("user-provided specs take precedence", async () => {
    const specDir = path.join(tmp, "specs");
    fs.mkdirSync(specDir);
    const custom = { ...p2008, type: "urn:custom" };
    fs.writeFileSync(
      path.join(specDir, `${MODEL}.json`),
      JSON.stringify(custom),
    );
    const fetchMock = createFetch();
    const client = new MiotSpecClient({
      specDir,
      cacheDir,
      snapshotPath,
      fetch: fetchMock,
    });
    await expect(client.getSpec(MODEL)).resolves.toMatchObject({
      urn: "urn:custom",
      source: "spec-dir",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("returns undefined when no source knows the model", async () => {
    const client = new MiotSpecClient({
      cacheDir,
      snapshotPath,
      fetch: createFetch(),
    });
    await expect(
      client.getSpec("unknown.vacuum.model"),
    ).resolves.toBeUndefined();
  });

  test("handles HTTP errors", async () => {
    writeSnapshot();
    const fetchMock = vi.fn(async () =>
      jsonResponse({}, 500),
    ) as unknown as typeof fetch;
    const client = new MiotSpecClient({
      cacheDir,
      snapshotPath,
      fetch: fetchMock,
    });
    await expect(client.getSpec(MODEL)).resolves.toMatchObject({
      source: "snapshot",
    });
  });

  test("ignores a missing or corrupted snapshot", async () => {
    fs.writeFileSync(snapshotPath, "not gzip");
    const client = new MiotSpecClient({
      offline: true,
      cacheDir,
      snapshotPath,
    });
    await expect(client.getSpec(MODEL)).resolves.toBeUndefined();
    expect(client.snapshotInfo()).toBeUndefined();
  });
});

test("the bundled snapshot is expected at <package root>/snapshots", () => {
  const packageRoot = path.resolve(__dirname, "../../..");
  expect(path.relative(packageRoot, DEFAULT_SNAPSHOT_PATH)).toBe(
    path.join("snapshots", "vacuum-specs.json.gz"),
  );
});

describe("configureMiotSpecs", () => {
  test("replaces the shared client", () => {
    const before = getMiotSpecClient();
    configureMiotSpecs({ offline: true });
    expect(getMiotSpecClient()).not.toBe(before);
    expect(getMiotSpecClient()).toBe(getMiotSpecClient());
  });
});
