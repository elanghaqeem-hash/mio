import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import {
  ModelSignerTrustStore,
  type ModelSignerTrustEvent,
  type TrustedModelSigner,
} from '../training/SignedModelArtifactProvenance';

interface SuiteResult { passed: number; total: number; }

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

export async function runModelSignerTrustAuditChainTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`ModelSignerTrustAuditChain test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const storage = new InMemoryStorageProvider();
  const store = new ModelSignerTrustStore(storage);
  const first = await store.trust('Chain Signer A', await publicKey(), 'security-admin', 'Initial trust');
  const second = await store.trust('Chain Signer B', await publicKey(), 'security-admin', 'Secondary trust');
  await store.revoke(first.keyId, 'security-admin', 'Retire first signer');

  const valid = await store.verifyAuditChain();
  check(valid.state === 'VALID' && valid.checkedEvents === 3 && Boolean(valid.latestEventHash), 'New TP-0.55 audit events form a VALID cryptographic hash chain');

  const history = await store.history();
  check(history.every((event) => /^[a-f0-9]{64}$/.test(event.eventHash ?? '')), 'Every new audit event carries a SHA-256 eventHash');
  check(history[0].previousEventHash === history[1].eventHash && history[1].previousEventHash === history[2].eventHash, 'Newest-first audit history links each event to its chronological predecessor hash');
  check(history[2].previousEventHash === undefined, 'Genesis audit event has no predecessor hash');

  const tampered = { ...history[1], actor: 'tampered-actor' } as ModelSignerTrustEvent;
  await storage.set('training', history[1].id, tampered);
  const corrupt = await store.verifyAuditChain();
  check(corrupt.state === 'CORRUPT' && corrupt.reasons.some((reason) => reason.includes('hash mismatch')), 'Tampering an audit event payload is detected as CORRUPT');

  let trustReadBlocked = false;
  try { await store.get(second.keyId); }
  catch (error) { trustReadBlocked = error instanceof Error && error.message.includes('audit chain verification failed'); }
  check(trustReadBlocked, 'Signer trust reads fail closed when the audit chain is corrupt');
  check((await store.history()).length === 3, 'Corrupt audit history remains readable for diagnostics');

  const reorderStorage = new InMemoryStorageProvider();
  const reorderStore = new ModelSignerTrustStore(reorderStorage);
  await reorderStore.trust('Order A', await publicKey(), 'auditor');
  await reorderStore.trust('Order B', await publicKey(), 'auditor');
  const auditIndex = await reorderStorage.get<string[]>('training', 'trusted-model-signer-audit-index-v1') ?? [];
  await reorderStorage.set('training', 'trusted-model-signer-audit-index-v1', [...auditIndex].reverse());
  const reordered = await reorderStore.verifyAuditChain();
  check(reordered.state === 'CORRUPT' && reordered.reasons.some((reason) => reason.includes('sequence')), 'Audit index reordering is detected through sequence/link verification');

  const stateStorage = new InMemoryStorageProvider();
  const stateStore = new ModelSignerTrustStore(stateStorage);
  const stateSigner = await stateStore.trust('State Signer', await publicKey(), 'auditor');
  const rawSigner = await stateStorage.get<TrustedModelSigner>('training', `trusted-model-signer:${stateSigner.keyId}`);
  if (!rawSigner) throw new Error('Test setup failed to read raw signer state');
  await stateStorage.set('training', `trusted-model-signer:${stateSigner.keyId}`, { ...rawSigner, status: 'REVOKED', revokedAt: Date.now() });
  const stateCorrupt = await stateStore.verifyAuditChain();
  check(stateCorrupt.state === 'CORRUPT' && stateCorrupt.reasons.some((reason) => reason.includes('state does not match')), 'Direct signer-state tampering is detected against the latest audit event');

  const legacyStorage = new InMemoryStorageProvider();
  const legacyStore = new ModelSignerTrustStore(legacyStorage);
  const legacySigner = await legacyStore.trust('Legacy Signer', await publicKey(), 'legacy-migration-test');
  const [modernEvent] = await legacyStore.history();
  const legacyEvent: ModelSignerTrustEvent = { ...modernEvent };
  delete legacyEvent.eventHash;
  delete legacyEvent.previousEventHash;
  await legacyStorage.set('training', legacyEvent.id, legacyEvent);

  const legacy = await legacyStore.verifyAuditChain();
  check(legacy.state === 'LEGACY_UNCHAINED' && legacy.checkedEvents === 1, 'TP-0.54-style unhashed audit events remain readable as LEGACY_UNCHAINED');
  check((await legacyStore.get(legacySigner.keyId))?.status === 'TRUSTED', 'LEGACY_UNCHAINED audit history preserves backward-compatible trust reads');

  await legacyStore.trust('Legacy Signer re-trusted', legacySigner.publicKeySpkiBase64, 'migration-admin', 'Anchor legacy history into TP-0.55 chain');
  const mixed = await legacyStore.verifyAuditChain();
  const mixedHistory = await legacyStore.history();
  check(mixed.state === 'LEGACY_UNCHAINED' && Boolean(mixedHistory[0].eventHash) && Boolean(mixedHistory[0].previousEventHash), 'First TP-0.55 event cryptographically anchors the latest legacy predecessor while retaining LEGACY_UNCHAINED state');

  const legacyTail = mixedHistory[1];
  await legacyStorage.set('training', legacyTail.id, { ...legacyTail, actor: 'tampered-legacy-actor' });
  const anchoredTamper = await legacyStore.verifyAuditChain();
  check(anchoredTamper.state === 'CORRUPT' && anchoredTamper.reasons.some((reason) => reason.includes('previousEventHash')), 'Tampering a legacy event after it has been anchored by a chained event is detected');

  let mutationBlocked = false;
  try { await legacyStore.revoke(legacySigner.keyId, 'security-admin', 'Should not execute on corrupt chain'); }
  catch (error) { mutationBlocked = error instanceof Error && error.message.includes('audit chain verification failed'); }
  check(mutationBlocked, 'Trust mutations fail closed when existing audit history is corrupt');

  return { passed, total };
}
