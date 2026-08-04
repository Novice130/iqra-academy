#!/usr/bin/env node
/**
 * Patches styled-jsx in .next/standalone/node_modules/styled-jsx/
 * so that OpenNext can bundle it properly.
 * 
 * The issue: Next.js standalone mode copies styled-jsx/index.js which requires('./dist/index')
 * but the dist/ dir is not traced. We patch both index.js and create dist/index.js.
 */
const fs = require("fs");
const path = require("path");

const appRoot = path.resolve(__dirname, "..");

// The fully inlined content is in apps/web/node_modules/styled-jsx/index.js
const sourceFile = path.join(appRoot, "node_modules/styled-jsx/index.js");

if (!fs.existsSync(sourceFile)) {
  console.log("⚠️  styled-jsx patch: source file not found, skipping.");
  process.exit(0);
}

const sourceContent = fs.readFileSync(sourceFile, "utf8");

// Only patch if the source already has the inlined content (not the require redirect)
if (sourceContent.trim() === "module.exports = require('./dist/index')") {
  console.log("⚠️  styled-jsx patch: source is still the redirect, skipping.");
  process.exit(0);
}

console.log(`📄 Source has ${sourceContent.length} bytes (inlined content ✅)`);

const standaloneJsx = ".next/standalone/node_modules/styled-jsx";

if (!fs.existsSync(standaloneJsx)) {
  console.log(`⏭  Skipping ${standaloneJsx} (doesn't exist yet)`);
  process.exit(0);
}

// Patch 1: Replace index.js with inlined content
const indexFile = path.join(standaloneJsx, "index.js");
fs.writeFileSync(indexFile, sourceContent, "utf8");
console.log(`✅ Patched ${indexFile}`);

// Patch 2: Also create dist/index.js for safety
const distDir = path.join(standaloneJsx, "dist");
const distIndexFile = path.join(distDir, "index.js");
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}
fs.writeFileSync(distIndexFile, sourceContent, "utf8");
console.log(`✅ Also patched ${distIndexFile}`);

console.log("🩹 styled-jsx patch complete.");
