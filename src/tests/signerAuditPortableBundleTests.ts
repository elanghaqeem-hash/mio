import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import { ModelSignerTrustStore, type ModelSignerTrustEvent } from '../training/SignedModelArtifactProvenance';
import {
  SignerAuditPortableBundleService,
  verifyPortableSignerAuditBundle,
} from '../training/SignerAuditPortableBundle';

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function publicKey(): Promise<string> {
  const pair = await globalThis.crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const spki = await globalThis.crypto.subtle.exportKey('spki', pair.publicKey);
  return toBase64(new Uint8Array(spki));
}

export async function runSignerAuditPortableBundleTests(): Promise<{ passed: number; total: number }> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`SignerAuditPortableBundle test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const storage = new InMemoryStorageProvider();
  const trust = new ModelSignerTrustStore(storage);
  const portable = new SignerAuditPortableBundleService(storage);
  const first = await trust.trust('Portable Signer A', await publicKey(), 'portable-test', 'initial trust');
  const second = await trust.trust('Portable Signer B', await publicKey(), 'portable-test', 'secondary trust');
  await trust.revoke(first.keyId, 'portable-test', 'retire first key');

  const bundle = await portable.exportBundle(10_000);
  check(bundle.kind === 'MIO_SIGNER_TRUST_AUDIT_BUNDLE_V1' && bundle.events.length === 3 && bundle.signers.length === 2, 'Portable export contains bounded signer records and oldest-to-newest audit events');
  check(bundle.events.every((event, index) => event.sequence === index + 1), 'Portable events preserve chronological contiguous sequence order');
  check(bundle.signers.some((signer) => signer.keyId === first.keyId && signer.status === 'REVOKED') && bundle.signers.some((signer) => signer.keyId === second.keyId && signer.status === 'TRUSTED'), 'Portable signer state matches current audited trust state');

  const verified = await verifyPortableSignerAuditBundle(bundle);
  check(verified.state === 'VALID' && verified.checkedEvents === 3 && verified.checkedSigners === 2, 'Portable verifier accepts an untampered chained audit bundle');
  check(verified.bundleSha256 === bundle.bundleSha256 && verified.latestEventHash === bundle.sourceVerification.latestEventHash, 'Portable verifier reproduces bundle and latest-event fingerprints');

  const repeated = await portable.exportBundle(10_000);
  check(repeated.bundleSha256 === bundle.bundleSha256, 'Fixed exportedAt produces deterministic portable bundle digest for unchanged audit state');

  const tamperedEvent = structuredClone(bundle);
  tamperedEvent.events[1].actor = 'tampered-actor';
  const tamperedEventResult = await verifyPortableSignerAuditBundle(tamperedEvent);
  check(tamperedEventResult.state === 'CORRUPT' && tamperedEventResult.reasons.some((reason) => reason.toLowerCase().includes('digest') || reason.toLowerCase().includes('hash mismatch')), 'Portable verifier detects event payload tampering');

  const tamperedKey = structuredClone(bundle);
  tamperedKey.signers[0].publicKeySpkiBase64 = tamperedKey.signers[1].publicKeySpkiBase64;
  const tamperedKeyResult = await verifyPortableSignerAuditBundle(tamperedKey);
  check(tamperedKeyResult.state === 'CORRUPT' && tamperedKeyResult.reasons.some((reason) => reason.toLowerCase().includes('public key')), 'Portable verifier detects public-key substitution against deterministic keyId');

  const tamperedDigest = structuredClone(bundle);
  tamperedDigest.bundleSha256 = '0'.repeat(64);
  const tamperedDigestResult = await verifyPortableSignerAuditBundle(tamperedDigest);
  check(tamperedDigestResult.state === 'CORRUPT' && tamperedDigestResult.reasons.some((reason) => reason.toLowerCase().includes('digest mismatch')), 'Portable verifier detects bundle digest tampering');

  const badKind = structuredClone(bundle) as typeof bundle & { kind: string };
  badKind.kind = 'NOT_MIO_AUDIT';
  const badKindResult = await verifyPortableSignerAuditBundle(badKind as typeof bundle);
  check(badKindResult.state === 'CORRUPT' && badKindResult.reasons.some((reason) => reason.toLowerCase().includes('kind')), 'Portable verifier rejects unsupported bundle kind');

  const auditIndex = await storage.get<string[]>('training', 'trusted-model-signer-audit-index-v1') ?? [];
  const newestId = auditIndex[0];
  const newest = await storage.get<ModelSignerTrustEvent>('training', newestId);
  if (!newest) throw new Error('Portable bundle test expected a newest audit event');
  await storage.set('training', newestId, { ...newest, actor: 'storage-tamper' });
  let exportBlocked = false;
  try {
    await portable.exportBundle(20_000);
  } catch (error) {
    exportBlocked = error instanceof Error && error.message.toLowerCase().includes('export blocked');
  }
  check(exportBlocked, 'Portable export is fail-closed when live signer audit verification is CORRUPT');

  return { passed, total };
}
