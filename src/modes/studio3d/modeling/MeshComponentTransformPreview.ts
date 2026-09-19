import type { MioMeshData, MioMeshSelection } from '../../../types/creative';
import { translateMeshSelection } from './MeshOperations';
import { rotateMeshSelection, scaleMeshSelection } from './MeshTransformOperations';

export type ComponentGizmoMode = 'move' | 'rotate' | 'scale';

export interface ComponentGizmoPose {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export const applyComponentGizmoPreview = (
  mesh: MioMeshData,
  selection: MioMeshSelection,
  mode: ComponentGizmoMode,
  pivot: [number, number, number],
  pose: ComponentGizmoPose,
): MioMeshData => {
  if (mode === 'move') {
    return translateMeshSelection(mesh, selection, [
      pose.position[0] - pivot[0],
      pose.position[1] - pivot[1],
      pose.position[2] - pivot[2],
    ]);
  }
  if (mode === 'rotate') return rotateMeshSelection(mesh, selection, pose.rotation);
  return scaleMeshSelection(mesh, selection, pose.scale);
};

export const identityComponentGizmoPose = (pivot: [number, number, number]): ComponentGizmoPose => ({
  position: [...pivot],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
});
