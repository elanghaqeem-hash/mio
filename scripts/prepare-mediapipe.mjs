import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const source = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const destination = join(root, 'public', 'mediapipe', 'wasm');

if (!existsSync(source)) {
  throw new Error('MediaPipe WASM assets are missing. Run npm ci before building MIO.');
}

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });
console.log('MediaPipe WASM assets staged at public/mediapipe/wasm');
