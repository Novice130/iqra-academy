#!/usr/bin/env node
/**
 * Custom Cloudflare deploy script that:
 * 1. Runs the full @opennextjs/cloudflare build (which internally calls next build + bundling)
 * 2. If bundling fails due to styled-jsx, patches the dist/index.js and retries bundling
 * 3. Deploys with wrangler
 */
const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const PATCH_PATHS = [
  ".open-next/server-functions/default/node_modules/styled-jsx/dist",
  ".open-next/node_modules/styled-jsx/dist",
];

function patchStyledJsx() {
  let patched = false;
  for (const distPath of PATCH_PATHS) {
    const absDistPath = path.join(root, distPath);
    const indexFile = path.join(absDistPath, "index.js");
    const indexDir = path.join(absDistPath, "index");
    if (fs.existsSync(absDistPath) && fs.existsSync(indexDir) && !fs.existsSync(indexFile)) {
      console.log(`🩹 Patching styled-jsx at ${distPath}...`);
      fs.writeFileSync(indexFile, "module.exports = require('./index/index');\n");
      patched = true;
    }
  }
  return patched;
}

// Step 1: Run full opennext build (includes next build + bundling)
console.log("🔨 Running @opennextjs/cloudflare build...");
const buildResult = spawnSync(
  "npx",
  ["@opennextjs/cloudflare", "build"],
  { stdio: "inherit", cwd: root, shell: true }
);

if (buildResult.status === 0) {
  console.log("✅ Build succeeded! Deploying...");
} else {
  // Step 2: Patch styled-jsx and retry
  console.log("⚠️  Build failed — attempting styled-jsx patch and retry...");
  const patched = patchStyledJsx();

  if (!patched) {
    console.error("❌ Could not find styled-jsx dist to patch. Build failed.");
    process.exit(1);
  }

  // Step 3: Re-run only the wrangler deploy (Next.js build output is already there)
  // We need to re-run the bundle step — call opennext build again; it will skip next build
  // if .next already exists. Actually, let's just patch and redeploy using wrangler directly
  // after manually creating the worker bundle.
  
  // Re-run the full build once more with the patch in place
  console.log("🔄 Retrying build with patch...");
  const retryResult = spawnSync(
    "npx",
    ["@opennextjs/cloudflare", "build"],
    { stdio: "inherit", cwd: root, shell: true }
  );

  if (retryResult.status !== 0) {
    console.error("❌ Build failed after patching.");
    process.exit(1);
  }
}

// Step 4: Deploy with wrangler
console.log("🚀 Deploying to Cloudflare Workers...");
const deployResult = spawnSync("npx", ["wrangler", "deploy"], {
  stdio: "inherit",
  cwd: root,
  shell: true,
});

process.exit(deployResult.status ?? 0);
