import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const failures = [];
const warnings = [];

const assertReadable = async (file) => {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size === 0) failures.push(`Build output is empty or invalid: ${file}`);
    return info;
  } catch {
    failures.push(`Expected build output is missing: ${file}`);
    return null;
  }
};

await assertReadable('dist/index.html');
await assertReadable('dist-electron/main.js');
await assertReadable('dist-electron/preload.js');

let assets = [];
try {
  assets = await readdir('dist/assets');
} catch {
  failures.push('dist/assets is missing.');
}

const jsAssets = assets.filter((name) => name.endsWith('.js'));
if (jsAssets.length === 0) failures.push('No JavaScript assets were emitted.');

const chunkBudgetBytes = 500 * 1024;
let largest = { name: '', size: 0 };
for (const asset of jsAssets) {
  const info = await stat(path.join('dist/assets', asset));
  if (info.size > largest.size) largest = { name: asset, size: info.size };
  if (info.size > chunkBudgetBytes) failures.push(`Chunk budget exceeded: ${asset} (${info.size} bytes > ${chunkBudgetBytes}).`);
}

try {
  const html = await readFile('dist/index.html', 'utf8');
  if (!html.includes('<script')) failures.push('dist/index.html does not reference an application script.');
  if (!html.includes('assets/')) warnings.push('dist/index.html does not visibly reference an assets/ path; verify bundler output format.');
} catch {
  // Missing file already reported above.
}

if (failures.length > 0) {
  console.error('MIO RELEASE SMOKE: FAILED');
  failures.forEach((failure) => console.error(`- ${failure}`));
  warnings.forEach((warning) => console.warn(`- warning: ${warning}`));
  process.exit(1);
}

console.log('MIO RELEASE SMOKE: PASS');
console.log(`JS chunks: ${jsAssets.length}`);
console.log(`Largest JS chunk: ${largest.name} (${largest.size} bytes)`);
warnings.forEach((warning) => console.warn(`warning: ${warning}`));
console.log('Deployment: not performed. Smoke checks only validate local build artifacts.');
