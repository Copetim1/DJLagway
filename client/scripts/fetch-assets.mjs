#!/usr/bin/env node
/**
 * Vendor the MediaPipe WASM runtime and hand model into public/.
 *
 * The app falls back to a CDN when these are absent, which is fine for
 * development. Run this before a demo: a 7.8MB model fetched over conference
 * wifi is a failure mode you do not want in front of an audience.
 *
 * Output is gitignored — this is a build input, not source.
 */
import { createRequire } from 'node:module';
import { cp, mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'mediapipe');

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyWasm() {
  // Take the WASM from node_modules rather than a CDN so it cannot drift out of
  // step with the pinned package version.
  //
  // The package does not export ./package.json, so resolve a file that IS in its
  // exports map and take the directory from there.
  const entry = require.resolve('@mediapipe/tasks-vision/vision_wasm_internal.js');
  const src = dirname(entry);
  if (!(await exists(src))) throw new Error(`WASM directory not found at ${src}`);
  await cp(src, join(outDir, 'wasm'), { recursive: true });
  console.log('✓ wasm runtime copied from node_modules');
}

async function fetchModel() {
  const dest = join(outDir, 'hand_landmarker.task');
  if (await exists(dest)) {
    console.log('✓ model already present, skipping download');
    return;
  }
  console.log('… downloading hand_landmarker.task (~7.8MB)');
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`Model download failed: HTTP ${res.status}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  console.log('✓ model downloaded');
}

await mkdir(outDir, { recursive: true });
await copyWasm();
await fetchModel();
console.log(`\nAssets vendored to ${outDir}. The app will now load them locally.`);
