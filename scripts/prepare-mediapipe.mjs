import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const wasmSource = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmDestination = join(root, 'public', 'mediapipe', 'wasm');
const modelPath = join(root, 'public', 'mediapipe', 'models', 'pose_landmarker_lite.task');
const checksumPath = `${modelPath}.sha256`;

if (!existsSync(wasmSource)) {
  throw new Error('MediaPipe WASM assets are missing. Run npm ci before building MIO.');
}
if (!existsSync(modelPath) || !existsSync(checksumPath)) {
  throw new Error('Vendored MediaPipe Pose Landmarker model/checksum is missing.');
}

const expected = readFileSync(checksumPath, 'utf8').trim().split(/\s+/)[0].toLowerCase();
const actual = createHash('sha256').update(readFileSync(modelPath)).digest('hex').toLowerCase();
if (!/^[a-f0-9]{64}$/.test(expected) || actual !== expected) {
  throw new Error(`MediaPipe model integrity check failed. Expected ${expected}, got ${actual}.`);
}

rmSync(wasmDestination, { recursive: true, force: true });
mkdirSync(wasmDestination, { recursive: true });
cpSync(wasmSource, wasmDestination, { recursive: true });
console.log(`MediaPipe runtime staged; pose model checksum verified: ${actual}`);
