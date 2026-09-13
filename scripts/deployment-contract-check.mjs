import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const fail = (message) => {
  console.error(`MIO DEPLOYMENT CONTRACT: FAIL — ${message}`);
  process.exit(1);
};

const envExample = read('.env.example');
const healthSource = read('functions/api/health.ts');
const releaseSource = read('src/release/ReleaseMetadata.ts');
const headersSource = read('public/_headers');
const verifierSource = read('scripts/verify-deployment.mjs');
const pkg = JSON.parse(read('package.json'));

const requiredEnvNames = [
  'VITE_MIO_RELEASE_VERSION',
  'VITE_MIO_RELEASE_CHANNEL',
  'VITE_MIO_RELEASE_SHA',
  'VITE_MIO_DEPLOYMENT_ID',
  'MIO_RELEASE_VERSION',
  'MIO_RELEASE_CHANNEL',
  'MIO_RELEASE_SHA',
  'MIO_DEPLOYMENT_ID',
];

for (const name of requiredEnvNames) {
  if (!new RegExp(`^${name}=`, 'm').test(envExample)) fail(`missing ${name} from .env.example`);
}

for (const line of envExample.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const match = trimmed.match(/^([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*)=(.*)$/i);
  if (match && match[2].trim()) fail(`example environment contains a non-empty secret-like value for ${match[1]}`);
}

for (const token of ['status: \'ready\'', 'Cache-Control', 'no-store', 'MIO_RELEASE_SHA', 'MIO_DEPLOYMENT_ID']) {
  if (!healthSource.includes(token)) fail(`health endpoint missing required bounded metadata/control: ${token}`);
}

for (const token of ['VITE_MIO_RELEASE_CHANNEL', 'VITE_MIO_RELEASE_SHA', 'VITE_MIO_DEPLOYMENT_ID']) {
  if (!releaseSource.includes(token)) fail(`renderer release metadata missing ${token}`);
}

for (const token of [
  'X-Content-Type-Options: nosniff',
  'Referrer-Policy: no-referrer',
  'X-Frame-Options: DENY',
  'Permissions-Policy:',
  'Cross-Origin-Opener-Policy: same-origin',
  'Cache-Control: public, max-age=31536000, immutable',
  '/index.html',
  'Cache-Control: no-store',
]) {
  if (!headersSource.includes(token)) fail(`static delivery headers missing ${token}`);
}

for (const token of [
  "base.protocol !== 'https:'",
  'base.username || base.password',
  "new URL('/api/health', base)",
  "health?.status !== 'ready'",
  "x-content-type-options",
  'AbortController',
  '10000',
]) {
  if (!verifierSource.includes(token)) fail(`post-deploy verifier missing bounded control: ${token}`);
}

const build = pkg.build ?? {};
const winTargets = build.win?.target ?? [];
if (!Array.isArray(winTargets) || !winTargets.includes('nsis') || !winTargets.includes('portable')) {
  fail('Windows packaging targets must retain both nsis and portable RC outputs');
}
if (!Array.isArray(build.files) || !build.files.includes('dist/**/*') || !build.files.includes('dist-electron/**/*')) {
  fail('desktop packaging allowlist must include only validated web and Electron outputs');
}

if (typeof pkg.scripts?.['dist:win'] !== 'string' || !pkg.scripts['dist:win'].includes('electron-builder --win')) {
  fail('dist:win packaging command is missing');
}
if (pkg.scripts?.['deploy:verify'] !== 'node scripts/verify-deployment.mjs') {
  fail('deploy:verify must remain the bounded read-only deployment verifier');
}

console.log('MIO DEPLOYMENT CONTRACT: PASS');
console.log('Web health route: /api/health');
console.log('Static delivery headers: bounded security/cache policy present');
console.log('Post-deploy verifier: HTTPS-only, credential-free URL, 10s timeout');
console.log(`Windows RC targets: ${winTargets.join(', ')}`);
console.log('Secrets: values remain deployment-platform managed; no deployment performed.');
