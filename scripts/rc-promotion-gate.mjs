import { readFile } from 'node:fs/promises';
import { evaluatePromotionReadiness } from './lib/promotion-readiness.mjs';

const target = process.argv[2];
const manifestPath = process.argv[3] || 'dist/release-manifest.json';

const fail = (message) => {
  console.error(`MIO RC PROMOTION GATE: FAIL — ${message}`);
  process.exit(1);
};

if (!target) fail('usage: npm run release:promotion-gate -- https://deployment.example [expected-manifest.json]');

let base;
try {
  base = new URL(target);
} catch {
  fail('deployment URL is invalid');
}
if (base.protocol !== 'https:') fail('promotion assessment requires HTTPS');
if (base.username || base.password) fail('credentials must not be embedded in the deployment URL');
base.pathname = '/';
base.search = '';
base.hash = '';

const expectedManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 10000);

try {
  const [rootResponse, healthResponse, manifestResponse] = await Promise.all([
    fetch(base, { redirect: 'error', signal: controller.signal, headers: { Accept: 'text/html' } }),
    fetch(new URL('/api/health', base), { redirect: 'error', signal: controller.signal, headers: { Accept: 'application/json' } }),
    fetch(new URL('/release-manifest.json', base), { redirect: 'error', signal: controller.signal, headers: { Accept: 'application/json' } }),
  ]);

  if (!rootResponse.ok) fail(`root returned HTTP ${rootResponse.status}`);
  if (!healthResponse.ok) fail(`health endpoint returned HTTP ${healthResponse.status}`);
  if (!manifestResponse.ok) fail(`release manifest returned HTTP ${manifestResponse.status}`);

  const health = await healthResponse.json();
  const deployedManifest = await manifestResponse.json();
  const result = evaluatePromotionReadiness({
    health,
    deployedManifest,
    expectedManifest,
    rootHeaders: {
      'x-content-type-options': rootResponse.headers.get('x-content-type-options') ?? '',
      'x-frame-options': rootResponse.headers.get('x-frame-options') ?? '',
    },
  });

  console.log('MIO RC PROMOTION GATE');
  console.log(JSON.stringify({ origin: base.origin, ...result }, null, 2));
  if (result.status !== 'READY') process.exit(2);
} catch (error) {
  fail(error instanceof Error ? error.message : 'promotion assessment failed');
} finally {
  clearTimeout(timer);
}
