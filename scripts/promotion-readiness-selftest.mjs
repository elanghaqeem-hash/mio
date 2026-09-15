import assert from 'node:assert/strict';
import { evaluatePromotionReadiness } from './lib/promotion-readiness.mjs';

const baseManifest = {
  version: '1.0.0',
  channel: 'technology-preview',
  gitSha: 'abcdef1234567890',
  generatedAt: '2026-09-13T00:00:00.000Z',
  manifestSha256: 'a'.repeat(64),
  authorityDisclosure: 'Build metadata only. This manifest does not authorize deployment, system access, tool execution, memory mutation, or privileged operations.',
};
const health = { status: 'ready', version: '1.0.0', channel: 'technology-preview', sha: 'abcdef1234567890' };
const headers = { 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY' };

const ready = evaluatePromotionReadiness({
  health,
  deployedManifest: baseManifest,
  expectedManifest: baseManifest,
  rootHeaders: headers,
  now: new Date('2026-09-13T01:00:00.000Z'),
});
assert.equal(ready.status, 'READY');
assert.deepEqual(ready.blockers, []);
assert.match(ready.authorityDisclosure, /not authorization/i);

const wrongSha = evaluatePromotionReadiness({
  health,
  deployedManifest: { ...baseManifest, gitSha: 'different' },
  expectedManifest: baseManifest,
  rootHeaders: headers,
  now: new Date('2026-09-13T01:00:00.000Z'),
});
assert.equal(wrongSha.status, 'NOT_READY');
assert.ok(wrongSha.blockers.includes('MANIFEST_SHA_MISMATCH'));
assert.ok(wrongSha.blockers.includes('HEALTH_SHA_MISMATCH'));

const degraded = evaluatePromotionReadiness({
  health: { ...health, status: 'degraded' },
  deployedManifest: baseManifest,
  expectedManifest: baseManifest,
  rootHeaders: headers,
  now: new Date('2026-09-13T01:00:00.000Z'),
});
assert.equal(degraded.status, 'NOT_READY');
assert.ok(degraded.blockers.includes('DEPLOYMENT_NOT_READY'));

const missingHeaders = evaluatePromotionReadiness({
  health,
  deployedManifest: baseManifest,
  expectedManifest: baseManifest,
  rootHeaders: {},
  now: new Date('2026-09-13T01:00:00.000Z'),
});
assert.ok(missingHeaders.blockers.includes('NOSNIFF_HEADER_MISSING'));
assert.ok(missingHeaders.blockers.includes('FRAME_DENY_HEADER_MISSING'));

const stale = evaluatePromotionReadiness({
  health,
  deployedManifest: baseManifest,
  expectedManifest: baseManifest,
  rootHeaders: headers,
  now: new Date('2026-09-17T01:00:00.000Z'),
});
assert.equal(stale.status, 'READY');
assert.ok(stale.warnings.includes('MANIFEST_OLDER_THAN_72_HOURS'));

console.log('MIO RC PROMOTION READINESS SELFTEST: PASS');
console.log('READY is advisory only and does not grant deployment, merge, publish, rollback, or infrastructure authority.');
