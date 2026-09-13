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

console.log('MIO DEPLOYMENT CONTRACT: PASS');
console.log('Web health route: /api/health');
console.log(`Windows RC targets: ${winTargets.join(', ')}`);
console.log('Secrets: values remain deployment-platform managed; no deployment performed.');
