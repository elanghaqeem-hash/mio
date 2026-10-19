/**
 * PRV-11.03g — trusted-key provisioning attestation verification (read-only).
 * Does not create files, manage keys, certify fsync metadata, or enable Windows.
 *
 * An external trusted provisioner must create and protect the attestation and
 * supply its independent 32+ byte secret to the privileged verifier.
 * This prevents unauthenticated manifest edits from being called "verified".
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { inspectWindowsJournalProvisioning } from './WindowsJournalProvisioningInspector';

const ID = /^[A-Za-z0-9_-]{1,80}\.journal$/;
const HEX = /^[a-f0-9]{64}$/;
export interface SignedJournalProvisioningV1 {
  version: 1;
  journalName: string;
  journalSha256: string;
  manifestSha256: string;
  scope: 'MIO_WINDOWS_PROVISIONING_DIAGNOSTIC';
  mac: string;
}
export interface TrustedProvisioningVerdict {
  authenticated: boolean;
  initialJournalVerified: boolean;
  metadataPublicationDurable: false;
  runtimeActivationPermitted: false;
  reason: string;
}
const bad = (reason: string): TrustedProvisioningVerdict =>
  ({ authenticated:false, initialJournalVerified:false, metadataPublicationDurable:false,
     runtimeActivationPermitted:false, reason });
const hash = (data: Buffer): string => crypto.createHash('sha256').update(data).digest('hex');
const exact = (obj: Record<string,unknown>, keys: string[]): boolean =>
  Object.keys(obj).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(obj,k));

/**
 * Domain separation protects against cross-protocol reuse. This helper is
 * intended for an external trusted provisioner, never exposed via IPC.
 */
export function computeProvisioningMac(
  key: Buffer, record: Omit<SignedJournalProvisioningV1,'mac'>,
): string {
  if (!Buffer.isBuffer(key) || key.length < 32) throw Error('PROVISIONING_KEY_INVALID');
  if (record.version !== 1 || !ID.test(record.journalName) ||
      !HEX.test(record.journalSha256) || !HEX.test(record.manifestSha256) ||
      record.scope !== 'MIO_WINDOWS_PROVISIONING_DIAGNOSTIC')
    throw Error('PROVISIONING_ATTESTATION_INVALID');
  const message = ['MIO-PROVISIONING-HMAC-V1',record.journalName,
    record.journalSha256,record.manifestSha256,record.scope].join('\n');
  return crypto.createHmac('sha256',key).update(message,'utf8').digest('hex');
}

/** Never uses secrets passed through renderer inputs; caller must be trusted. */
export function verifyWindowsJournalAttestation(
  root: string, journalName: string, key: Buffer,
): TrustedProvisioningVerdict {
  if (!path.isAbsolute(root) || !ID.test(journalName) ||
      !Buffer.isBuffer(key) || key.length < 32) return bad('ATTESTATION_INPUT_INVALID');
  const inspected = inspectWindowsJournalProvisioning(root,journalName);
  if (!inspected.verified) return bad('INITIAL_JOURNAL_NOT_VERIFIED');
  try {
    const p = path.join(root,journalName+'.attestation.json');
    const st = fs.lstatSync(p);
    if (!st.isFile() || st.isSymbolicLink() || st.size < 1 || st.size > 4096)
      return bad('ATTESTATION_FILE_UNSAFE');
    const raw = fs.readFileSync(p);
    const value: unknown = JSON.parse(raw.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) return bad('ATTESTATION_SCHEMA_INVALID');
    const v = value as Record<string,unknown>;
    if (!exact(v,['version','journalName','journalSha256','manifestSha256','scope','mac']) ||
        typeof v.mac !== 'string' || !HEX.test(v.mac)) return bad('ATTESTATION_SCHEMA_INVALID');
    const manifest = fs.readFileSync(path.join(root,journalName+'.manifest.json'));
    const journal = fs.readFileSync(path.join(root,journalName));
    if (v.journalName !== journalName || v.journalSha256 !== hash(journal) ||
        v.manifestSha256 !== hash(manifest)) return bad('ATTESTATION_CONTENT_MISMATCH');
    const record = v as unknown as SignedJournalProvisioningV1;
    const expected = computeProvisioningMac(key,record);
    if (!crypto.timingSafeEqual(Buffer.from(record.mac,'hex'),Buffer.from(expected,'hex')))
      return bad('ATTESTATION_AUTHENTICATION_FAILED');
    return {authenticated:true,initialJournalVerified:true,
      metadataPublicationDurable:false,runtimeActivationPermitted:false,
      reason:'AUTHENTICATED_DIAGNOSTIC_ONLY'};
  } catch {
    return bad('ATTESTATION_UNAVAILABLE_OR_CORRUPT');
  }
}
