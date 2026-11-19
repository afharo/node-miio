// Type-checks `test-types/consumer.ts` against the published types: `node-miio` resolves (through a symlink) to this
// package, using its `types` field, like it does for the plugins. Run `npm run build` first.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const modules = `${root}/test-types/node_modules`;
rmSync(modules, { recursive: true, force: true });
mkdirSync(modules, { recursive: true });
symlinkSync(root, `${modules}/node-miio`, "dir");
try {
  execFileSync(
    process.execPath,
    [
      `${root}/node_modules/typescript/bin/tsc`,
      "-p",
      `${root}/test-types/tsconfig.json`,
    ],
    { stdio: "inherit" },
  );
} finally {
  rmSync(modules, { recursive: true, force: true });
}
