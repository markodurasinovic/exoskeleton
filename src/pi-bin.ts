import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const PACKAGE = "@earendil-works/pi-coding-agent";
const SEGMENTS = ["node_modules", "@earendil-works", "pi-coding-agent"];

/**
 * Finds the pi that exo depends on — not whatever `pi` happens to be on PATH.
 *
 * A plain `import.meta.resolve` would be shorter, but it is not available in
 * every loader exo runs under, and pi's exports map has no `require`
 * condition. Walking up for `node_modules/@earendil-works/pi-coding-agent`
 * works with flat, nested, and pnpm-symlinked layouts.
 */
export function resolvePiEntry(start = import.meta.dirname): string {
  let dir = start;

  for (;;) {
    const root = join(dir, ...SEGMENTS);
    const manifest = join(root, "package.json");
    if (existsSync(manifest)) {
      const pkg = JSON.parse(readFileSync(manifest, "utf8")) as { bin?: string | Record<string, string> };
      const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.pi;
      if (!bin) throw new Error(`exo: ${PACKAGE} declares no \`pi\` binary`);
      const entry = join(root, bin);
      if (!existsSync(entry)) throw new Error(`exo: expected pi at ${entry}`);
      return entry;
    }

    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`exo: ${PACKAGE} is not installed. Run \`npm install\` where exo is installed.`);
    }
    dir = parent;
  }
}
