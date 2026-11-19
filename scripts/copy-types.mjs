// Ships the hand-written declarations of the dependencies without types (abstract-things) with the compiled output,
// and references them from the entry point, so `import ... from "node-miio"` is fully typed for consumers.
import { cpSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
cpSync(`${root}/src/types`, `${root}/dist/types`, { recursive: true });

const entry = `${root}/dist/lib/index.d.ts`;
const references = readdirSync(`${root}/dist/types`, { recursive: true })
  .filter((file) => String(file).endsWith(".d.ts"))
  .sort()
  .map(
    (file) =>
      `/// <reference path="../types/${String(file).replaceAll("\\", "/")}" />`,
  );
writeFileSync(
  entry,
  `${references.join("\n")}\n${readFileSync(entry, "utf8")}`,
);
