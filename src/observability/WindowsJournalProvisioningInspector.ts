/**
 * PRV-11.03f — diagnostic attestation of an externally preprovisioned journal.
 * NEVER creates files/directories; NEVER unlocks runtime or attests power-loss.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { WindowsCheckpointJournalPrototype } from './WindowsCheckpointJournalPrototype';

export interface WindowsJournalProvisioningManifest {
  version: 1;
  journalName: string;
  journalSha256: string;
  initialBytes: 0;
  initializedBy: 'EXTERNAL_TRUSTED_PROVISIONER';
}
export type WindowsProvisioningInspection = {
  verified: boolean;
  journalExisting: boolean;
  manifestMatching: boolean;
  logicalHistoryValid: boolean;
  metadataPublicationDurable: false;
  activationPermitted: false;
  errors: string[];
};
const SAFE_NAME = /^[A-Za-z0-9_-]{1,80}\.journal$/;
const SHA = /^[0-9a-f]{64}$/;
const exact = (x: Record<string, unknown>, keys: string[]) =>
  Object.keys(x).length === keys.length && keys.every(key => Object.hasOwn(x, key));
const plain = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const digest = (bytes: Buffer): string => crypto.createHash('sha256').update(bytes).digest('hex');

export function inspectWindowsJournalProvisioning(root: string, journalName: string): WindowsProvisioningInspection {
  const errors: string[] = [];
  let journalExisting = false, manifestMatching = false, logicalHistoryValid = false;
  if (!path.isAbsolute(root) || !SAFE_NAME.test(journalName)) errors.push('PROVISIONING_INPUT_INVALID');
  else try {
    const rootStat = fs.lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw Error('PROVISIONING_ROOT_UNSAFE');
    const journalPath = path.join(root, journalName);
    const manifestPath = journalPath + '.manifest.json';
    const journalStat = fs.lstatSync(journalPath);
    const manifestStat = fs.lstatSync(manifestPath);
    if (!journalStat.isFile() || journalStat.isSymbolicLink() || !manifestStat.isFile() || manifestStat.isSymbolicLink())
      throw Error('PROVISIONING_FILE_UNSAFE');
    if (manifestStat.size <= 0 || manifestStat.size > 4096 || journalStat.size > 8 * 1024 * 1024)
      throw Error('PROVISIONING_FILE_BOUNDS_INVALID');
    journalExisting = true;
    const rawManifest = fs.readFileSync(manifestPath, 'utf8');
    const decoded: unknown = JSON.parse(rawManifest);
    if (!plain(decoded) || !exact(decoded, ['version','journalName','journalSha256','initialBytes','initializedBy']) ||
        decoded.version !== 1 || decoded.journalName !== journalName ||
        decoded.initialBytes !== 0 || decoded.initializedBy !== 'EXTERNAL_TRUSTED_PROVISIONER' ||
        typeof decoded.journalSha256 !== 'string' || !SHA.test(decoded.journalSha256))
      throw Error('PROVISIONING_MANIFEST_INVALID');
    // The initial manifest describes an EMPTY preprovisioned journal only.
    // Once a journal has entries this snapshot is no longer valid as a readiness
    // attestation: never claim an append-only journal has a stable empty digest.
    if (journalStat.size !== 0 || digest(fs.readFileSync(journalPath)) !== decoded.journalSha256)
      throw Error('PROVISIONING_INITIAL_SNAPSHOT_MISMATCH');
    manifestMatching = true;
    new WindowsCheckpointJournalPrototype(journalPath).inspect();
    logicalHistoryValid = true;
  } catch (error) {
    errors.push(error instanceof Error ? error.message.slice(0,120) : 'PROVISIONING_UNAVAILABLE');
  }
  // This diagnostic never has the authority to claim metadata durability.
  return { verified: journalExisting && manifestMatching && logicalHistoryValid,
    journalExisting, manifestMatching, logicalHistoryValid,
    metadataPublicationDurable: false, activationPermitted: false, errors };
}
