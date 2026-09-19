import {
  BufferGeometry,
  Float32BufferAttribute,
} from 'three';
import type { MioMeshData, MioMeshSelection } from '../../../types/creative';
import { deriveMeshEdges } from './MeshTopology';

const vertexMap = (mesh: MioMeshData) => new Map(mesh.vertices.map((vertex) => [vertex.id, vertex.position]));

export const buildVertexOverlayPositions = (mesh: MioMeshData): number[] =>
  mesh.vertices.flatMap((vertex) => vertex.position);

export const buildEdgeOverlayPositions = (mesh: MioMeshData): number[] => {
  const vertices = vertexMap(mesh);
  return deriveMeshEdges(mesh).flatMap((edge) => {
    const a = vertices.get(edge.vertexIds[0]);
    const b = vertices.get(edge.vertexIds[1]);
    return a && b ? [...a, ...b] : [];
  });
};

export const buildSelectedFaceOverlayGeometry = (mesh: MioMeshData, selection: MioMeshSelection): BufferGeometry => {
  const vertices = vertexMap(mesh);
  const positions: number[] = [];
  const selected = new Set(selection.faceIds);
  for (const face of mesh.faces) {
    if (!selected.has(face.id)) continue;
    for (let index = 1; index < face.vertexIds.length - 1; index += 1) {
      for (const vertexId of [face.vertexIds[0], face.vertexIds[index], face.vertexIds[index + 1]]) {
        const position = vertices.get(vertexId);
        if (position) positions.push(...position);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geometry;
};
