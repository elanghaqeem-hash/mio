import {
  BufferGeometry,
  Float32BufferAttribute,
} from 'three';
import type { MioMeshData } from '../../../types/creative';
import { validateMeshTopology } from './MeshTopology';

export interface MeshTriangle {
  faceId: string;
  vertexIds: [string, string, string];
}

export interface MeshGeometryProjection {
  geometry: BufferGeometry;
  triangles: MeshTriangle[];
  triangleFaceIds: string[];
}

export const triangulateMeshFaces = (mesh: MioMeshData): MeshTriangle[] => {
  const validation = validateMeshTopology(mesh);
  if (!validation.valid) throw new Error(`Cannot project invalid mesh: ${validation.errors.join(' ')}`);
  const triangles: MeshTriangle[] = [];
  for (const face of mesh.faces) {
    for (let index = 1; index < face.vertexIds.length - 1; index += 1) {
      triangles.push({
        faceId: face.id,
        vertexIds: [face.vertexIds[0], face.vertexIds[index], face.vertexIds[index + 1]],
      });
    }
  }
  return triangles;
};

export const projectMeshToBufferGeometry = (mesh: MioMeshData): MeshGeometryProjection => {
  const vertexById = new Map(mesh.vertices.map((vertex) => [vertex.id, vertex]));
  const triangles = triangulateMeshFaces(mesh);
  const positions: number[] = [];
  const textureCoordinates: number[] = [];
  const faceById = new Map(mesh.faces.map((face) => [face.id, face] as const));
  const hasCompleteUVs = mesh.faces.length > 0 && mesh.faces.every((face) => face.uvs?.length === face.vertexIds.length);
  for (const triangle of triangles) {
    for (const vertexId of triangle.vertexIds) {
      const vertex = vertexById.get(vertexId);
      if (!vertex) throw new Error(`Triangle references missing vertex ${vertexId}.`);
      positions.push(...vertex.position);
      if (hasCompleteUVs) {
        const face = faceById.get(triangle.faceId);
        const cornerIndex = face?.vertexIds.indexOf(vertexId) ?? -1;
        const uv = cornerIndex >= 0 ? face?.uvs?.[cornerIndex] : undefined;
        if (!uv) throw new Error(`Complete UV projection is missing corner data for face ${triangle.faceId}.`);
        textureCoordinates.push(...uv);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  if (hasCompleteUVs) geometry.setAttribute('uv', new Float32BufferAttribute(textureCoordinates, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return {
    geometry,
    triangles,
    triangleFaceIds: triangles.map((triangle) => triangle.faceId),
  };
};

export const faceIdFromTriangleIndex = (projection: MeshGeometryProjection, triangleIndex: number): string | null =>
  projection.triangleFaceIds[triangleIndex] ?? null;
