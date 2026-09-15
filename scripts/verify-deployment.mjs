const target = process.argv[2];

const fail = (message) => {
  console.error(`MIO DEPLOYMENT VERIFY: FAIL — ${message}`);
  process.exit(1);
};

if (!target) fail('usage: npm run deploy:verify -- https://deployment.example');

let base;
try {
  base = new URL(target);
} catch {
  fail('deployment URL is invalid');
}

if (base.protocol !== 'https:') fail('deployment verification requires HTTPS');
if (base.username || base.password) fail('credentials must not be embedded in the deployment URL');
base.pathname = '/';
base.search = '';
base.hash = '';

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 10000);

try {
  const rootResponse = await fetch(base, {
    redirect: 'error',
    signal: controller.signal,
    headers: { Accept: 'text/html' },
  });
  if (!rootResponse.ok) fail(`root returned HTTP ${rootResponse.status}`);
  const contentType = rootResponse.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) fail('root did not return HTML');
  if (rootResponse.headers.get('x-content-type-options') !== 'nosniff') {
    fail('root is missing X-Content-Type-Options: nosniff');
  }

  const healthUrl = new URL('/api/health', base);
  const healthResponse = await fetch(healthUrl, {
    redirect: 'error',
    signal: controller.signal,
    headers: { Accept: 'application/json' },
  });
  if (!healthResponse.ok) fail(`health endpoint returned HTTP ${healthResponse.status}`);
  const health = await healthResponse.json();
  if (health?.status !== 'ready') fail('health endpoint did not report ready');
  if (typeof health?.version !== 'string' || !health.version) fail('health endpoint missing version');
  if (typeof health?.channel !== 'string' || !health.channel) fail('health endpoint missing channel');
  if (typeof health?.sha !== 'string' || !health.sha) fail('health endpoint missing release SHA');

  console.log('MIO DEPLOYMENT VERIFY: PASS');
  console.log(`Origin: ${base.origin}`);
  console.log(`Version: ${health.version}`);
  console.log(`Channel: ${health.channel}`);
  console.log(`SHA: ${health.sha}`);
  console.log('Verification is read-only; no deployment or rollback action was performed.');
} catch (error) {
  fail(error instanceof Error ? error.message : 'deployment verification failed');
} finally {
  clearTimeout(timer);
}
