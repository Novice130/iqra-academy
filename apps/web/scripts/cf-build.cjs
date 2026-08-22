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

// The Android APKs used to live in public/app/ and ship as static assets.
// They don't any more: a single static asset is capped at 25 MiB, and the
// arm64 build passed that when screen sharing pulled in WebRTC's native
// libraries (18.9 MB -> 32.1 MB). Leaving them there failed the whole deploy
// with `Error: Asset too large.`
//
// They live in the `novicetutor-app` R2 bucket now and are streamed by
// /api/app-download/[file]. Publishing a new build is an upload, not a copy:
//
//   npx wrangler r2 object put novicetutor-app/novice-tutor.apk \
//     --file apps/mobile/build/app/outputs/flutter-apk/app-arm64-v8a-release.apk \
//     --content-type application/vnd.android.package-archive --remote
//
// A stale copy left behind in public/app/ would break the deploy exactly the
// way it did before, so say so rather than letting the build get that far.
{
  const staleDir = path.join(root, "public", "app");
  if (fs.existsSync(staleDir)) {
    const stale = fs.readdirSync(staleDir).filter((f) => f.endsWith(".apk"));
    if (stale.length) {
      console.warn(
        `⚠️  public/app/ still holds ${stale.join(", ")} — APKs are served from R2 now.\n` +
          `   Delete them, or a build over 25 MiB will fail the deploy with "Asset too large".`
      );
    }
  }
}

// MediaPipe's segmentation assets are served from our own origin — the CSP in
// src/middleware.ts deliberately does not allow the CDN they used to come from.
// This build path calls @opennextjs/cloudflare directly rather than
// `npm run build`, so the `prebuild` hook never fires and the copy has to
// happen here too. Without it a deploy ships a call screen whose background
// effects 404.
console.log("🔨 Copying MediaPipe segmentation assets into public/...");
{
  const copy = spawnSync("node", ["scripts/copy-mediapipe.mjs"], {
    stdio: "inherit",
    cwd: root,
    shell: true,
  });
  if (copy.status !== 0) {
    console.error("❌ MediaPipe assets could not be staged — background effects would be dead on arrival.");
    process.exit(1);
  }
}

// Step 1: Patch @noble/ciphers directly
console.log("🔨 Patching @noble/ciphers to fix ESM subpath export bug...");
try {
  // Cloudflare runs this in apps/web, so root is apps/web. The package is hoisted to the repo root.
  const repoRoot = path.join(root, "..", "..");
  const ciphersPkgPath = path.join(repoRoot, "node_modules", "@noble", "ciphers", "package.json");
  if (fs.existsSync(ciphersPkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(ciphersPkgPath, "utf8"));
    if (pkg.exports && !pkg.exports["./utils"]) {
      pkg.exports["./utils"] = pkg.exports["./utils.js"] || "./utils.js";
      fs.writeFileSync(ciphersPkgPath, JSON.stringify(pkg, null, 2));
      console.log("✅ Successfully patched @noble/ciphers/package.json exports!");
    } else {
      console.log("ℹ️ @noble/ciphers already has ./utils export or no exports field.");
    }
  } else {
    console.log("⚠️ @noble/ciphers package.json not found at " + ciphersPkgPath);
  }
} catch (err) {
  console.error("❌ Failed to patch @noble/ciphers:", err.message);
}

// NEXT_PUBLIC_* vars get compiled into the bundle at build time and Next.js
// prioritizes .env.local (meant for `next dev` overrides) over .env even
// during production builds. Force the production URL here so a stray
// .env.local (e.g. NEXT_PUBLIC_APP_URL=http://localhost:3000 for local dev)
// can never leak into a deployed build again.
const buildEnv = {
  ...process.env,
  NEXT_PUBLIC_APP_URL: "https://novicetutor.com",
};

console.log("🔨 Running @opennextjs/cloudflare build...");
const buildResult = spawnSync(
  "npx",
  ["@opennextjs/cloudflare", "build"],
  { stdio: "inherit", cwd: root, shell: true, env: buildEnv }
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
    { stdio: "inherit", cwd: root, shell: true, env: buildEnv }
  );

  if (retryResult.status !== 0) {
    console.error("❌ Build failed after patching.");
    process.exit(1);
  }
}

// Step 4: Deploy with wrangler (Skip if inside Cloudflare's automated Git CI, which runs wrangler deploy itself)
if (process.env.CF_PAGES || process.env.CI || process.env.CLOUDFLARE_BUILD_ENVIRONMENT) {
  console.log("ℹ️ Running inside Cloudflare CI — skipping internal wrangler deploy (Cloudflare will deploy automatically).");
  process.exit(0);
}

console.log("🚀 Deploying to Cloudflare Workers...");
const deployResult = spawnSync("npx", ["wrangler", "deploy"], {
  stdio: "inherit",
  cwd: root,
  shell: true,
});

process.exit(deployResult.status ?? 0);
