/**
 * Copies the picker and ring windows into dist/.
 *
 * They are plain HTML/CSS/JS, so `tsc` — which only knows about src/**\/*.ts —
 * walks straight past them and the built app loads two blank windows. This is
 * the whole build step they need.
 */

import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const from = path.join(root, 'src', 'renderer');
const to = path.join(root, 'dist', 'renderer');

await mkdir(to, { recursive: true });
await cp(from, to, { recursive: true });
console.log(`renderer -> ${path.relative(root, to)}`);
