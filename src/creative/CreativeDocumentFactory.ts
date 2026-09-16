import { CREATIVE_DOCUMENT_SCHEMA_VERSION, type CreativeDocument, type CreativeDocumentKind, type CreativeNode, type CreativeTimelineModel } from '../types/creativeDocument';

const extensionKinds: Record<string, CreativeDocumentKind> = {
  mio3d: '3d',
  mioanim: 'animation',
  mioart: 'graphic',
  miosfx: 'sfx',
  miomusic: 'music',
  miomotion: 'motion-2d',
  miodraw: 'drawing',
  miophoto: 'photo',
};

const safeRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const nodeFromLegacy = (value: unknown, fallbackId: string, type: string): CreativeNode => {
  const properties = safeRecord(value);
  const id = typeof properties.id === 'string' && properties.id ? properties.id : fallbackId;
  const name = typeof properties.name === 'string' && properties.name ? properties.name : id;
  return { id, type, name, parentId: null, childIds: [], visible: properties.visible !== false, locked: properties.locked === true, properties };
};

const legacyCollection = (data: Record<string, unknown>, key: string): unknown[] => Array.isArray(data[key]) ? data[key] : [];

const timelineFromLegacy = (data: Record<string, unknown>): CreativeTimelineModel | undefined => {
  const tracks = legacyCollection(data, 'tracks').map((candidate, index) => {
    const track = safeRecord(candidate);
    return {
      id: typeof track.id === 'string' ? track.id : `track_${index + 1}`,
      nodeId: typeof track.targetObjectId === 'string' ? track.targetObjectId : typeof track.nodeId === 'string' ? track.nodeId : `track_${index + 1}`,
      property: typeof track.property === 'string' ? track.property : 'value',
      keyframes: legacyCollection(track, 'keyframes').map((candidateKeyframe, keyframeIndex) => {
        const keyframe = safeRecord(candidateKeyframe);
        return {
          id: typeof keyframe.id === 'string' ? keyframe.id : `key_${index + 1}_${keyframeIndex + 1}`,
          time: typeof keyframe.time === 'number' ? keyframe.time : 0,
          value: keyframe.value,
          interpolation: ['linear', 'easeIn', 'easeOut', 'easeInOut', 'step', 'bezier'].includes(String(keyframe.interpolation))
            ? keyframe.interpolation as 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'step' | 'bezier'
            : 'linear' as const,
        };
      }),
    };
  });
  if (!tracks.length && typeof data.duration !== 'number') return undefined;
  return {
    duration: typeof data.duration === 'number' ? data.duration : 5,
    fps: typeof data.fps === 'number' ? data.fps : 60,
    currentTime: typeof data.currentTime === 'number' ? data.currentTime : 0,
    loop: data.loop !== false,
    tracks,
  };
};

export const createCreativeDocument = (kind: CreativeDocumentKind, name: string, now = Date.now(), id = `creative_${now}`): CreativeDocument => ({
  schemaVersion: CREATIVE_DOCUMENT_SCHEMA_VERSION,
  id,
  kind,
  name,
  createdAt: now,
  updatedAt: now,
  revision: 0,
  rootNodeIds: [],
  nodes: {},
  assets: {},
  selection: { nodeIds: [], primaryNodeId: null },
  timeline: kind === 'animation' || kind === 'motion-2d' ? { duration: 5, fps: 60, currentTime: 0, loop: true, tracks: [] } : undefined,
  metadata: {},
  operations: [],
});

export const inferCreativeDocumentKind = (fileName: string): CreativeDocumentKind | null => {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return extensionKinds[extension] ?? null;
};

export const createCreativeWorkspaceId = (fileName: string): string => {
  let hash = 2166136261;
  for (const character of fileName.toLowerCase()) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `creative_workspace_${(hash >>> 0).toString(36)}`;
};

export const migrateLegacyCreativeDocument = (fileName: string, legacyData: unknown, now = Date.now(), documentId = `creative_${inferCreativeDocumentKind(fileName)}_${now}`): CreativeDocument => {
  const kind = inferCreativeDocumentKind(fileName);
  if (!kind) throw new Error(`Unsupported legacy creative format: ${fileName}`);
  const data = safeRecord(legacyData);
  const document = createCreativeDocument(kind, fileName.replace(/\.[^.]+$/, ''), now, documentId);
  const collectionKey = kind === '3d' ? 'objects' : kind === 'graphic' ? 'layers' : kind === 'sfx' ? 'layers' : kind === 'music' ? 'tracks' : kind === 'animation' ? 'tracks' : 'layers';
  const nodeType = kind === '3d' ? 'object-3d' : kind === 'graphic' ? 'graphic-layer' : kind === 'sfx' ? 'audio-layer' : kind === 'music' ? 'music-track' : kind === 'animation' ? 'animation-track' : `${kind}-layer`;
  const nodes = legacyCollection(data, collectionKey).map((value, index) => nodeFromLegacy(value, `${kind}_node_${index + 1}`, nodeType));
  for (const node of nodes) document.nodes[node.id] = node;
  document.rootNodeIds = nodes.map((node) => node.id);
  document.selection = { nodeIds: nodes[0] ? [nodes[0].id] : [], primaryNodeId: nodes[0]?.id ?? null };
  document.timeline = kind === 'animation' || kind === 'motion-2d' ? timelineFromLegacy(data) : document.timeline;
  document.metadata = {
    legacyFormat: `.${fileName.split('.').pop()?.toLowerCase()}`,
    legacyFileName: fileName,
    legacyManagedNodeIds: [...document.rootNodeIds],
    legacyData: data,
  };
  document.operations.push({
    id: `op_migration_${now}`,
    timestamp: now,
    actor: 'system',
    action: 'migration',
    command: { type: 'document.update', changes: { metadata: document.metadata } },
    revision: 0,
  });
  return document;
};
