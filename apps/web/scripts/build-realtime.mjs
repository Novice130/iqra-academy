#!/usr/bin/env node
/**
 * Bundles the realtime sidecar (src/realtime/server/main.ts) into one
 * self-contained file, dist/realtime-server.mjs, that runs with plain `node`
 * and needs no node_modules beside it.
 *
 * esbuild rather than tsc because the sidecar shares source with the Next app
 * (the hub, the ticket code) through the `@/` alias, and the app's tsconfig
 * is noEmit.
 */
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outfile = path.join(root, "dist", "realtime-server.mjs");

await build({
  entryPoints: [path.join(root, "src/realtime/server/main.ts")],
  outfile,
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  alias: { "@": path.join(root, "src") },
  // `ws` is CommonJS and require()s Node built-ins; an ESM bundle has no
  // `require` unless we give it one.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);",
  },
  // Optional native accelerators for `ws`. It require()s them inside a
  // try/catch and carries on without; bundling would make them mandatory.
  external: ["bufferutil", "utf-8-validate"],
  legalComments: "none",
  logLevel: "info",
});

console.log(`✅ Realtime sidecar bundled to ${path.relative(root, outfile)}`);
