/**
 * Puts MediaPipe's segmentation assets under `public/` so the browser can fetch
 * them from our own origin.
 *
 * They used to come from cdn.jsdelivr.net and storage.googleapis.com. Then the
 * CSP landed (see `src/middleware.ts`) and blocked both — MediaPipe loads its
 * WASM glue by injecting a `<script>` tag, which `script-src` governs, and the
 * model is an ordinary fetch, which `connect-src` governs. Background effects
 * went quiet without a single error anyone would see. Serving them from `self`
 * is the fix that does not involve trusting a third-party origin on the hot
 * path of every class.
 *
 * The WASM is a build artifact of a pinned dependency, so it is copied out of
 * node_modules at build time and gitignored. The small model is committed; the
 * 16MB multiclass one is only used by /debug/segmentation and is fetched
 * on demand, best-effort.
 */

import { cp, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');

// The package does not export ./package.json, so it cannot be require.resolve'd.
// npm hoists it to the repo root in this workspace; check both places.
const wasmCandidates = [
  join(webRoot, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'),
  join(webRoot, '..', '..', 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'),
];
const wasmTarget = join(webRoot, 'public', 'mediapipe', 'wasm');
const modelsTarget = join(webRoot, 'public', 'mediapipe', 'models');

/** Only fetched when the bench asks for it — 16MB, and nothing in a class uses it. */
const DETAILED_MODEL = {
  file: 'selfie_multiclass_256x256.tflite',
  url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
};

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  let wasmSource = null;
  for (const candidate of wasmCandidates) {
    if (await exists(candidate)) {
      wasmSource = candidate;
      break;
    }
  }
  if (!wasmSource) {
    throw new Error(
      `No @mediapipe/tasks-vision/wasm found. Looked in:\n  ${wasmCandidates.join('\n  ')}\nRun npm install.`
    );
  }

  await mkdir(wasmTarget, { recursive: true });
  await cp(wasmSource, wasmTarget, { recursive: true });
  console.log(`[mediapipe] wasm -> public/mediapipe/wasm`);

  const fast = join(modelsTarget, 'selfie_segmenter.tflite');
  if (!(await exists(fast))) {
    throw new Error(
      `Missing ${fast}. It is committed to the repo; restore it with:\n` +
        '  curl -sSL -o apps/web/public/mediapipe/models/selfie_segmenter.tflite \\\n' +
        '    https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'
    );
  }

  // Best-effort: a missing multiclass model costs you `?model=detailed` on the
  // bench and nothing else, so it must never fail a build.
  if (process.env.MEDIAPIPE_DETAILED === '1') {
    const detailed = join(modelsTarget, DETAILED_MODEL.file);
    if (await exists(detailed)) {
      console.log('[mediapipe] detailed model already present');
    } else {
      try {
        const res = await fetch(DETAILED_MODEL.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await writeFile(detailed, Buffer.from(await res.arrayBuffer()));
        console.log('[mediapipe] detailed model downloaded');
      } catch (err) {
        console.warn(`[mediapipe] skipping detailed model: ${err.message}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
