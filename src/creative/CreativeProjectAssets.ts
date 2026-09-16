import type { ProjectAsset, AssetType } from '../types/project';
import type { CreativeDocument, CreativeDocumentKind } from '../types/creativeDocument';

export const CREATIVE_ASSET_TYPES: readonly AssetType[] = ['3d', 'animation', 'graphic', 'drawing', 'photo', 'motion-2d', 'sfx', 'music'] as const;

export const creativeAssetTypeForKind = (kind: CreativeDocumentKind): AssetType => kind;

export const creativeDocumentKindForAssetType = (type: AssetType): CreativeDocumentKind | null =>
  CREATIVE_ASSET_TYPES.includes(type) ? type as CreativeDocumentKind : null;

export const isCreativeProjectAsset = (asset: ProjectAsset): boolean => creativeDocumentKindForAssetType(asset.type) !== null;

export const isAssetCompatibleWithDocument = (asset: ProjectAsset, kind: CreativeDocumentKind): boolean => asset.type === creativeAssetTypeForKind(kind);

export interface CreativeProjectSnapshotInput {
  name: string;
  type: AssetType;
  origin: 'USER-EDITED';
  filePath: string;
  data: unknown;
  verified: true;
  notes: string;
}

export const createCreativeProjectSnapshotInput = <T>(document: Pick<CreativeDocument, 'name' | 'kind' | 'revision'>, state: T, now = Date.now()): CreativeProjectSnapshotInput => ({
  name: `${document.name} · R${document.revision} · ${new Date(now).toISOString().slice(0, 19).replace('T', ' ')}`,
  type: creativeAssetTypeForKind(document.kind),
  origin: 'USER-EDITED',
  filePath: `CREATIVE/${document.kind}/${document.name}-r${document.revision}-${now}`,
  data: structuredClone(state),
  verified: true,
  notes: `Snapshot from Mio Creative Engine ${document.kind} document at revision ${document.revision}.`,
});

export const sortCreativeAssetsNewestFirst = (assets: ProjectAsset[]): ProjectAsset[] =>
  assets.filter(isCreativeProjectAsset).slice().sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
