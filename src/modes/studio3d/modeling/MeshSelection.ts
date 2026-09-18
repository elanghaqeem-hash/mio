import type { MioMeshSelection } from '../../../types/creative';

export const toggleFaceSelection = (
  selection: MioMeshSelection,
  faceId: string,
  additive: boolean,
): MioMeshSelection => {
  if (!additive) return { mode: 'face', vertexIds: [], edgeIds: [], faceIds: [faceId] };
  const exists = selection.faceIds.includes(faceId);
  return {
    mode: 'face',
    vertexIds: [],
    edgeIds: [],
    faceIds: exists ? selection.faceIds.filter((id) => id !== faceId) : [...selection.faceIds, faceId],
  };
};

export const clearMeshSelection = (mode: MioMeshSelection['mode']): MioMeshSelection => ({
  mode,
  vertexIds: [],
  edgeIds: [],
  faceIds: [],
});
