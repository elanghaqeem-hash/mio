import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';

const requiredFiles = [
  'package.json',
  'package-lock.json',
  'vite.config.mjs',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.electron.json',
  'electron/main.ts',
  'electron/preload.ts',
  'src/main.tsx',
  '.github/workflows/mio-validation.yml',
];

const failures = [];
for (const path of requiredFiles) {
  try {
    await access(path, constants.R_OK);
  } catch {
    failures.push(`Required release input is missing or unreadable: ${path}`);
  }
}

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));

if (pkg.private !== true) failures.push('package.json must remain private=true for the Technology Preview.');
if (!pkg.main?.startsWith('dist-electron/')) failures.push('Electron main entry must resolve inside dist-electron/.');
if (!pkg.scripts?.build || !pkg.scripts?.['build:electron']) failures.push('Web and Electron build scripts are required.');
if (!pkg.scripts?.test || !pkg.scripts?.lint) failures.push('Test and lint scripts are required for release validation.');
if (!pkg.build?.appId || !pkg.build?.productName) failures.push('Electron packaging metadata must define appId and productName.');
if (!Array.isArray(pkg.build?.files) || !pkg.build.files.includes('dist/**/*') || !pkg.build.files.includes('dist-electron/**/*')) {
  failures.push('Electron package file allowlist must include only explicit build outputs.');
}

const rootLock = lock.packages?.[''];
if (!rootLock) failures.push('package-lock.json is missing the root package entry.');
else {
  const packageDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const lockDeps = { ...(rootLock.dependencies ?? {}), ...(rootLock.devDependencies ?? {}) };
  for (const [name, version] of Object.entries(packageDeps)) {
    if (lockDeps[name] !== version) failures.push(`Lockfile drift detected for ${name}: package=${version}, lock=${lockDeps[name] ?? 'missing'}`);
  }
}

if (failures.length > 0) {
  console.error('MIO RELEASE PREFLIGHT: FAILED');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('MIO RELEASE PREFLIGHT: PASS');
console.log(`Product: ${pkg.build.productName}`);
console.log(`Version: ${pkg.version}`);
console.log(`App ID: ${pkg.build.appId}`);
console.log('Authority: validation only; no deployment or privileged execution performed.');
