/** PRV-10.06n: read-only, project-scoped inspection of trusted MIO 3D cube artifacts.
 * No caller-controlled paths. The exact artifact name is derived from validated identities.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Mio3DScene } from '../types/creative';
import { createTrustedCubeScene, type Trusted3DArtifact } from './TrustedCubeSceneAdapter';

const MAX_BYTES = 128 * 1024;
const O_NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0;
const VALID = /^[A-Za-z0-9_.:-]{1,120}$/;
const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
export interface Trusted3DInspectIdentity { projectId: string; taskId: string; requestId: string; }
export type Trusted3DInspection = { success: true; assetId: string; scene: Mio3DScene; verified: true } |
  { success: false; error: string };
function safeDirectory(directory: string): void {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('TRUSTED_3D_DIRECTORY_UNSAFE');
}
export function inspectTrustedCubeArtifact(userDataRoot: string, identity: Trusted3DInspectIdentity): Trusted3DInspection {
  if (!path.isAbsolute(userDataRoot) || !identity || ![identity.projectId, identity.taskId, identity.requestId].every(v => typeof v === 'string' && VALID.test(v)))
    return { success: false, error: 'TRUSTED_3D_INSPECTION_INVALID' };
  try {
    safeDirectory(userDataRoot);
    const store = path.join(userDataRoot, 'mio-trusted-3d-v1');
    safeDirectory(store);
    const folder = path.join(store, digest(identity.projectId));
    safeDirectory(folder);
    const recordId = digest(JSON.stringify([identity.projectId, identity.taskId, identity.requestId, 'primitive_cube_v1']));
    const filename = path.join(folder, recordId + '.mio3d.json');
    const handle = fs.openSync(filename, fs.constants.O_RDONLY | O_NOFOLLOW);
    let raw: string;
    try {
      const stat = fs.fstatSync(handle);
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_BYTES) throw Error('TRUSTED_3D_SIZE_INVALID');
      raw = fs.readFileSync(handle, 'utf8');
      if (Buffer.byteLength(raw, 'utf8') !== stat.size) throw Error('TRUSTED_3D_SIZE_CHANGED');
    } finally { fs.closeSync(handle); }
    const artifact = JSON.parse(raw) as Trusted3DArtifact;
    const assetId = 'scene_' + recordId.slice(0, 32);
    if (!artifact || artifact.kind !== 'MIO_TRUSTED_3D_SCENE_V1' || artifact.schemaVersion !== 1 ||
        artifact.templateId !== 'primitive_cube_v1' || artifact.projectId !== identity.projectId ||
        artifact.taskId !== identity.taskId || artifact.requestId !== identity.requestId || artifact.assetId !== assetId)
      throw Error('TRUSTED_3D_IDENTITY_MISMATCH');
    // This first template has exactly one canonical scene; arbitrary JSON scene replacement is not trusted.
    if (JSON.stringify(artifact.scene) !== JSON.stringify(createTrustedCubeScene()))
      throw Error('TRUSTED_3D_GEOMETRY_MISMATCH');
    return { success: true, assetId, scene: structuredClone(artifact.scene), verified: true };
  } catch {
    return { success: false, error: 'TRUSTED_3D_NOT_FOUND_OR_REVIEW_REQUIRED' };
  }
}
