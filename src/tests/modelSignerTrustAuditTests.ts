import { InMemoryStorageProvider } from '../storage/InMemoryStorageProvider';
import type { StorageNamespace, StorageProvider } from '../storage/StorageProvider';
import { ModelSignerTrustStore } from '../training/SignedModelArtifactProvenance';

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

class FailAuditIndexOnceStorage implements StorageProvider {
  private failed = false;
  constructor(private readonly delegate: StorageProvider) {}

  async get<T>(namespace: StorageNamespace, key: string): Promise<T | null> {
    return this.delegate.get<T>(namespace, key);
  }

  async set<T>(namespace: StorageNamespace, key: string, value: T): Promise<void> {
    if (!this.failed && namespace === 'training' && key === 'trusted-model-signer-audit-index-v1') {
      this.failed = true;
      throw new Error('Injected audit-index persistence failure');
    }
    await this.delegate.set(namespace, key, value);
  }

  async delete(namespace: StorageNamespace, key: string): Promise<void> {
    await this.delegate.delete(namespace, key);
  }

  async listKeys(namespace: StorageNamespace): Promise<string[]> {
    return this.delegate.listKeys(namespace);
  }

  async clearNamespace(namespace: StorageNamespace): Promise<void> {
    await this.delegate.clearNamespace(namespace);
  }
}

export async function runModelSignerTrustAuditTests(): Promise<SuiteResult> {
  let passed = 0;
  let total = 0;
  const check = (condition: boolean, label: string) => {
    total += 1;
    if (!condition) throw new Error(`ModelSignerTrustAudit test failed: ${label}`);
    passed += 1;
    console.log(`✓ [PASS] ${label}`);
  };

  const storage = new InMemoryStorageProvider();
  const store = new ModelSignerTrustStore(storage);
  const key1 = await publicKey();
  const key2 = await publicKey();

  const first = await store.trust('Release Signer A', key1, 'security-admin', 'Initial release signing authority');
  let history = await store.history();
  check(history.length === 1 && history[0].action === 'TRUST' && history[0].resultingStatus === 'TRUSTED', 'Initial trust creates the first immutable audit event');
  check(history[0].actor === 'security-admin' && history[0].reason === 'Initial release signing authority', 'Trust audit records bounded actor and reason');

  await store.revoke(first.keyId, 'security-admin', 'Scheduled signer retirement');
  history = await store.history();
  check(history.length === 2 && history[0].action === 'REVOKE' && history[0].previousStatus === 'TRUSTED', 'Revocation appends audit history instead of replacing the trust event');

  const retrusted = await store.trust('Release Signer A restored', key1, 'security-lead', 'Emergency temporary restoration');
  history = await store.history();
  check(retrusted.keyId === first.keyId && history.length === 3 && history[0].action === 'RETRUST', 'Re-trust preserves deterministic key identity and appends a RETRUST event');
  check(history.map((event) => event.sequence).join(',') === '3,2,1', 'Audit sequence remains monotonic and history is returned newest-first');

  const rotation = await store.rotate({
    currentKeyId: first.keyId,
    replacementLabel: 'Release Signer B',
    replacementPublicKey: key2,
    actor: 'security-lead',
    reason: 'Quarterly key rotation',
  });
  const oldState = await store.get(first.keyId);
  const newState = await store.get(rotation.replacement.keyId);
  check(oldState?.status === 'REVOKED' && newState?.status === 'TRUSTED', 'Rotation trusts the replacement and revokes the previous signer');

  history = await store.history();
  const rotationEvents = history.filter((event) => event.rotationId === rotation.rotationId);
  check(rotationEvents.length === 2 && rotationEvents.every((event) => event.actor === 'security-lead'), 'Rotation creates linked trust/revoke events under one rotation ID');
  check(rotationEvents.some((event) => event.keyId === first.keyId && event.resultingStatus === 'REVOKED'), 'Rotation audit identifies the retired signer');
  check(rotationEvents.some((event) => event.keyId === rotation.replacement.keyId && event.resultingStatus === 'TRUSTED'), 'Rotation audit identifies the replacement signer');

  const serializedEvents = JSON.stringify(history);
  check(!serializedEvents.includes('publicKeySpkiBase64') && !serializedEvents.includes('PRIVATE KEY'), 'Audit events contain signer identity metadata but no public-key material or private-key content');

  const keyHistory = await store.history(first.keyId, 20);
  check(keyHistory.length === 4 && keyHistory.every((event) => event.keyId === first.keyId), 'Per-key audit history is filtered without losing prior trust/revoke events');

  let sameKeyRejected = false;
  try {
    await store.rotate({
      currentKeyId: rotation.replacement.keyId,
      replacementLabel: 'Same Key',
      replacementPublicKey: key2,
      actor: 'security-lead',
    });
  } catch (error) {
    sameKeyRejected = error instanceof Error && error.message.includes('must differ');
  }
  check(sameKeyRejected, 'Rotation rejects replacement with the same cryptographic key identity');

  const historyBeforeBlankActor = (await store.history()).length;
  let blankActorRejected = false;
  try { await store.trust('Invalid actor test', await publicKey(), '   '); }
  catch (error) { blankActorRejected = error instanceof Error && error.message.includes('actor identity'); }
  check(blankActorRejected && (await store.history()).length === historyBeforeBlankActor, 'Blank actor is rejected before trust state or audit history changes');

  const expectedKeyStore = new ModelSignerTrustStore(new InMemoryStorageProvider());
  const failureKey = await publicKey();
  const expected = await expectedKeyStore.trust('Expected key identity', failureKey, 'test-setup');
  const failingBase = new InMemoryStorageProvider();
  const failingStore = new ModelSignerTrustStore(new FailAuditIndexOnceStorage(failingBase));
  let persistenceFailed = false;
  try { await failingStore.trust('Rollback signer', failureKey, 'security-admin', 'Injected failure'); }
  catch (error) { persistenceFailed = error instanceof Error && error.message.includes('Injected audit-index persistence failure'); }
  check(persistenceFailed, 'Audit persistence failure is surfaced to the caller');
  check((await failingStore.get(expected.keyId)) === undefined, 'Failed audit persistence rolls back the signer trust state');
  check((await failingStore.list()).length === 0 && (await failingStore.history()).length === 0, 'Failed audit persistence rolls back signer and audit indexes');

  return { passed, total };
}
