/**
 * PRV-10.06l — trusted Node 3D cube template adapter.
 * An actual validated Mio3DScene is written to a private project-scoped file.
 * Never expose this module, its filesystem root, or its callbacks to renderer IPC.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Mio3DScene, Mio3DObject } from '../types/creative';
import { createCubeMesh, validateMeshTopology } from '../modes/studio3d/modeling/MeshTopology';
import { diagnoseMeshTopology } from '../modes/studio3d/modeling/MeshTopologyDiagnostics';
import type { TrustedCreativeAdapter, TrustedCreativeCommand } from './TrustedNodeCreativeExecutor';

const TEMPLATE = 'primitive_cube_v1';
const O_NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0;
const SHA = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const error = (code: string): never => { throw new Error(code); };

export interface Trusted3DArtifact {
  schemaVersion: 1;
  kind: 'MIO_TRUSTED_3D_SCENE_V1';
  projectId: string;
  taskId: string;
  requestId: string;
  templateId: typeof TEMPLATE;
  assetId: string;
  scene: Mio3DScene;
}

/** Pure 3D generation from Mio's real mesh kernel, not a mocked placeholder. */
export function createTrustedCubeScene(): Mio3DScene {
  const mesh = createCubeMesh();
  const validation = validateMeshTopology(mesh);
  const diagnostics = diagnoseMeshTopology(mesh);
  if (!validation.valid || diagnostics.nonManifoldEdgeIds.length || diagnostics.zeroAreaFaceIds.length ||
      diagnostics.inconsistentWindingEdgeIds.length || diagnostics.duplicateFaceGroups.length ||
      diagnostics.isolatedVertexIds.length) error('TRUSTED_3D_GEOMETRY_INVALID');
  const cube: Mio3DObject = {
    id: 'trusted_cube', name: 'Trusted Cube', type: 'cube',
    position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
    color: '#468FE8', metalness: 0.15, roughness: 0.62, wireframe: false, mesh,
  };
  return {
    objects: [cube],
    camera: { position: [3, 3, 5], fov: 50 },
    lights: { ambientColor: '#FFFFFF', ambientIntensity: 0.65, directionalColor: '#FFFFFF', directionalIntensity: 1 },
  };
}

function assertSafeFolder(directory: string): void {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) error('TRUSTED_3D_DIRECTORY_UNSAFE');
}

/**
 * Approval is an injected privileged callback; this class intentionally does
 * not silently approve the command or accept a renderer-supplied approval flag.
 */
export class TrustedCubeSceneAdapter implements TrustedCreativeAdapter {
  private readonly directory: string;
  constructor(
    trustedUserDataRoot: string,
    private readonly requireApproval: (command: TrustedCreativeCommand) => Promise<boolean>,
  ) {
    if (!path.isAbsolute(trustedUserDataRoot)) error('TRUSTED_3D_ROOT_INVALID');
    assertSafeFolder(trustedUserDataRoot);
    this.directory = path.join(trustedUserDataRoot, 'mio-trusted-3d-v1');
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    assertSafeFolder(this.directory);
  }
  async authorize(command: TrustedCreativeCommand): Promise<boolean> {
    if (command.mode !== '3D' || command.templateId !== TEMPLATE) return false;
    return (await this.requireApproval(command)) === true;
  }
  async execute(command: TrustedCreativeCommand): Promise<{ assetId: string }> {
    // Defense in depth. The gate must already hold a durable execution checkpoint.
    if (command.mode !== '3D' || command.templateId !== TEMPLATE) error('TRUSTED_3D_TEMPLATE_UNAVAILABLE');
    const identity = JSON.stringify([command.projectId, command.taskId, command.requestId, command.templateId]);
    const digest = SHA(identity);
    const assetId = 'scene_' + digest.slice(0, 32);
    const artifact: Trusted3DArtifact = {
      schemaVersion: 1, kind: 'MIO_TRUSTED_3D_SCENE_V1',
      projectId: command.projectId, taskId: command.taskId,
      requestId: command.requestId, templateId: TEMPLATE, assetId,
      scene: createTrustedCubeScene(),
    };
    const folder = path.join(this.directory, SHA(command.projectId));
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    assertSafeFolder(folder);
    const target = path.join(folder, digest + '.mio3d.json');
    // A pre-existing artifact must never be overwritten or presented as a new effect.
    const bytes = Buffer.from(JSON.stringify(artifact), 'utf8');
    let handle: number;
    try {
      handle = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW, 0o600);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'EEXIST') error('TRUSTED_3D_ASSET_ALREADY_EXISTS_REVIEW_REQUIRED');
      throw cause;
    }
    try {
      fs.writeFileSync(handle, bytes);
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    const dir = fs.openSync(folder, fs.constants.O_RDONLY | O_NOFOLLOW);
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
    // Existence and exact content validated after write; failure remains ambiguous.
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== bytes.length) error('TRUSTED_3D_PERSISTENCE_UNCERTAIN');
    return { assetId };
  }
}
